import modal
import io
import os

# Nombramos nuestra "máquina" en la nube
app = modal.App("moises-demucs-worker")

# 1. Definimos el ADN de nuestro servidor virtual (Software e Inteligencia Artificial)
# Cuando esto despierte, auto-instalará todo esto en la GPU
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
)

# 2. Le pedimos formalmente a Modal una tarjeta NVIDIA T4 con un tiempo máximo de 10 min
@app.function(image=image, gpu="T4", timeout=600)
def separate_audio(audio_bytes: bytes, requested_tracks: list, is_hi_fi: bool):
    """
    Función que vivirá en los servidores de Modal, recibirá bytes de música
    por red local e inyectará toda la matemática usando el poder CUDA (GPU).
    """
    import torch
    import tempfile
    import soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    import torchaudio
    import subprocess
    
    print("[MODAL GPU] Nueva solicitud de extracción recibida!")

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_mp3 = os.path.join(tmp_dir, "input_audio.mp3")
        input_wav = os.path.join(tmp_dir, "input_audio.wav")
        with open(input_mp3, "wb") as f:
            f.write(audio_bytes)
            
        print("[MODAL GPU] Convirtiendo audio a WAV de forma segura con ffmpeg...")
        # Usa subprocess para convertir sin depender de los códecs rotos de torchaudio
        subprocess.run(["ffmpeg", "-y", "-i", input_mp3, input_wav], capture_output=True, check=True)
        
        print("[MODAL GPU] Cargando bytes usando soundfile (anulando torchaudio)...")
        # sf.read devuelve (frames, channels), asi que necesitamos transponerlo a (channels, frames)
        wav_numpy, sr = sf.read(input_wav, dtype='float32')
        if len(wav_numpy.shape) == 1:
            wav_numpy = wav_numpy.reshape(-1, 1)
            
        wav = torch.from_numpy(wav_numpy).transpose(0, 1)
        
        # Cargar Modelo avanzado (la GPU lo absorbe en 1 segundo a su VRAM)
        print("[MODAL GPU] Cargando modelo htdemucs_6s a Memoria de Vídeo...")
        model = get_model('htdemucs_6s')
        model.cuda() # MAGIA: Transferir Cerebro a Nvidia
        model.eval()

        wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
        wav = wav.cuda() # MAGIA: Transferir Canción a Nvidia
        
        # Normalización matemática
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()

        # Configuración Inteligente (Velocidad Vs Calidad extrema "Audiófilo")
        shifts_amt = 10 if is_hi_fi else 3
        overlap_amt = 0.5 if is_hi_fi else 0.25
        
        print(f"[MODAL GPU] Iniciando disección matemática nivel Estudio ⚡ (Shifts: {shifts_amt}, Overlap: {overlap_amt})")
        # Procesamiento en la Tarjeta de Video (Lo que a la PC le toma 10min, ella lo hace en 15-30 segundos)
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
        
        stem_mapping = {
            "vocals.wav": "vocals", "drums.wav": "drums", 
            "bass.wav": "bass", "other.wav": "other",
            "guitar.wav": "guitar", "piano.wav": "piano"
        }
        
        # Empacar las ondas en trozos de bytes para mandarlos por internet de vuelta a tu NextJS
        print("[MODAL GPU] Empaquetando piezas extraídas...")
        stems_bytes = {}
        for idx, stem_name in enumerate(model.sources):
            expected_filename = f"{stem_name}.wav"
            my_stem_name = stem_mapping.get(expected_filename)
            
            if my_stem_name in requested_tracks or (my_stem_name == "vocals" and "vocals" in requested_tracks):
                stem_audio = sources[idx].cpu().numpy().T
                
                buf = io.BytesIO()
                sf.write(buf, stem_audio, model.samplerate, format='WAV')
                stems_bytes[my_stem_name] = buf.getvalue()
        
        if "instrumental" in requested_tracks:
            # Mezclar pista de kareoke combinando todo menos la voz
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
            
        print("[MODAL GPU] ¡Misión Cumplida! Devolviendo los paquetes de audio a la central.")    
        return stems_bytes
