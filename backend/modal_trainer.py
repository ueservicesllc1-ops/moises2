import os
import modal
import subprocess
from pathlib import Path
import shutil
import json

# Imagen con todas las dependencias instaladas correctamente.
# NO hacemos git clone porque apt-get puede fallar en la nube.
# demucs se instala via pip y tiene la carpeta conf/ incluida en el wheel.
image = (
    modal.Image.from_registry("pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime")
    .apt_install("ffmpeg", "wget", "unzip")
    .pip_install(
        "b2sdk", "tqdm", "numpy", "soundfile",
        "musdb", "museval",
        "dora-search", "treetable", "submitit",
        "demucs==4.0.1"
    )
)

app = modal.App("moises-demucs-trainer")
dataset_volume = modal.Volume.from_name("zion-demucs-dataset", create_if_missing=True)

@app.function(image=image, volumes={"/dataset": dataset_volume}, timeout=1800)
def sync_b2_dataset(payload: dict):
    """
    Sincroniza los audios de Zion hacia el volumen de Modal.
    """
    manifest = payload.get("manifest", {})
    songs = manifest.get("songs", [])
    if not songs:
        return {"ok": False, "error": "Manifest vacío"}

    base_path = Path("/dataset")
    wav_path = base_path / "wav"
    meta_path = base_path / "metadata"
    os.makedirs(wav_path, exist_ok=True)
    os.makedirs(meta_path, exist_ok=True)

    def _get_direct_url(url: str) -> str:
        """Si la URL pasa por el proxy de Railway, extrae la URL real de B2."""
        from urllib.parse import urlparse, parse_qs, unquote
        parsed = urlparse(url)
        if "railway.app" in parsed.netloc or "mixernew" in parsed.netloc:
            qs = parse_qs(parsed.query)
            if "url" in qs:
                return unquote(qs["url"][0])
        return url

    def _prepare_audio(url: str, output_path: Path):
        direct_url = _get_direct_url(url)
        tmp_raw = Path(f"/tmp/raw_{output_path.stem}_{os.getpid()}.tmp")
        try:
            subprocess.run(["wget", "-q", "-O", str(tmp_raw), direct_url], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-i", str(tmp_raw),
                "-ar", "44100", "-ac", "2", str(output_path)
            ], check=True, capture_output=True)
        finally:
            if tmp_raw.exists(): tmp_raw.unlink()

    def _generate_silence(output_path: Path):
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", "5", str(output_path)
        ], check=True, capture_output=True)

    processed_count = 0
    for s in songs:
        sid = s["id"]
        mapping = s.get("ai_mapping", {})
        sources = s.get("trackSources", {})
        song_dir = wav_path / sid
        os.makedirs(song_dir, exist_ok=True)

        stems_to_process = {
            "vocals": mapping.get("vocals"),
            "drums": mapping.get("drums"),
            "bass": mapping.get("bass"),
            "guitar": mapping.get("guitar"),
            "piano": mapping.get("piano")
        }

        for stem_name, track_key in stems_to_process.items():
            out_file = song_dir / f"{stem_name}.wav"
            url = sources.get(track_key) if track_key else None
            if url:
                print(f"[SYNC] Procesando {sid} -> {stem_name}")
                _prepare_audio(url, out_file)
            else:
                print(f"[SYNC] Silencio en {sid} -> {stem_name}")
                _generate_silence(out_file)

        other_keys = mapping.get("other", [])
        other_out = song_dir / "other.wav"
        valid_other_urls = [sources.get(k) for k in other_keys if sources.get(k)]
        if valid_other_urls:
            tmp_files = []
            for i, u in enumerate(valid_other_urls):
                t = Path(f"/tmp/other_{sid}_{i}_{os.getpid()}.wav")
                _prepare_audio(u, t)
                tmp_files.append(t)
            if len(tmp_files) > 1:
                filter_complex = "".join([f"[{i}:a]" for i in range(len(tmp_files))]) + f"amix=inputs={len(tmp_files)}[a]"
                cmd = ["ffmpeg", "-y"]
                for f in tmp_files: cmd.extend(["-i", str(f)])
                cmd.extend(["-filter_complex", filter_complex, "-map", "[a]", str(other_out)])
                subprocess.run(cmd, check=True, capture_output=True)
            else:
                shutil.move(str(tmp_files[0]), str(other_out))
            for f in tmp_files:
                if f.exists(): f.unlink()
        else:
            _generate_silence(other_out)

        with open(meta_path / f"song_{sid}.json", "w") as f:
            json.dump({
                "instruments": ["vocals", "drums", "bass", "guitar", "piano", "other"],
                "path": str(song_dir)
            }, f)
        processed_count += 1

    dataset_volume.commit()
    return {"ok": True, "processed": processed_count}


