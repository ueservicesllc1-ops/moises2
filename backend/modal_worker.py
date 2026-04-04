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
            
        wav_orig = torch.from_numpy(wav_numpy).transpose(0, 1)
        
        # --- LÓGICA HÍBRIDA ---
        needs_6s = any(t in requested_tracks for t in ["guitar", "piano"])
        model_name = 'htdemucs_6s' if needs_6s else 'htdemucs_ft'
        
        print(f"[MODAL GPU] Modelo: {model_name}")
        model = get_model(model_name)
        model.cuda()
        model.eval()

        wav_proc = convert_audio(wav_orig, sr, model.samplerate, model.audio_channels)
        wav_proc = wav_proc.cuda()
        
        # Normalización para la IA
        ref = wav_proc.mean(0)
        wav_proc_std = (wav_proc - ref.mean()) / ref.std()

        # Punto de Oro
        shifts_amt = 4 if is_hi_fi else 2
        overlap_amt = 0.4 if is_hi_fi else 0.25 
        
        print(f"[MODAL GPU] Procesando ({shifts_amt} pasadas, {overlap_amt} solapamiento)...")
        with torch.no_grad():
            sources_std = apply_model(
                model, 
                wav_proc_std[None], 
                device='cuda', 
                shifts=shifts_amt, 
                split=True, 
                overlap=overlap_amt, 
                progress=True
            )[0]
        
        stems_bytes = {}
        vocals_idx = -1
        
        # Guardar tracks individuales devolviendo a amplitud real
        for idx, stem_name in enumerate(model.sources):
            if stem_name == "vocals":
                vocals_idx = idx
            
            if stem_name in requested_tracks:
                # Escalar de vuelta a amplitud real
                stem_real = sources_std[idx] * ref.std() + ref.mean()
                stem_audio = stem_real.cpu().numpy().T
                buf = io.BytesIO()
                sf.write(buf, stem_audio, model.samplerate, format='WAV')
                stems_bytes[stem_name] = buf.getvalue()
        
        # --- FIX: MÉTODO SUSTRACTIVO CORREGIDO ---
        if "instrumental" in requested_tracks and vocals_idx != -1:
            print("[MODAL GPU] Aplicando sustracción CORREGIDA (en espacio normalizado)...")
            
            # Restamos en el espacio normalizado donde las fases encajan 100%
            instrumental_std = wav_proc_std - sources_std[vocals_idx]
            
            # Devolvemos el instrumental resultante a amplitud real
            instrumental_real = instrumental_std * ref.std() + ref.mean()
            instrumental_audio = instrumental_real.cpu().numpy().T
            
            # Normalización final anti-clip
            max_val = np.max(np.abs(instrumental_audio))
            if max_val > 0.99:
                instrumental_audio = instrumental_audio / max_val * 0.98
                
            buf = io.BytesIO()
            sf.write(buf, instrumental_audio, model.samplerate, format='WAV')
            stems_bytes["instrumental"] = buf.getvalue()
            
        print(f"[MODAL GPU] Finalizado con éxito.")    
        return stems_bytes
