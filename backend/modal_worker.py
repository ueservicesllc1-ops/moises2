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

# 2. Configuración de ejecución en GPU T4 - Timeout de 20 min
@app.function(image=image, gpu="T4", timeout=1200)
def separate_audio(audio_bytes: bytes, requested_tracks: list, is_hi_fi: bool):
    import torch
    import numpy as np
    import tempfile
    import soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    import subprocess
    
    print(f"[MODAL GPU] Request: {requested_tracks} (HiFi: {is_hi_fi})")

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
        
        # --- LÓGICA HÍBRIDA ---
        needs_6s = any(t in requested_tracks for t in ["guitar", "piano"])
        model_name = 'htdemucs_6s' if needs_6s else 'htdemucs_ft'
        
        print(f"[MODAL GPU] Modelo: {model_name}")
        model = get_model(model_name)
        model.cuda()
        model.eval()

        wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
        wav = wav.cuda()
        
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()

        # HiFi Settings
        shifts_amt = 8 if is_hi_fi else 2
        overlap_amt = 0.6 if is_hi_fi else 0.25 
        
        print(f"[MODAL GPU] Procesando shifts={shifts_amt}, overlap={overlap_amt}...")
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
        
        stems_bytes = {}
        # Mapeo de stems individuales
        for idx, stem_name in enumerate(model.sources):
            if stem_name in requested_tracks:
                stem_audio = sources[idx].cpu().numpy().T
                buf = io.BytesIO()
                sf.write(buf, stem_audio, model.samplerate, format='WAV')
                stems_bytes[stem_name] = buf.getvalue()
        
        # --- MEZCLA INSTRUMENTAL PROFESIONAL ---
        if "instrumental" in requested_tracks:
            print("[MODAL GPU] Creando mezcla instrumental optimizada...")
            instrumental_audio = None
            for idx, stem_name in enumerate(model.sources):
                if stem_name != "vocals":
                    audio = sources[idx].cpu().numpy().T
                    if instrumental_audio is None:
                        instrumental_audio = audio
                    else:
                        instrumental_audio += audio
            
            # NORMALIZACIÓN: Evita distorsión y mantiene el "punch"
            max_val = np.max(np.abs(instrumental_audio))
            if max_val > 0.99:
                print(f"[MODAL GPU] Normalizando instrumental (Peak: {max_val:.2f})")
                instrumental_audio = instrumental_audio / max_val * 0.98
                
            buf = io.BytesIO()
            sf.write(buf, instrumental_audio, model.samplerate, format='WAV')
            stems_bytes["instrumental"] = buf.getvalue()
            
        return stems_bytes
