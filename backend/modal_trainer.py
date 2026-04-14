"""
Modal app: dataset sync + Demucs HTDemucs fine-tuning on curated stems.

Training uses official `python -m demucs.train` with a custom WAV layout:
  /dataset/wav/train/<track_id>/{vocals,drums,bass,other}.wav
  /dataset/wav/valid/<track_id>/...

Checkpoint is written to the shared volume at /dataset/checkpoints/latest.th
and can be loaded by modal_worker from the same volume mounted at /finetuned.
"""
import modal
import os
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path

app = modal.App("moises-demucs-trainer")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "wget", "unzip")
    .pip_install(
        "torch",
        "torchaudio",
        "demucs",
        "soundfile",
        "numpy",
        "b2sdk",
        "musdb",
        "julius",
        "dora",
        "hydra-core",
        "omegaconf",
        "colorlog",
        "tqdm",
        "pyyaml",
    )
)

dataset_volume = modal.Volume.from_name("zion-demucs-dataset", create_if_missing=True)


def _safe_id(song_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", song_id)[:96] or "track"


def _download_url(url: str, dest: Path, timeout: int = 120) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "moises-training-sync/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    dest.write_bytes(data)


def _to_stereo_wav(src: Path, dst: Path, samplerate: int = 44100) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ac",
            "2",
            "-ar",
            str(samplerate),
            str(dst),
        ],
        check=True,
        capture_output=True,
    )


def _mix_wavs(inputs: list[Path], out: Path, samplerate: int = 44100) -> None:
    if len(inputs) == 1:
        _to_stereo_wav(inputs[0], out, samplerate)
        return
    args = ["ffmpeg", "-y"]
    for p in inputs:
        args += ["-i", str(p)]
    filt = f"amix=inputs={len(inputs)}:duration=longest:dropout_transition=0"
    args += ["-filter_complex", filt, "-ac", "2", "-ar", str(samplerate), str(out)]
    subprocess.run(args, check=True, capture_output=True)


@app.function(image=image, volumes={"/dataset": dataset_volume}, timeout=7200)
def sync_b2_dataset(options=None):
    """
    Build Demucs WAV dataset from a client-provided manifest (HTTP URLs per stem).

    options.manifest.songs: [
      { id, ai_mapping: {vocals, drums, bass, other: []}, trackSources: { stemKey: url } }
    ]
    """
    options = options or {}
    manifest = options.get("manifest") or {}
    songs = manifest.get("songs") or []

    if not songs:
        return {
            "ok": False,
            "error": "manifest.songs requerido: sincroniza desde la UI con canciones curadas.",
        }

    base = Path("/dataset/wav")
    train_dir = base / "train"
    valid_dir = base / "valid"
    meta_dir = Path("/dataset/metadata")
    if train_dir.exists():
        shutil.rmtree(train_dir)
    if valid_dir.exists():
        shutil.rmtree(valid_dir)
    train_dir.mkdir(parents=True)
    valid_dir.mkdir(parents=True)
    meta_dir.mkdir(parents=True)

    for p in meta_dir.glob("wav_*.json"):
        p.unlink(missing_ok=True)

    n = len(songs)
    split_idx = max(1, int(n * 0.8))
    if n == 1:
        train_songs, valid_songs = songs, songs
    else:
        train_songs = songs[:split_idx]
        valid_songs = songs[split_idx:] or songs[-1:]

    tmp = Path("/dataset/tmp_dl")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True, exist_ok=True)

    def materialize_song(song: dict, out_root: Path) -> str:
        sid = _safe_id(str(song.get("id", "unknown")))
        mapping = song.get("ai_mapping") or {}
        sources = song.get("trackSources") or {}
        vocals_k = mapping.get("vocals")
        drums_k = mapping.get("drums")
        bass_k = mapping.get("bass")
        other_keys = mapping.get("other") or []

        if not (vocals_k and drums_k and bass_k and other_keys):
            raise ValueError(f"Canción {sid}: ai_mapping incompleto")

        track_out = out_root / sid
        track_out.mkdir(parents=True, exist_ok=True)

        def url_for(key: str) -> str:
            u = sources.get(key)
            if not u or not str(u).startswith(("http://", "https://")):
                raise ValueError(f"Canción {sid}: URL inválida para stem {key}")
            return str(u).strip()

        raw_vocals = tmp / f"{sid}_vocals_dl"
        raw_drums = tmp / f"{sid}_drums_dl"
        raw_bass = tmp / f"{sid}_bass_dl"
        _download_url(url_for(vocals_k), raw_vocals)
        _download_url(url_for(drums_k), raw_drums)
        _download_url(url_for(bass_k), raw_bass)

        others_raw = []
        for i, ok in enumerate(other_keys):
            p = tmp / f"{sid}_other_{i}_dl"
            _download_url(url_for(ok), p)
            others_raw.append(p)

        _to_stereo_wav(raw_vocals, track_out / "vocals.wav")
        _to_stereo_wav(raw_drums, track_out / "drums.wav")
        _to_stereo_wav(raw_bass, track_out / "bass.wav")
        _mix_wavs(others_raw, track_out / "other.wav")

        return sid

    train_ids = []
    for s in train_songs:
        train_ids.append(materialize_song(s, train_dir))

    valid_ids = []
    for s in valid_songs:
        valid_ids.append(materialize_song(s, valid_dir))

    dataset_volume.commit()

    return {
        "ok": True,
        "train_tracks": len(train_ids),
        "valid_tracks": len(valid_ids),
        "train_ids": train_ids,
        "valid_ids": valid_ids,
        "wav_root": str(base),
    }