@app.function(
    image=image,
    volumes={"/dataset": dataset_volume},
    gpu="T4",
    timeout=3600
)
def train_model(epochs: int = 20):
    """
    Entrenamiento via API Python de Demucs (no CLI).
    Evita todos los problemas de Hydra/dora/imports relativos.
    """
    import torch
    import sys
    from pathlib import Path as P

    dataset_path = P("/dataset")
    wav_path = dataset_path / "wav"
    checkpoint_path = dataset_path / "checkpoints"
    checkpoint_path.mkdir(parents=True, exist_ok=True)

    print(f"[TRAIN] PyTorch: {torch.__version__} | CUDA: {torch.cuda.is_available()}")
    print(f"[TRAIN] Dataset: {wav_path} | Epochs: {epochs}")

    # Listar canciones disponibles
    songs = [d for d in wav_path.iterdir() if d.is_dir()]
    print(f"[TRAIN] Canciones encontradas: {len(songs)}")
    for s in songs:
        stems = list(s.glob("*.wav"))
        print(f"  - {s.name}: {[f.stem for f in stems]}")

    if not songs:
        raise RuntimeError("No hay canciones en el dataset. Ejecuta sync primero.")

    from demucs.pretrained import get_model
    from demucs.audio import AudioFile
    
    # NUEVA LOGICA: Cargar el ultimo checkpoint si existe (Cerebro Acumulativo)
    last_ckpt = checkpoint_path / "epoch_020.pt"
    if last_ckpt.exists():
        print(f"[TRAIN] Cargando conocimiento previo desde {last_ckpt.name}...")
        model = get_model("htdemucs_6s")
        checkpoint = torch.load(str(last_ckpt))
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        print("[TRAIN] Iniciando desde el modelo base de Facebook (htdemucs_6s)...")
        model = get_model("htdemucs_6s")
        
    model = model.cuda() if torch.cuda.is_available() else model
    
    # Desbloquear aprendizaje
    for param in model.parameters():
        param.requires_grad = True
        
    print(f"[TRAIN] Modelo listo para seguir aprendiendo.")

    # Fine-tuning simple: optimizer Adam
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    import torchaudio
    STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"]
    SAMPLE_RATE = 44100

    def load_stem(path, sr=SAMPLE_RATE):
        wav, orig_sr = torchaudio.load(str(path))
        if orig_sr != sr:
            wav = torchaudio.functional.resample(wav, orig_sr, sr)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        return wav[:2].to(device)

    for epoch in range(1, epochs + 1):
        total_loss = 0.0
        n_batches = 0
        model.train()

        for song_dir in songs:
            stem_files = {s: song_dir / f"{s}.wav" for s in STEMS}
            if not all(f.exists() for f in stem_files.values()):
                print(f"  [SKIP] {song_dir.name} - faltan stems")
                continue

            try:
                # Mezclar todas las pistas para obtener el mix
                stems_tensors = {s: load_stem(p) for s, p in stem_files.items()}
                min_len = min(t.shape[1] for t in stems_tensors.values())
                stems_tensors = {s: t[:, :min_len] for s, t in stems_tensors.items()}

                mix = sum(stems_tensors.values())
                mix = mix.unsqueeze(0)  # [1, 2, T]

                # Para entrenar, NO usamos apply_model (que bloquea gradientes).
                # Usamos el forward pass directo. HTDemucs suele devolver una lista o un tensor.
                # Si es un BagOfModels, entrenamos el primer modelo o el que toque.
                if hasattr(model, "models"):
                    # Extraer el modelo real si es un Bag
                    actual_model = model.models[0]
                    estimates = actual_model(mix)
                else:
                    estimates = model(mix)

                # Calcular loss L1 contra cada stem real
                target = torch.stack([stems_tensors[s] for s in STEMS], dim=0)  # [6, 2, T]
                target = target.unsqueeze(0)  # [1, 6, 2, T]

                if estimates.shape[-1] != target.shape[-1]:
                    min_t = min(estimates.shape[-1], target.shape[-1])
                    estimates = estimates[..., :min_t]
                    target = target[..., :min_t]

                loss = torch.nn.functional.l1_loss(estimates, target)

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                n_batches += 1
                print(f"  [TRAIN] Epoch {epoch}/{epochs} | {song_dir.name} | loss={loss.item():.4f}")

            except Exception as e:
                print(f"  [ERROR] {song_dir.name}: {e}")
                continue

        avg_loss = total_loss / max(n_batches, 1)
        print(f"[TRAIN] Epoch {epoch}/{epochs} completada | avg_loss={avg_loss:.4f}")

        # Guardar checkpoint cada 5 epocas
        if epoch % 5 == 0 or epoch == epochs:
            ckpt_path = checkpoint_path / f"epoch_{epoch:03d}.pt"
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "avg_loss": avg_loss,
            }, str(ckpt_path))
            print(f"[TRAIN] Checkpoint guardado: {ckpt_path}")
            dataset_volume.commit()

    print("[TRAIN] Entrenamiento completado exitosamente!")
    return {"status": "success", "epochs": epochs, "model_path": str(checkpoint_path)}

@app.function(image=image, volumes={"/dataset": dataset_volume})
def check_results():
    """Verifica fisicamente si el modelo entrenado existe."""
    best_path = Path("/dataset/checkpoints/epoch_020.pt")
    # Tambien revisamos si hay algun otro checkpoint
    checkpoints = list(Path("/dataset/checkpoints").glob("*.pt")) if Path("/dataset/checkpoints").exists() else []
    
    return {
        "exists": best_path.exists(),
        "count": len(checkpoints),
        "last_model": str(best_path) if best_path.exists() else None,
        "files": [f.name for f in checkpoints]
    }

@app.function(image=image, volumes={"/dataset": dataset_volume})
def clear_checkpoints():
    """Borra todos los modelos anteriores para empezar un entrenamiento limpio."""
    import shutil
    ckpt_dir = Path("/dataset/checkpoints")
    if ckpt_dir.exists():
        shutil.rmtree(ckpt_dir)
        ckpt_dir.mkdir(parents=True)
    dataset_volume.commit()
    return {"status": "cleared"}
