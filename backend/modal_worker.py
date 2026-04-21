import modal
import io
import os

# Nombramos nuestra "máquina" en la nube
app = modal.App("moises-demucs-worker")

def download_models():
    """Descarga los modelos permanentemente en el disco de la nube durante la compilación"""
    from demucs.pretrained import get_model
    print("Pre-descargando Demucs MDX Suite y 6S...")
    get_model('mdx_extra_q')   # Modelo Quantizado (Comprimido) para cuentas GRATIS/Normales
    get_model('mdx_extra')     # Modelo Puro sin compresión para PRO/HiFi
    get_model('htdemucs_6s')   # Requerido ÚNICAMENTE cuando pidan separar Guitarra o Piano

# 1. Definimos el ADN de nuestro servidor virtual
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "torchaudio",
        "demucs",
        "soundfile",
        "numpy",
        "scipy",   # Para spectral smoothing en HiFi
        "diffq",   # Requerido por mdx_extra_q para deserializar el modelo
    )
    .run_function(download_models)
)

# Mismo volumen que modal_trainer: checkpoint fine-tuned en checkpoints/latest.th
finetune_volume = modal.Volume.from_name("zion-demucs-dataset", create_if_missing=True)

# 2. Configuración de ejecución en GPU A10G (Para aguantar las 6 pasadas HiFi)
@app.function(
    image=image,
    gpu="A10G",
    timeout=1200,
    volumes={"/finetuned": finetune_volume},
)
def separate_audio(
    audio_bytes: bytes,
    requested_tracks: list,
    is_hi_fi: bool,
    quality_profile: str = "pro_balanced",
):
    import torch
    import numpy as np
    import tempfile
    import soundfile as sf
    from pathlib import Path

    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    from demucs.states import load_model
    import subprocess

    # =========================================================================
    # UTILIDADES DE AUDIO
    # =========================================================================

    def normalize_audio(stem_audio: np.ndarray, peak_target: float = 0.98) -> np.ndarray:
        """
        Normalización conservadora:
        - NO empuja todo stem al mismo pico (eso altera balance tímbrico).
        - Solo atenúa si hay riesgo de clipping.
        """
        max_val = float(np.max(np.abs(stem_audio))) if stem_audio.size else 0.0
        if max_val > peak_target and max_val > 1e-8:
            stem_audio = stem_audio / max_val * peak_target
        return stem_audio

    def reduce_low_level_noise(stem_audio: np.ndarray, threshold_ratio: float = 0.012) -> np.ndarray:
        """Puerta de ruido suave — elimina señales bajo el umbral RMS."""
        if stem_audio.size == 0:
            return stem_audio
        rms = float(np.sqrt(np.mean(np.square(stem_audio))))
        if rms <= 0:
            return stem_audio
        gate_threshold = rms * threshold_ratio
        # Puerta suave: atenuar gradualmente en vez de corte abrupto
        mask = np.abs(stem_audio) / (gate_threshold + 1e-8)
        mask = np.clip(mask, 0.0, 1.0)
        return stem_audio * mask



    def model_inference(model, wav_proc_std, shifts_amt: int, overlap_amt: float):
        with torch.no_grad():
            return apply_model(
                model,
                wav_proc_std[None],
                device='cuda',
                shifts=shifts_amt,
                split=True,
                overlap=overlap_amt,
                progress=True
            )[0]

    # =========================================================================
    # INICIO DEL PROCESAMIENTO
    # =========================================================================

    profile_name = (quality_profile or "pro_balanced").lower()
    # Garantizar coherencia: si is_hi_fi=True pero el perfil no es "hifi", corregirlo
    if is_hi_fi and profile_name != "hifi":
        profile_name = "hifi"

    print(
        f"[MODAL GPU] Nueva solicitud: {requested_tracks} "
        f"(HiFi: {is_hi_fi}, Profile: {profile_name})"
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        # --- Convertir audio de entrada a WAV mono/stereo float32 ---
        input_file = os.path.join(tmp_dir, "input_audio.mp3")
        input_wav = os.path.join(tmp_dir, "input_audio.wav")
        with open(input_file, "wb") as f:
            f.write(audio_bytes)

        subprocess.run(
            ["ffmpeg", "-y", "-i", input_file, "-ar", "44100", "-ac", "2", input_wav],
            capture_output=True, check=True
        )

        wav_numpy, sr = sf.read(input_wav, dtype='float32')
        if len(wav_numpy.shape) == 1:
            wav_numpy = wav_numpy.reshape(-1, 1)

        wav_orig = torch.from_numpy(wav_numpy).transpose(0, 1)

        # =====================================================================
        # LÓGICA DE SELECCIÓN DE MODELOS — CORREGIDA
        #
        # htdemucs_ft  = Fine-Tuned Hybrid Demucs — el MEJOR modelo para
        #                separar vocals / drums / bass / other con alta limpieza.
        #                Es nuestro modelo PRINCIPAL para todos los modos.
        #
        # htdemucs_6s  = Hybrid Demucs 6-stem — diseñado para guitar y piano.
        #                Lo usamos como ENRIQUECEDOR en HiFi (ensemble secundario)
        #                porque aporta información armónica adicional en "other".
        #
        # Modo Fast / Normal: mdx_extra_q (Version comprimida, muy eficiente y suena a pista profesional)
        # Modo HiFi:          mdx_extra (Version pura), 2 shifts, 0.25 overlap
        #                     + salida 24-bit PCM
        # =====================================================================

        needs_6s_stems = any(t in requested_tracks for t in ["guitar", "piano"])

        # BUSCAR CONOCIMIENTO ENTRENADO (El trainer guarda epoch_020.pt)
        finetuned_ckpt = Path(os.environ.get("DEMUCS_FINETUNED_PATH", "/finetuned/checkpoints/epoch_020.pt"))
        use_finetuned = finetuned_ckpt.is_file()

        if use_finetuned:
            # SI HAY ENTRENAMIENTO: Usar nuestro cerebro personalizado
            primary_model_name = "finetuned_htdemucs"
            profile_settings = {
                "fast":         {"shifts": 1, "overlap": 0.20},
                "pro_balanced": {"shifts": 3, "overlap": 0.30},
                "hifi":         {"shifts": 5, "overlap": 0.40},
            }
        elif needs_6s_stems:
            # Si no hay entrenamiento pero piden 6 pistas, usar el estándar de 6s
            primary_model_name = "htdemucs_6s"
            profile_settings = {
                "fast":         {"shifts": 1, "overlap": 0.20},
                "pro_balanced": {"shifts": 3, "overlap": 0.30},
                "hifi":         {"shifts": 5, "overlap": 0.40},
            }
        else:
            # Para 4 pistas o menos, usar MDX (el más limpio para voces/batería estándar)
            if profile_name == "fast":
                primary_model_name = "mdx_extra_q"
            elif profile_name == "hifi":
                primary_model_name = "mdx_extra"     
            else:  # pro_balanced
                primary_model_name = "mdx_extra"

            # En MDX, overlap de 0 y shift de 0/1 es el estándar para q. Para HiFi inyectamos precision.
            profile_settings = {
                "fast":        {"shifts": 0, "overlap": 0.0},
                "pro_balanced": {"shifts": 3, "overlap": 0.25},
                "hifi":        {"shifts": 4, "overlap": 0.35},
            }

        cfg = profile_settings.get(profile_name, profile_settings["pro_balanced"])
        shifts_amt = cfg["shifts"]
        overlap_amt = cfg["overlap"]

        print(f"[MODAL GPU] Modelo principal: {primary_model_name}")
        print(f"[MODAL GPU] Inferencia: {shifts_amt} pasadas, {overlap_amt:.2f} solapamiento")

        # Cargar y correr modelo principal
        if use_finetuned:
            print(f"[MODAL GPU] Cargando fine-tune desde {finetuned_ckpt}")
            model = load_model(str(finetuned_ckpt), strict=False)
        else:
            model = get_model(primary_model_name)
        model.cuda()
        model.eval()

        wav_proc = convert_audio(wav_orig, sr, model.samplerate, model.audio_channels)
        wav_proc = wav_proc.cuda()

        # Normalización z-score para la IA (estándar de Demucs)
        ref = wav_proc.mean(0)
        ref_mean = ref.mean()
        ref_std = ref.std()
        wav_proc_std = (wav_proc - ref_mean) / (ref_std + 1e-8)

        print(f"[MODAL GPU] Ejecutando separación principal ({shifts_amt} shifts)...")
        sources_std = model_inference(model, wav_proc_std, shifts_amt, overlap_amt)

        # =====================================================================
        # ENSEMBLE HIFI — Enriquecimiento con htdemucs_6s
        #
        # Ratios de mezcla diseñados para MAXIMIZAR claridad sin phase issues:
        #   - vocals:  90% ft + 10% 6s  → mínima interferencia, máxima limpieza
        #   - drums:   85% ft + 15% 6s  → preservar la dinámica del ft
        #   - bass:    85% ft + 15% 6s  → ft tiene mejor separación de bajo
        #   - other:   65% ft + 35% 6s  → 6s aporta más contexto armónico aquí
        # =====================================================================

        source_to_idx_main = {name: idx for idx, name in enumerate(model.sources)}

        # =====================================================================
        # EXPORTAR STEMS
        # =====================================================================

        # Formato de salida por perfil
        # HiFi: 24-bit PCM (Calidad mastering, no desperdicia espacio en GPU)
        # Normal/Fast: 16-bit PCM (compatible, tamaño razonable)
        if profile_name == "hifi":
            output_subtype = "PCM_24"   # 24-bit WAV
            noise_gate_ratio = 0.0      # Desactivado: estaba matando detalles (metales/reverb) al entrar voz
            peak_target = 0.95          
        else:
            output_subtype = "PCM_16"   # 16-bit WAV estándar
            noise_gate_ratio = 0.0      # Desactivado por preservación instrumental
            peak_target = 0.98

        stems_bytes = {}
        vocals_idx = source_to_idx_main.get("vocals", -1)

        print(f"[MODAL GPU] Exportando stems ({output_subtype}, peak={peak_target})...")

        for idx, stem_name in enumerate(model.sources):
            if stem_name not in requested_tracks:
                continue

            # Deshacer normalización z-score → amplitud real
            stem_real = sources_std[idx] * (ref_std + 1e-8) + ref_mean
            stem_audio = stem_real.cpu().numpy().T  # [samples, channels]

            # Post-procesamiento
            if noise_gate_ratio > 0:
                stem_audio = reduce_low_level_noise(stem_audio, threshold_ratio=noise_gate_ratio)
            stem_audio = normalize_audio(stem_audio, peak_target=peak_target)

            buf = io.BytesIO()
            sf.write(buf, stem_audio, model.samplerate, format='WAV', subtype=output_subtype)
            stems_bytes[stem_name] = buf.getvalue()

            print(f"[MODAL GPU]   OK {stem_name} -> {len(stems_bytes[stem_name]) // 1024}KB ({output_subtype})")

        # =====================================================================
        # CONSTRUIR INSTRUMENTAL (suma de stems no-vocales)
        # =====================================================================

        if "instrumental" in requested_tracks and vocals_idx != -1:
            non_vocal_names = [name for name in model.sources if name != "vocals"]
            can_rebuild = all(name in source_to_idx_main for name in non_vocal_names) and len(non_vocal_names) > 0

            if can_rebuild:
                print("[MODAL GPU] Construyendo instrumental desde stems no-vocales...")
                instrumental_std = torch.zeros_like(sources_std[vocals_idx])
                for stem_name in non_vocal_names:
                    instrumental_std = instrumental_std + sources_std[source_to_idx_main[stem_name]]
            else:
                print("[MODAL GPU] Fallback: instrumental por sustracción...")
                instrumental_std = wav_proc_std - sources_std[vocals_idx]

            instrumental_real = instrumental_std * (ref_std + 1e-8) + ref_mean
            instrumental_audio = instrumental_real.cpu().numpy().T

            if noise_gate_ratio > 0:
                instrumental_audio = reduce_low_level_noise(instrumental_audio, threshold_ratio=noise_gate_ratio)
            instrumental_audio = normalize_audio(instrumental_audio, peak_target=peak_target)

            buf = io.BytesIO()
            sf.write(buf, instrumental_audio, model.samplerate, format='WAV', subtype=output_subtype)
            stems_bytes["instrumental"] = buf.getvalue()
            print(f"[MODAL GPU]   OK instrumental -> {len(stems_bytes['instrumental']) // 1024}KB ({output_subtype})")

        print(f"[MODAL GPU] ✅ Finalizado con éxito. {len(stems_bytes)} stems exportados.")
        return stems_bytes