@app.function(
    image=image,
    gpu="A10G",
    volumes={"/dataset": dataset_volume},
    timeout=86400,
)
def train_model(
    epochs: int = 20,
    batch_size: int | None = None,
):
    """
    Fine-tune HTDemucs on /dataset/wav using Demucs official training entrypoint.
    Produces /dataset/checkpoints/latest.th for inference (load_model).
    """
    wav_root = Path("/dataset/wav")
    train_path = wav_root / "train"
    if not train_path.exists() or not any(train_path.iterdir()):
        return {"ok": False, "error": "No hay datos en /dataset/wav/train. Ejecuta sync primero."}

    n_train = len([p for p in train_path.iterdir() if p.is_dir()])
    n_valid = len([p for p in (wav_root / "valid").iterdir() if p.is_dir()]) if (wav_root / "valid").exists() else 0
    if n_valid < 1:
        return {"ok": False, "error": "Conjunto valid vacío."}

    default_bs = 1 if n_train < 4 else min(4, n_train)
    bs = batch_size if batch_size is not None else default_bs
    bs = max(1, min(bs, max(1, n_train)))

    out_ckpt_dir = Path("/dataset/checkpoints")
    out_ckpt_dir.mkdir(parents=True, exist_ok=True)

    xp_dir = Path("/dataset/xp")
    if xp_dir.exists():
        shutil.rmtree(xp_dir)
    xp_dir.mkdir(parents=True)

    overrides = [
        "dset.use_musdb=false",
        f"dset.wav={wav_root}",
        "dset.metadata=/dataset/metadata",
        f"epochs={epochs}",
        f"batch_size={bs}",
        "model=htdemucs",
        "dset.segment=11",
        "dset.shift=1",
        "misc.num_workers=2",
        "misc.verbose=true",
        f"dora.dir={xp_dir}",
        f"test.every={max(1, epochs)}",
        "optim.lr=3e-4",
    ]

    # Demucs upstream hace ConcatDataset([[], wav]) cuando use_musdb=false (bug). Parche antes de Hydra.
    runner = Path("/dataset/run_demucs_train.py")
    runner.write_text(
        '''import sys


def _patch_wav_only():
    import demucs.train as tr
    from demucs.wav import get_wav_datasets

    _orig = tr.get_datasets

    def get_datasets_fixed(args):
        if getattr(args.dset, "wav", None) and not getattr(args.dset, "use_musdb", False):
            return get_wav_datasets(args.dset)
        return _orig(args)

    tr.get_datasets = get_datasets_fixed


_patch_wav_only()

if __name__ == "__main__":
    from demucs.train import main

    sys.argv = ["demucs.train"] + sys.argv[1:]
    main()
''',
        encoding="utf-8",
    )

    cmd = ["python", str(runner), *overrides]
    print("[ENTRENAMIENTO] ", " ".join(cmd))

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.run(cmd, cwd="/dataset", env=env, capture_output=True, text=True)
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr)

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": f"demucs.train falló (code {proc.returncode})",
            "stderr_tail": (proc.stderr or "")[-4000:],
            "stdout_tail": (proc.stdout or "")[-4000:],
        }

    best_files = list(xp_dir.rglob("best.th"))
    if not best_files:
        th_files = list(xp_dir.rglob("*.th"))
        return {
            "ok": False,
            "error": "Entrenamiento terminó pero no se encontró best.th",
            "th_files": [str(p) for p in th_files[:20]],
        }

    best = best_files[-1]
    latest = out_ckpt_dir / "latest.th"
    shutil.copy2(best, latest)
    dataset_volume.commit()

    return {
        "ok": True,
        "checkpoint": str(latest),
        "source_best": str(best),
        "epochs": epochs,
        "batch_size": bs,
        "train_tracks": n_train,
        "valid_tracks": n_valid,
    }
