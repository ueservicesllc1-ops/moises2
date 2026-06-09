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
    get_model('htdemucs_ft')   # Modelo Fine-Tuned para Multitrack (Bajo/Batería excelente)

    print("Pre-descargando modelo Roformer (MVSep) para Voz...")
    try:
        from audio_separator.separator import Separator
        sep = Separator()
        # Descarga el modelo de ViperX (SDR 12.9755) considerado el mejor para Voz/Instrumental
        sep.load_model("model_bs_roformer_ep_317_sdr_12.9755.ckpt")
    except Exception as e:
        print(f"Error pre-descargando Roformer: {e}")

# 1. Definimos el ADN de nuestro servidor virtual
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "setuptools",
        "torch",
        "torchaudio",
        "demucs",
        "soundfile",
        "librosa",
        "numpy",
        "scipy",   # Para spectral smoothing en HiFi
        "diffq",   # Requerido por mdx_extra_q para deserializar el modelo
        "audio-separator[gpu]" # Para integrar MVSep Roformer Models
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
    canonical_bpm: float | None = None,
):
    import torch
    import numpy as np
    import tempfile
    import soundfile as sf
    import librosa
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

    def build_click_track_bytes(
        source_audio: np.ndarray,
        sr: int,
        output_subtype: str,
        bpm_hint: float | None = None,
    ) -> tuple[bytes, int]:
        """
        Click alineado a onsets del stem fuente. Si bpm_hint (BPM del mix original,
        estimado en el API antes de Modal) es válido, se usa como semilla fuerte para
        beat_track y para resolver ambigüedades de doble tempo.
        """
        if source_audio.ndim == 2:
            mono = source_audio.mean(axis=1)
        else:
            mono = source_audio
        mono = np.asarray(mono, dtype=np.float32).reshape(-1)
        if mono.size == 0:
            raise RuntimeError("Audio vacío para generar click")

        click_dur = 0.05
        t = np.linspace(0, click_dur, int(sr * click_dur), endpoint=False)
        click_wave = np.sin(2 * np.pi * 1000 * t) + 0.5 * np.sin(2 * np.pi * 2000 * t)
        envelope = np.exp(-t * 200)
        custom_click = click_wave * envelope
        custom_click = (custom_click / np.max(np.abs(custom_click))) * 0.8

        click_kwargs = {"sr": sr, "length": len(mono), "click": custom_click}
        bpm_used = 120
        start_bpm = 120.0
        if bpm_hint is not None and np.isfinite(float(bpm_hint)):
            bh = float(bpm_hint)
            if 40.0 <= bh <= 240.0:
                start_bpm = bh
        try:
            onset_env = librosa.onset.onset_strength(y=mono, sr=sr)
            tempo, beat_frames = librosa.beat.beat_track(
                onset_envelope=onset_env,
                sr=sr,
                start_bpm=start_bpm,
                std_bpm=1.0,
                tightness=110,
            )
            tempo_arr = np.asarray(tempo).reshape(-1)
            detected = (
                int(round(float(tempo_arr[0])))
                if tempo_arr.size > 0
                else int(round(start_bpm))
            )
            beat_frames = np.asarray(beat_frames, dtype=int).reshape(-1)
            if beat_frames.size == 0:
                raise RuntimeError("No beat frames detected")

            if bpm_hint is not None and np.isfinite(float(bpm_hint)):
                bh = float(max(40.0, min(240.0, float(bpm_hint))))
                if abs(float(detected) - bh) > 20:
                    bpm_used = int(round(bh))
                else:
                    bpm_used = int(round(0.58 * bh + 0.42 * float(detected)))
            else:
                bpm_used = detected

            clicks = librosa.clicks(frames=beat_frames, **click_kwargs)
        except Exception as beat_error:
            print(f"[MODAL GPU] Click fallback rejilla fija: {beat_error}")
            steady = float(start_bpm)
            bpm_used = int(round(max(40.0, min(240.0, steady))))
            period = 60.0 / max(float(bpm_used), 1e-6)
            dur_sec = float(len(mono)) / float(sr)
            times = np.arange(0.0, max(dur_sec, period * 2), period, dtype=float)
            clicks = librosa.clicks(times=times, **click_kwargs)

        buf = io.BytesIO()
        sf.write(buf, clicks, sr, format='WAV', subtype=output_subtype)
        bpm_used = max(40, min(240, bpm_used))
        return buf.getvalue(), int(bpm_used)

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
        # LÓGICA DE SELECCIÓN DE MODELOS — INTELIGENTE Y DINÁMICA
        # =====================================================================

        needs_6s_stems = any(t in requested_tracks for t in ["guitar", "piano"])
        is_vocals_only = all(t in ["vocals", "instrumental"] for t in requested_tracks)

        if needs_6s_stems:
            # Si piden 6 pistas (Guitarra/Piano), usamos el modelo especializado 6s
            primary_model_name = "htdemucs_6s"
            profile_settings = {
                "fast":         {"shifts": 1, "overlap": 0.10},
                "pro_balanced": {"shifts": 3, "overlap": 0.25},
                "hifi":         {"shifts": 6, "overlap": 0.50},
            }
        elif is_vocals_only:
            # Para Solo Voz y Pista: MDX Extra es considerado el más "pro" para Vocales Cristalinas
            if profile_name == "fast":
                primary_model_name = "mdx_extra_q"
            else:
                primary_model_name = "mdx_extra"
            profile_settings = {
                "fast":         {"shifts": 1, "overlap": 0.10},
                "pro_balanced": {"shifts": 3, "overlap": 0.25},
                "hifi":         {"shifts": 6, "overlap": 0.50},
            }
        else:
            primary_model_name = "htdemucs_ft"
            profile_settings = {
                "fast":         {"shifts": 1, "overlap": 0.10},
                "pro_balanced": {"shifts": 3, "overlap": 0.25},
                "hifi":         {"shifts": 8, "overlap": 0.50},
            }

        # =====================================================================
        # LÓGICA DE INFERENCIA HÍBRIDA (ROFORMER + DEMUCS)
        # =====================================================================
        
        final_stems_real_cpu = {}
        samplerate_export = sr
        
        shifts_amt = profile_settings.get(profile_name, {"shifts": 3})["shifts"]
        overlap_amt = profile_settings.get(profile_name, {"overlap": 0.25})["overlap"]

        if is_vocals_only or needs_6s_stems:
            print(f"[MODAL GPU] === MODO ROFORMER INICIADO (Vocals_only={is_vocals_only}, 6_stems={needs_6s_stems}) ===")
            from audio_separator.separator import Separator
            
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
                sf.write(tmp_in.name, wav_numpy, sr)
                input_path = tmp_in.name
            
            output_dir = tempfile.mkdtemp()
            
            sep = Separator(
                output_dir=output_dir,
                output_format="WAV",
                use_autocast=True, 
                log_level="DEBUG" # Para verificar que cargue CUDAExecutionProvider
            )
            sep.load_model("model_bs_roformer_ep_317_sdr_12.9755.ckpt")
            
            print("[MODAL GPU] Extrayendo Voz (Roformer ViperX)...")
            output_paths = sep.separate(input_path)
            print(f"[MODAL GPU] BS-Roformer completado. Archivos: {output_paths}")
            
            for out_file in output_paths:
                full_path = os.path.join(output_dir, out_file)
                stem_audio, stem_sr = sf.read(full_path, dtype='float32')
                samplerate_export = stem_sr
                
                if "Vocals" in out_file or "vocals" in out_file.lower():
                    final_stems_real_cpu["vocals"] = stem_audio
                else:
                    final_stems_real_cpu["instrumental"] = stem_audio
                    
            # Cleanup temp files
            os.remove(input_path)
            for out_file in output_paths:
                os.remove(os.path.join(output_dir, out_file))
            os.rmdir(output_dir)
            torch.cuda.empty_cache()
            
            if needs_6s_stems:
                print("[MODAL GPU] === MODO 6-STEMS: ALIMENTANDO INSTRUMENTAL LIMPIO A DEMUCS 6S ===")
                
                inst_np = final_stems_real_cpu["instrumental"]
                if len(inst_np.shape) == 1:
                    inst_np = inst_np.reshape(-1, 1)
                    
                # [channels, samples]
                inst_tensor = torch.from_numpy(inst_np).transpose(0, 1).cuda() 
                
                def local_inference(m, audio, sh, ov):
                    from demucs.apply import apply_model
                    return apply_model(m, audio[None], shifts=sh, split=True, overlap=ov, progress=True)[0]
                
                # --- Demucs 6s (Todos los instrumentos restantes) ---
                print("[MODAL GPU] Paso 2: Ejecutando htdemucs_6s sobre el Instrumental...")
                model_6s = get_model("htdemucs_6s").cuda().eval()
                
                wav_proc_6s = convert_audio(inst_tensor, samplerate_export, model_6s.samplerate, model_6s.audio_channels)
                ref_6s = wav_proc_6s.mean(0)
                ref_mean_6s = ref_6s.mean()
                ref_std_6s = ref_6s.std()
                wav_proc_std_6s = (wav_proc_6s - ref_mean_6s) / (ref_std_6s + 1e-8)
                
                sources_std_6s = local_inference(model_6s, wav_proc_std_6s, shifts_amt, overlap_amt)
                for idx, name in enumerate(model_6s.sources):
                    if name in ["drums", "bass", "guitar", "piano", "other"]:  
                        stem_real = sources_std_6s[idx] * (ref_std_6s + 1e-8) + ref_mean_6s
                        final_stems_real_cpu[name] = stem_real.cpu().numpy().T
                
                del model_6s, wav_proc_6s, wav_proc_std_6s, sources_std_6s, inst_tensor
                torch.cuda.empty_cache()
            
        else:
            # --- MODO NORMAL (Sin Ensemble) ---
            cfg = profile_settings.get(profile_name, profile_settings.get("pro_balanced", {"shifts": 3, "overlap": 0.25}))
            shifts_amt = cfg["shifts"]
            overlap_amt = cfg["overlap"]
            
            print(f"[MODAL GPU] Modelo principal: {primary_model_name}")
            print(f"[MODAL GPU] Ejecutando separación principal ({shifts_amt} shifts)...")
            
            model = get_model(primary_model_name)
            model.cuda()
            model.eval()

            wav_proc = convert_audio(wav_orig, sr, model.samplerate, model.audio_channels).cuda()
            ref = wav_proc.mean(0)
            ref_mean = ref.mean()
            ref_std = ref.std()
            wav_proc_std = (wav_proc - ref_mean) / (ref_std + 1e-8)

            sources_std = model_inference(model, wav_proc_std, shifts_amt, overlap_amt)
            
            for idx, name in enumerate(model.sources):
                stem_real = sources_std[idx] * (ref_std + 1e-8) + ref_mean
                final_stems_real_cpu[name] = stem_real.cpu().numpy().T
                
            samplerate_export = model.samplerate
            del model, wav_proc, wav_proc_std, sources_std
            torch.cuda.empty_cache()

        # =====================================================================
        # EXPORTAR STEMS
        # =====================================================================

        # Formato de salida por perfil
        if profile_name == "hifi":
            output_subtype = "PCM_24"   # 24-bit WAV
            noise_gate_ratio = 0.0      # Desactivado: estaba matando detalles
            peak_target = 0.95          
        else:
            output_subtype = "PCM_16"   # 16-bit WAV estándar
            noise_gate_ratio = 0.0      
            peak_target = 0.98

        stems_bytes = {}

        print(f"[MODAL GPU] Exportando stems ({output_subtype}, peak={peak_target})...")

        for stem_name, stem_audio in final_stems_real_cpu.items():
            if stem_name not in requested_tracks and stem_name != "vocals":
                # Mantenemos las no solicitadas SOLO SI las necesitamos para construir la pista instrumental
                if not ("instrumental" in requested_tracks):
                    continue

            # Post-procesamiento
            if noise_gate_ratio > 0:
                stem_audio = reduce_low_level_noise(stem_audio, threshold_ratio=noise_gate_ratio)
            stem_audio = normalize_audio(stem_audio, peak_target=peak_target)

            if stem_name in requested_tracks:
                buf = io.BytesIO()
                sf.write(buf, stem_audio, samplerate_export, format='WAV', subtype=output_subtype)
                stems_bytes[stem_name] = buf.getvalue()
                print(f"[MODAL GPU]   OK {stem_name} -> {len(stems_bytes[stem_name]) // 1024}KB ({output_subtype})")

        # =====================================================================
        # CONSTRUIR INSTRUMENTAL (suma de stems no-vocales)
        # =====================================================================

        if "instrumental" in requested_tracks and "vocals" in final_stems_real_cpu:
            non_vocal_names = [k for k in final_stems_real_cpu.keys() if k != "vocals"]
            if len(non_vocal_names) > 0:
                print("[MODAL GPU] Construyendo instrumental desde stems no-vocales...")
                instrumental_audio = np.zeros_like(final_stems_real_cpu["vocals"])
                for stem_name in non_vocal_names:
                    stem = final_stems_real_cpu[stem_name]
                    if stem.shape == instrumental_audio.shape:
                        instrumental_audio += stem
                    else:
                        min_len = min(stem.shape[0], instrumental_audio.shape[0])
                        instrumental_audio[:min_len] += stem[:min_len]
                        
                if noise_gate_ratio > 0:
                    instrumental_audio = reduce_low_level_noise(instrumental_audio, threshold_ratio=noise_gate_ratio)
                instrumental_audio = normalize_audio(instrumental_audio, peak_target=peak_target)

                buf = io.BytesIO()
                sf.write(buf, instrumental_audio, samplerate_export, format='WAV', subtype=output_subtype)
                stems_bytes["instrumental"] = buf.getvalue()
                print(f"[MODAL GPU]   OK instrumental -> {len(stems_bytes['instrumental']) // 1024}KB ({output_subtype})")

        try:
            click_source = instrumental_audio if "instrumental_audio" in locals() else wav_numpy
            click_bytes, click_bpm = build_click_track_bytes(
                click_source,
                samplerate_export,
                output_subtype,
                bpm_hint=canonical_bpm,
            )
            click_key = f"click_{click_bpm}"
            stems_bytes[click_key] = click_bytes
            print(f"[MODAL GPU]   OK {click_key} -> {len(stems_bytes[click_key]) // 1024}KB ({output_subtype})")
        except Exception as click_error:
            print(f"[MODAL GPU] Error generando click: {click_error}")

        print(f"[MODAL GPU] ✅ Finalizado con éxito. {len(stems_bytes)} stems exportados.")
        return stems_bytes
