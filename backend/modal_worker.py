import modal
import io
import os

# Nombramos nuestra "máquina" en la nube
app = modal.App("moises-demucs-worker")

def download_models():
    """Descarga los modelos permanentemente en el disco de la nube durante la compilación"""
    from demucs.pretrained import get_model
    print("Pre-descargando Demucs Models (6s y FT) para evitar tiempos de espera...")
    get_model('htdemucs_6s')
    get_model('htdemucs_ft')

# 1. Definimos el ADN de nuestro servidor virtual
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "torch", 
        "torchaudio", 
        "demucs", 
        "soundfile", 
        "numpy"
    )
    .run_function(download_models)
)

# 2. Configuración de ejecución en GPU T4
@app.function(image=image, gpu="T4", timeout=600)
def separate_audio(audio_bytes: bytes, requested_tracks: list, is_hi_fi: bool):
    import torch
    import tempfile
    import soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    import subprocess
    
    print(f"[MODAL GPU] Nueva solicitud: {requested_tracks} (HiFi: {is_hi_fi})")

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_mp3 = os.path.join(tmp_dir, "input_audio.mp3")
        input_wav = os.path.join(tmp_dir, "input_audio.wav")
        with open(input_mp3, "wb") as f:
            f.write(audio_bytes)
            
        subprocess.run(["ffmpeg", "-y", "-i", input_mp3, input_wav], capture_output=True, check=True)
        
        wav_numpy, sr = sf.read(input_wav, dtype='float32')
        if len(wav_numpy.shape) == 1:
            wav_numpy = wav_numpy.reshape(-1, 1)
            
        wav = torch.from_numpy(wav_numpy).transpose(0, 1)
        
        # --- LÓGICA HÍBRIDA DE MODELOS ---
        # Si se pide guitarra o piano, usamos el modelo de 6 pistas.
        # Si solo se pide Voz/Pista o las 4 básicas, usamos htdemucs_ft (Fine-Tuned) que es superior en calidad.
        needs_6s = any(t in requested_tracks for t in ["guitar", "piano"])
        model_name = 'htdemucs_6s' if needs_6s else 'htdemucs_ft'
        
        print(f"[MODAL GPU] Seleccionado modelo: {model_name}")
        model = get_model(model_name)
        model.cuda()
        model.eval()

        wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
        wav = wav.cuda()
        
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()

        # Configuración HI-FI vinculada
        shifts_amt = 12 if is_hi_fi else 2
        overlap_amt = 0.75 if is_hi_fi else 0.25 # Overlap 0.75 en HiFi para máxima suavidad absoluta
        
        print(f"[MODAL GPU] Iniciando disección ⚡ (Shifts: {shifts_amt}, Overlap: {overlap_amt})")
        with torch.no_grad():
            sources = apply_model(
                model, 
                wav[None], 
                device='cuda', 
                shifts=shifts_amt, 
                split=True, 
                overlap=overlap_amt, 
                progress=True
            )[0]
        
        sources = sources * ref.std() + ref.mean()
        
        # Mapeo universal de stems
        stem_mapping = {
            "vocals": "vocals", 
            "drums": "drums", 
            "bass": "bass", 
            "other": "other",
            "guitar": "guitar", 
            "piano": "piano"
        }
        
        stems_bytes = {}
        for idx, stem_name in enumerate(model.sources):
            my_stem_name = stem_mapping.get(stem_name, stem_name)
            
            if my_stem_name in requested_tracks or (my_stem_name == "vocals" and "vocals" in requested_tracks):
                stem_audio = sources[idx].cpu().numpy().T
                buf = io.BytesIO()
                sf.write(buf, stem_audio, model.samplerate, format='WAV')
                stems_bytes[my_stem_name] = buf.getvalue()
        
        if "instrumental" in requested_tracks:
            combined_audio = None
            for idx, stem_name in enumerate(model.sources):
                if stem_name != "vocals":
                    audio = sources[idx].cpu().numpy().T
                    if combined_audio is None:
                        combined_audio = audio
                    else:
                        combined_audio += audio
            buf = io.BytesIO()
            sf.write(buf, combined_audio, model.samplerate, format='WAV')
            stems_bytes["instrumental"] = buf.getvalue()
            
        print(f"[MODAL GPU] Completado. Enviando {len(stems_bytes)} tracks.")    
        return stems_bytes
