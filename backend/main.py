from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import uuid
import asyncio
import hashlib
import tempfile
import re
import subprocess
import shutil
import sys
from pathlib import Path
from typing import List, Optional, Dict
import json
from audio_processor_real import audio_processor
from chord_analyzer import ChordAnalyzer
from models import ProcessingTask, TaskStatus
from database import get_db, init_db, TaskDB, SessionLocal, SeparationCacheDB, VisitDB
from datetime import datetime
from datetime import timedelta

from b2_storage import b2_storage
import librosa
import numpy as np

# In-memory task storage
tasks_storage = {}
DEPENDENCY_STATUS: Dict[str, object] = {"checked": False}

class JobQueueManager:
    def __init__(self, max_concurrent=2):
        self.max_concurrent = max_concurrent
        self.queue = []  # List of tuples (task_id, process_func, args, kwargs)
        self.active_tasks = set()
        self.lock = asyncio.Lock()

    async def add_task(self, task_id, process_func, *args, **kwargs):
        async with self.lock:
            self.queue.append((task_id, process_func, args, kwargs))
            if task_id in tasks_storage:
                tasks_storage[task_id].status = TaskStatus.QUEUED
                tasks_storage[task_id].progress = 0
            
            # Persistir estado en base de datos
            try:
                db = SessionLocal()
                db.query(TaskDB).filter(TaskDB.id == task_id).update({
                    "status": TaskStatus.QUEUED,
                    "progress": 0
                })
                db.commit()
                db.close()
                print(f"[QUEUE] Task {task_id} added to queue.")
            except Exception as e:
                print(f"[QUEUE ERROR] DB update failed for task {task_id}: {e}")

    def has_real_queue(self) -> bool:
        """
        Cola real = ya alcanzamos concurrencia maxima y aun quedan tareas esperando.
        """
        return len(self.active_tasks) >= self.max_concurrent and len(self.queue) > 0

    def get_queue_position(self, task_id):
        for i, item in enumerate(self.queue):
            if item[0] == task_id:
                return i + 1
        return 0

    async def process_loop(self):
        print(f"[QUEUE] Starting background worker loop (max concurrency: {self.max_concurrent})")
        while True:
            try:
                await asyncio.sleep(2)
                async with self.lock:
                    while len(self.active_tasks) < self.max_concurrent and self.queue:
                        task_id, process_func, args, kwargs = self.queue.pop(0)
                        self.active_tasks.add(task_id)
                        print(f"[QUEUE] Starting task {task_id}. Active: {len(self.active_tasks)}")
                        asyncio.create_task(self._run_task(task_id, process_func, *args, **kwargs))
            except Exception as e:
                print(f"[QUEUE ERROR] Error in process_loop: {e}")

    async def _run_task(self, task_id, process_func, *args, **kwargs):
        try:
            await process_func(*args, **kwargs)
        except Exception as e:
            print(f"[QUEUE ERROR] Task {task_id} failed: {e}")
        finally:
            async with self.lock:
                if task_id in self.active_tasks:
                    self.active_tasks.remove(task_id)
                print(f"[QUEUE] Task {task_id} finished. Active: {len(self.active_tasks)}")

queue_manager = JobQueueManager(max_concurrent=2)

app = FastAPI(
    title="Moises Clone API",
    description="AI-powered audio separation service",
    version="1.0.0"
)

CACHE_MODEL_VERSION = os.getenv("SEPARATION_MODEL_VERSION", "demucs_pro_v3")
CACHE_TTL_HOURS = int(os.getenv("SEPARATION_CACHE_TTL_HOURS", "168"))
REMOTE_SEPARATION_TIMEOUT_SECONDS = int(os.getenv("REMOTE_SEPARATION_TIMEOUT_SECONDS", "300"))
REMOTE_SEPARATION_RETRIES = int(os.getenv("REMOTE_SEPARATION_RETRIES", "1"))
CLICK_DEBUG_BUILD = os.getenv("CLICK_DEBUG_BUILD", "build-unknown")

def _find_click_key(stems: Dict[str, str]) -> Optional[str]:
    for key in stems.keys():
        if key == "click" or key.startswith("click_"):
            return key
    return None


def check_runtime_dependencies() -> Dict[str, object]:
    """
    Verifica dependencias externas críticas para evitar fallos tardíos en runtime.
    """
    status: Dict[str, object] = {
        "checked": True,
        "ffmpeg": False,
        "ytdlp_cli": False,
        "ytdlp_python_module": False,
        "modal_client": False,
        "modal_token_id_present": bool(os.getenv("MODAL_TOKEN_ID")),
        "modal_token_secret_present": bool(os.getenv("MODAL_TOKEN_SECRET")),
        "python_executable": os.getenv("PYTHON_EXECUTABLE", ""),
    }

    # ffmpeg
    ffmpeg_bin = shutil.which("ffmpeg")
    status["ffmpeg"] = bool(ffmpeg_bin)
    if ffmpeg_bin:
        status["ffmpeg_path"] = ffmpeg_bin

    # yt-dlp CLI
    ytdlp_bin = shutil.which("yt-dlp")
    status["ytdlp_cli"] = bool(ytdlp_bin)
    if ytdlp_bin:
        status["ytdlp_cli_path"] = ytdlp_bin

    # yt_dlp module
    try:
        mod_result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        status["ytdlp_python_module"] = mod_result.returncode == 0
        if mod_result.returncode == 0:
            status["ytdlp_version"] = (mod_result.stdout or "").strip()
        else:
            status["ytdlp_error"] = (mod_result.stderr or "").strip()[:300]
    except Exception as e:
        status["ytdlp_python_module"] = False
        status["ytdlp_error"] = str(e)[:300]

    # modal client (version + import sanity)
    try:
        import modal  # type: ignore

        status["modal_client"] = True
        status["modal_version"] = getattr(modal, "__version__", "unknown")
    except Exception as e:
        status["modal_client"] = False
        status["modal_error"] = str(e)[:300]

    return status


def determine_requested_tracks(separation_type: str, custom_tracks: Optional[Dict]) -> List[str]:
    if separation_type == "custom" and custom_tracks:
        requested = [track for track, enabled in custom_tracks.items() if enabled]
    elif separation_type == "vocals-instrumental":
        requested = ["vocals", "instrumental"]
    elif separation_type == "vocals-drums-bass-other":
        requested = ["vocals", "drums", "bass", "other", "guitar", "piano"]
    else:
        requested = ["vocals", "drums", "bass", "other", "guitar", "piano"]

    if not requested:
        requested = ["vocals", "drums", "bass", "other", "guitar", "piano"]
    return requested


def build_cache_key(audio_bytes: bytes, requested_tracks: List[str], quality_profile: str, hi_fi: bool) -> str:
    payload = {
        "audio_sha256": hashlib.sha256(audio_bytes).hexdigest(),
        "requested_tracks": sorted(requested_tracks),
        "quality_profile": (quality_profile or "pro_balanced").lower(),
        "hi_fi": bool(hi_fi),
        "model_version": CACHE_MODEL_VERSION,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:3001", 
        "http://localhost:3002",
        "https://moises2-production.up.railway.app",
        "https://moises2-production-d1cb.up.railway.app",
        "https://judith.life",
        "https://www.judith.life"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (commented for demo)
# app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize B2 only (database not used)
@app.on_event("startup")
async def startup_event():
    init_db()
    await b2_storage.initialize()
    global DEPENDENCY_STATUS
    DEPENDENCY_STATUS = check_runtime_dependencies()
    DEPENDENCY_STATUS["click_debug_build"] = CLICK_DEBUG_BUILD
    print(f"[STARTUP] CLICK_DEBUG_BUILD={CLICK_DEBUG_BUILD}")
    print(f"[STARTUP] Runtime dependencies: {DEPENDENCY_STATUS}")
    # Iniciar el bucle de procesamiento de la cola
    asyncio.create_task(queue_manager.process_loop())

# Audio processor instance (already imported)

@app.get("/")
async def root():
    return {"message": "Moises Clone API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {
        "status": "OK",
        "message": "Backend is running",
        "dependencies": DEPENDENCY_STATUS,
    }


def _extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@app.post("/api/visits/track")
async def track_visit(request: Request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    path = str(payload.get("path") or "/")
    visitor_id = str(payload.get("visitorId") or "").strip()
    user_agent = request.headers.get("user-agent", "")[:300]
    ip = _extract_client_ip(request)

    if not visitor_id:
        visitor_id = hashlib.sha256(f"{ip}:{user_agent}".encode("utf-8")).hexdigest()[:32]

    # Evita inflar contador por refresh rápidos del mismo usuario en la misma ruta.
    dedupe_since = datetime.utcnow() - timedelta(minutes=30)
    db = SessionLocal()
    try:
        already_tracked = (
            db.query(VisitDB)
            .filter(
                VisitDB.path == path,
                VisitDB.visitor_id == visitor_id,
                VisitDB.created_at >= dedupe_since,
            )
            .first()
        )
        if not already_tracked:
            db.add(
                VisitDB(
                    path=path,
                    visitor_id=visitor_id,
                    user_agent=user_agent,
                    ip=ip,
                )
            )
            db.commit()
    finally:
        db.close()

    return {"ok": True}


@app.get("/api/visits/stats")
async def get_visit_stats():
    now = datetime.utcnow()
    day_start = datetime(now.year, now.month, now.day)

    db = SessionLocal()
    try:
        all_visits = db.query(VisitDB).all()
        today_visits = [v for v in all_visits if v.created_at and v.created_at >= day_start]

        total_visits = len(all_visits)
        today_count = len(today_visits)
        unique_visitors = len({v.visitor_id for v in all_visits if v.visitor_id})
        today_unique_visitors = len({v.visitor_id for v in today_visits if v.visitor_id})

        return {
            "total_visits": total_visits,
            "today_visits": today_count,
            "unique_visitors": unique_visitors,
            "today_unique_visitors": today_unique_visitors,
            "timestamp": now.isoformat(),
        }
    finally:
        db.close()

@app.get("/api/health/deep")
async def health_check_deep():
    """
    Health check profundo para validar pipeline real de dependencias críticas.
    No llama servicios externos; usa audio sintético local para test rápido.
    """
    report: Dict[str, object] = {
        "status": "OK",
        "message": "Deep health check passed",
        "checks": {},
    }
    temp_dir = Path("temp_health")
    temp_dir.mkdir(exist_ok=True)
    uid = str(uuid.uuid4())
    wav_path = temp_dir / f"health_{uid}.wav"
    mp3_path = temp_dir / f"health_{uid}.mp3"

    try:
        # 1) Verificar módulo yt_dlp funcional
        ytdlp_check = {"ok": False}
        try:
            mod = subprocess.run(
                [sys.executable, "-m", "yt_dlp", "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            ytdlp_check["ok"] = mod.returncode == 0
            ytdlp_check["version"] = (mod.stdout or "").strip()
            if mod.returncode != 0:
                ytdlp_check["error"] = (mod.stderr or "").strip()[:300]
        except Exception as e:
            ytdlp_check["error"] = str(e)[:300]
        report["checks"]["yt_dlp_module"] = ytdlp_check

        # 2) Generar WAV sintético corto (440Hz) para probar encode
        sr = 22050
        seconds = 0.6
        t = np.linspace(0, seconds, int(sr * seconds), endpoint=False, dtype=np.float32)
        y = 0.2 * np.sin(2 * np.pi * 440.0 * t)
        import soundfile as sf
        sf.write(str(wav_path), y, sr, subtype="PCM_16")

        # 3) Verificar encode MP3 con ffmpeg (pipeline export)
        ffmpeg_check = {"ok": False}
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(wav_path),
            "-codec:a", "libmp3lame",
            "-b:a", "128k",
            str(mp3_path),
        ]
        ff = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        ffmpeg_check["ok"] = ff.returncode == 0 and mp3_path.exists() and mp3_path.stat().st_size > 0
        if ff.returncode != 0:
            ffmpeg_check["error"] = (ff.stderr or "").strip()[:500]
        else:
            ffmpeg_check["output_size_bytes"] = mp3_path.stat().st_size
        report["checks"]["ffmpeg_mp3_encode"] = ffmpeg_check

        # Estado final
        if not ytdlp_check.get("ok") or not ffmpeg_check.get("ok"):
            report["status"] = "DEGRADED"
            report["message"] = "Deep health check has failing checks"

        return report
    except Exception as e:
        return {
            "status": "ERROR",
            "message": "Deep health check failed",
            "error": str(e),
            "checks": report.get("checks", {}),
        }
    finally:
        wav_path.unlink(missing_ok=True)
        mp3_path.unlink(missing_ok=True)

# Endpoints de separación (múltiples rutas para compatibilidad)
@app.post("/api/separate-demucs")
async def separate_with_demucs(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    quality_profile: Optional[str] = Form("pro_balanced"),
):
    return await separate_audio_handler(background_tasks, file, separation_type, hi_fi, separation_options, user_id, quality_profile)

@app.post("/separate")
async def separate_alias(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    quality_profile: Optional[str] = Form("pro_balanced"),
):
    return await separate_audio_handler(background_tasks, file, separation_type, hi_fi, separation_options, user_id, quality_profile)

async def separate_audio_handler(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    quality_profile: Optional[str] = Form("pro_balanced"),
):
    """Separar audio usando Demucs"""
    try:
        print(f"[SEPARATE] Iniciando separación - File: {file.filename}, Type: {separation_type}")
        
        if not file.content_type or not file.content_type.startswith("audio/"):
            print(f"[ERROR] Invalid content type: {file.content_type}")
            raise HTTPException(status_code=400, detail="File must be audio")
        
        # Generar task ID
        task_id = str(uuid.uuid4())
        print(f"[SEPARATE] Task ID generado: {task_id}")
        
        # Guardar archivo en uploads/
        upload_dir = Path(f"uploads/{task_id}")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp3'
        file_path = upload_dir / f"original.{file_ext}"
        
        print(f"[SEPARATE] Leyendo archivo...")
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        print(f"[SEPARATE] Archivo guardado: {file_path} ({len(content)} bytes)")
        
        # Parse separation options
        custom_tracks = None
        if separation_options:
            try:
                custom_tracks = json.loads(separation_options)
                print(f"[SEPARATE] Parsed separation_options: {custom_tracks}")
            except Exception as e:
                print(f"[SEPARATE] Error parsing separation_options: {e}")
        
        is_hifi_bool = hi_fi.lower() == "true"
        profile_name = (quality_profile or "pro_balanced").lower()
        if is_hifi_bool and profile_name != "hifi":
            profile_name = "hifi"
        requested_tracks = determine_requested_tracks(separation_type, custom_tracks)
        if profile_name == "pro_balanced" and len(requested_tracks) > 8:
            requested_tracks = requested_tracks[:8]

        cache_key = build_cache_key(content, requested_tracks, profile_name, is_hifi_bool)
        try:
            db = SessionLocal()
            cached = db.query(SeparationCacheDB).filter(SeparationCacheDB.cache_key == cache_key).first()
            if cached:
                cache_expired = False
                if cached.created_at:
                    expires_at = cached.created_at + timedelta(hours=CACHE_TTL_HOURS)
                    cache_expired = datetime.utcnow() > expires_at
                if cached.model_version and cached.model_version != CACHE_MODEL_VERSION:
                    cache_expired = True

                if cache_expired:
                    print(f"[CACHE] Entry expired or version mismatch, key {cache_key[:12]}...")
                    db.delete(cached)
                    db.commit()
                    db.close()
                    cached = None

            if cached:
                task = ProcessingTask(
                    id=task_id,
                    original_filename=file.filename,
                    file_path=str(file_path),
                    separation_type=separation_type,
                    status=TaskStatus.COMPLETED,
                    progress=100
                )
                task.stems = json.loads(cached.stems) if cached.stems else {}
                task.bpm = cached.bpm or 126
                task.key = cached.key or "E"
                task.duration = cached.duration or 0
                task.chords = json.loads(cached.chords) if cached.chords else []
                task.keyInfo = json.loads(cached.key_info) if cached.key_info else None
                task.quality_profile = profile_name
                task.estimated_cost_usd = 0.0
                task.cache_hit = True
                tasks_storage[task_id] = task

                db_task = TaskDB(
                    id=task_id,
                    original_filename=file.filename,
                    file_path=str(file_path),
                    separation_type=separation_type,
                    status=TaskStatus.COMPLETED,
                    progress=100,
                    stems=json.dumps(task.stems),
                    bpm=task.bpm,
                    key=task.key,
                    duration=task.duration,
                    chords=json.dumps(task.chords),
                    completed_at=datetime.utcnow(),
                )
                db.add(db_task)
                db.commit()
                db.close()
                print(f"[CACHE] Hit for task {task_id} with key {cache_key[:12]}...")
                return {
                    "success": True,
                    "data": {
                        "task_id": task_id,
                        "status": "completed",
                        "message": "Separación resuelta desde cache",
                        "filename": file.filename,
                        "cache_hit": True
                    }
                }
            db.close()
        except Exception as cache_e:
            print(f"[CACHE] Cache lookup failed: {cache_e}")

        # Crear tarea
        task = ProcessingTask(
            id=task_id,
            original_filename=file.filename,
            file_path=str(file_path),
            separation_type=separation_type,
            status=TaskStatus.PROCESSING,
            progress=0
        )
        task.quality_profile = profile_name
        task.requested_tracks = requested_tracks
        task.cache_key = cache_key
        tasks_storage[task_id] = task
        
        # Guardar en base de datos para persistencia y Metabase
        try:
            db = SessionLocal()
            db_task = TaskDB(
                id=task_id,
                original_filename=file.filename,
                file_path=str(file_path),
                separation_type=separation_type,
                status=TaskStatus.PROCESSING,
                progress=0
            )
            db.add(db_task)
            db.commit()
            db.close()
            print(f"[DATABASE] Tarea de separación inicializada: {task_id}")
        except Exception as db_e:
            print(f"[DATABASE ERROR] No se pudo guardar tarea inicial: {db_e}")

        # Encolar procesamiento en lugar de lanzarlo directamente
        print(f"[QUEUE] Encolando tarea {task.id}...")
        
        await queue_manager.add_task(
            task.id,
            process_audio,
            task,
            custom_tracks,
            is_hifi_bool,
            task.quality_profile
        )
        
        queue_pos = queue_manager.get_queue_position(task.id)
        is_real_queue = queue_manager.has_real_queue()
        
        return {
            "success": True,
            "data": {
                "task_id": task_id,
                "status": "queued",
                "queue_position": queue_pos,
                "is_real_queue": is_real_queue,
                "message": "Separación en cola por alta demanda" if is_real_queue else "Separación iniciada con Demucs",
                "filename": file.filename
            }
        }
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_audio(
    task: ProcessingTask,
    custom_tracks: Optional[Dict] = None,
    hi_fi: bool = False,
    quality_profile: str = "pro_balanced",
):
    """Background task to process audio"""
    try:
        print(f"\n{'='*60}")
        print(f"[PROCESS] Starting audio processing for task: {task.id}")
        print(f"   - File: {task.file_path}")
        print(f"   - Separation type: {task.separation_type}")
        print(f"   - Custom tracks: {custom_tracks}")
        print(f"{'='*60}\n")
        
        # Update task status
        task.status = TaskStatus.PROCESSING
        task.progress = 10
        tasks_storage[task.id] = task
        print(f"[PROCESS] Task stored in memory: {task.id}")
        
        # Callback para actualizar progreso (en memoria y DB)
        def update_progress(progress: int, message: str = ""):
            current_task = tasks_storage.get(task.id)
            if current_task:
                current_task.progress = progress
                tasks_storage[task.id] = current_task
            else:
                task.progress = progress
                tasks_storage[task.id] = task
            print(f"[PROGRESS] {progress}% - {message} [Task ID: {task.id}]")
            
            # Persistir progreso en DB cada vez que cambia significativamente
            try:
                db = SessionLocal()
                db.query(TaskDB).filter(TaskDB.id == task.id).update({"progress": progress})
                db.commit()
                db.close()
            except:
                pass
        
        # Determinar qué tracks solicitar
        requested_tracks = getattr(task, "requested_tracks", None) or determine_requested_tracks(task.separation_type, custom_tracks)

        quality_profile = (quality_profile or getattr(task, "quality_profile", "pro_balanced") or "pro_balanced").lower()
        if quality_profile == "pro_balanced" and len(requested_tracks) > 8:
            # Guardrail: en perfil balanceado evitamos costos/latenicas extremos.
            requested_tracks = requested_tracks[:8]
            
        print(f"[MODAL] Tracks a extraer: {requested_tracks}")
        update_progress(20, "Subiendo audio a Instancias Base de Inteligencia Artificial (Nvidia T4 GPU)...")
        
        # 1. Empacar Audio Original
        with open(task.file_path, "rb") as f:
            audio_bytes = f.read()

        # 2. Conectar e Invocar el Cerebro en Modal
        import modal
        print("[MODAL] Starting remote GPU separation...")
        update_progress(50, "Cocinando magia sonora con Tarjetas Gráficas de última generación...")
        
        remote_gpu_func = modal.Function.from_name("moises-demucs-worker", "separate_audio")
        # Timeout + reintento para evitar cuelgues temporales del worker remoto.
        stems_bytes = None
        last_remote_error: Optional[Exception] = None
        total_attempts = max(1, REMOTE_SEPARATION_RETRIES + 1)
        for attempt_idx in range(total_attempts):
            try:
                if attempt_idx > 0:
                    update_progress(
                        52,
                        f"Reintentando separación remota ({attempt_idx + 1}/{total_attempts})..."
                    )
                stems_bytes = await asyncio.wait_for(
                    remote_gpu_func.remote.aio(
                        audio_bytes,
                        requested_tracks,
                        hi_fi,
                        quality_profile
                    ),
                    timeout=REMOTE_SEPARATION_TIMEOUT_SECONDS
                )
                break
            except Exception as remote_e:
                import traceback as _tb
                last_remote_error = remote_e
                print(
                    f"[MODAL] Remote attempt {attempt_idx + 1}/{total_attempts} failed: {remote_e}"
                )
                print(f"[MODAL] Traceback:\n{_tb.format_exc()}")
                if attempt_idx >= total_attempts - 1:
                    break

        if stems_bytes is None:
            base_msg = "Worker remoto no disponible"
            if isinstance(last_remote_error, asyncio.TimeoutError):
                raise RuntimeError(
                    f"{base_msg}: timeout de {REMOTE_SEPARATION_TIMEOUT_SECONDS}s agotado (saturado o lento)"
                )
            err_txt = str(last_remote_error or "").lower()
            if (
                "unauthorized" in err_txt
                or "forbidden" in err_txt
                or "token" in err_txt
                or "credential" in err_txt
            ):
                raise RuntimeError(
                    f"{base_msg}: credenciales de Modal inválidas o faltantes ({last_remote_error})"
                )
            if "not found" in err_txt or "404" in err_txt:
                raise RuntimeError(
                    f"{base_msg}: función Modal no encontrada (moises-demucs-worker.separate_audio)"
                )
            if "klass" in err_txt or "keyerror" in err_txt:
                raise RuntimeError(
                    f"{base_msg}: incompatibilidad del cliente Modal en Railway (error interno: {last_remote_error})"
                )
            raise RuntimeError(
                f"{base_msg}: {last_remote_error or 'error desconocido en worker'}"
            )
        
        # 3. Extraer Tracks De Vueltos por internet y escupirlos al Disco para subida a B2
        print("[MODAL] Remote extraction finished, writing stems to disk...")
        try:
            modal_keys = list((stems_bytes or {}).keys())
            print(f"[CLICK_DEBUG] Modal returned stems keys: {modal_keys}")
            for k, v in (stems_bytes or {}).items():
                print(f"[CLICK_DEBUG] Modal stem bytes {k}: {len(v) if v else 0}")
        except Exception as _dbg_e:
            print(f"[CLICK_DEBUG] Error inspecting Modal stems_bytes: {_dbg_e}")
        update_progress(80, "¡La cirugía fue un éxito! Recibiendo partes diseccionadas desde el Espacio Exterior...")
        
        stems = {}
        target_dir = Path(task.file_path).parent / "demucs_output"
        target_dir.mkdir(exist_ok=True, parents=True)
        
        for key_name, byte_stream in stems_bytes.items():
            stem_path = target_dir / f"{key_name}.wav"
            with open(stem_path, "wb") as f_out:
                f_out.write(byte_stream)
            stems[key_name] = str(stem_path)
            try:
                size = stem_path.stat().st_size
                print(f"[CLICK_DEBUG] Wrote stem file {key_name}: path={stem_path} size={size}")
            except Exception as _size_e:
                print(f"[CLICK_DEBUG] Could not stat stem file {key_name}: {_size_e}")
        
        print(f"\n[PROCESS] Demucs separation completed! Got {len(stems)} stems")
        print(f"   Stems: {list(stems.keys())}")
        
        # Generar Click Track Sincronizado (preferido: viene desde Modal).
        update_progress(82, "Sincronizando metrónomo con la métrica del audio...")
        print(f"[CLICK_DEBUG] Pre-click stems keys at backend: {list(stems.keys())}")
        click_key = _find_click_key(stems)
        if not click_key:
            try:
                print("[PROCESS] Click no vino desde Modal, ejecutando fallback local...")
                click_source_path = stems.get("instrumental") or next(iter(stems.values()))
                print(f"[CLICK_DEBUG] Local click source selected: {click_source_path}")
                click_bpm = await asyncio.to_thread(
                    generate_click_track_audio,
                    str(click_source_path),
                    str(target_dir),
                )
                click_key = f"click_{int(round(click_bpm))}"
                click_path = target_dir / f"{click_key}.wav"
                stems[click_key] = str(click_path)
                click_size = click_path.stat().st_size if click_path.exists() else 0
                print(
                    f"[PROCESS] Click track generado localmente (fallback) "
                    f"key={click_key} size={click_size} path={click_path}"
                )
            except Exception as e:
                print(f"[PROCESS] Error generando click track en fallback local: {e}")
                import traceback
                print(f"[PROCESS] Click track traceback:\n{traceback.format_exc()}")
        else:
            try:
                click_path = Path(stems[click_key])
                click_size = click_path.stat().st_size if click_path.exists() else 0
                print(
                    f"[CLICK_DEBUG] Click came from Modal: key={click_key} "
                    f"path={click_path} exists={click_path.exists()} size={click_size}"
                )
            except Exception as _click_dbg_e:
                print(f"[CLICK_DEBUG] Error inspecting Modal click file: {_click_dbg_e}")
        
        # Upload stems to B2 for online playback
        print(f"\n[PROCESS] Uploading {len(stems)} stems to B2...")
        print(f"[CLICK_DEBUG] Upload input stems keys: {list(stems.keys())}")
        task.progress = 85
        tasks_storage[task.id] = task
        
        stem_urls = await upload_stems_to_b2(stems, task.id)
        
        print(f"[PROCESS] B2 upload completed! {len(stem_urls)} stems uploaded")
        print(f"[CLICK_DEBUG] Upload output stem URLs keys: {list(stem_urls.keys())}")
        print(f"[CLICK_DEBUG] Upload output has_click={'click' in stem_urls}")
        
        task.progress = 95
        tasks_storage[task.id] = task
        
        # Analizar metadata del audio original (En hilo separado para NO bloquear el event loop)
        print(f"[PROCESS] Analizando metadata del audio...")
        try:
            bpm, duration = await asyncio.to_thread(detect_bpm_and_duration, task.file_path)
            print(f"[PROCESS] BPM detectado: {bpm}, Duración: {duration}s")
        except Exception as e:
            print(f"[PROCESS] Error detectando BPM: {e}")
            bpm = 126
            duration = 0
        
        # Detectar key (tonalidad) y acordes
        try:
            from chord_analyzer import ChordAnalyzer
            from collections import Counter
            analyzer = ChordAnalyzer()
            
            # Analizar acordes (En hilo separado para NO bloquear el event loop)
            print(f"[PROCESS] Analizando acordes...")
            chords_list = await asyncio.to_thread(analyzer.analyze_chords, task.file_path)
            
            # Convertir acordes a dict
            chords_data = [
                {
                    "chord": chord.chord,
                    "confidence": float(chord.confidence),
                    "start_time": float(chord.start_time),
                    "end_time": float(chord.end_time),
                    "root_note": chord.root_note,
                    "chord_type": chord.chord_type
                }
                for chord in chords_list
            ]
            
            # Detectar key basándose en la escala (más preciso)
            if len(chords_list) > 0:
                # [Scales definitions...]
                major_scales = {
                    'C': ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
                    'C#': ['C#', 'D#m', 'E#m', 'F#', 'G#', 'A#m', 'B#dim'],
                    'D': ['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim'],
                    'D#': ['D#', 'Fm', 'Gm', 'G#', 'A#', 'Cm', 'Ddim'],
                    'E': ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim'],
                    'F': ['F', 'Gm', 'Am', 'A#', 'C', 'Dm', 'Edim'],
                    'F#': ['F#', 'G#m', 'A#m', 'B', 'C#', 'D#m', 'E#dim'],
                    'G': ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'],
                    'G#': ['G#', 'A#m', 'Cm', 'C#', 'D#', 'Fm', 'Gdim'],
                    'A': ['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim'],
                    'A#': ['A#', 'Cm', 'Dm', 'D#', 'F', 'Gm', 'Adim'],
                    'B': ['B', 'C#m', 'D#m', 'E', 'F#', 'G#m', 'A#dim']
                }
                
                # Extraer acordes únicos detectados
                detected_chords = set(chord.chord for chord in chords_list)
                
                # Calcular coincidencias con cada escala
                best_match_key = None
                best_match_score = 0
                
                for scale_key, scale_chords in major_scales.items():
                    # Contar cuántos acordes detectados están en esta escala
                    matches = sum(1 for chord in detected_chords if chord in scale_chords)
                    score = matches / len(detected_chords) if detected_chords else 0
                    
                    if score > best_match_score:
                        best_match_score = score
                        best_match_key = scale_key
                
                key = best_match_key if best_match_key else "C"
                keyInfo_data = {
                    "key": key,
                    "mode": "major",
                    "confidence": best_match_score,
                    "tonic": key
                }
                print(f"[PROCESS] Key detectada por escala: {key} major (coincidencia: {best_match_score:.2f})")
            else:
                # Fallback: usar análisis espectral (en hilo separado)
                key_result = await asyncio.to_thread(analyzer.analyze_key, task.file_path)
                key = key_result.key if key_result else "E"
                keyInfo_data = {
                    "key": key_result.key if key_result else "Unknown",
                    "mode": key_result.mode if key_result else "major",
                    "confidence": float(key_result.confidence) if key_result else 0.0,
                    "tonic": key_result.tonic if key_result else "Unknown"
                } if key_result else None
            
            print(f"[PROCESS] Acordes detectados: {len(chords_data)}, Key: {key}")
        except Exception as e:
            print(f"[PROCESS] Error detectando acordes/key: {e}")
            import traceback
            traceback.print_exc()
            key = "E"
            chords_data = []
            keyInfo_data = None
        
        estimated_cost_usd = estimate_processing_cost(duration, requested_tracks, quality_profile, hi_fi)
        if quality_profile == "pro_balanced" and estimated_cost_usd > 0.35:
            task.cost_guardrail_triggered = True
        else:
            task.cost_guardrail_triggered = False

        # Update task with results
        task.stems = stem_urls
        task.status = TaskStatus.COMPLETED
        task.progress = 100
        task.bpm = bpm
        task.key = key
        task.timeSignature = '4/4'
        task.duration = duration
        task.chords = chords_data
        task.keyInfo = keyInfo_data
        task.quality_profile = quality_profile
        task.requested_tracks = requested_tracks
        task.estimated_cost_usd = estimated_cost_usd
        
        tasks_storage[task.id] = task
        
        # PERSISTIR RESULTADOS EN BASE DE DATOS PARA METABASE
        try:
            import json
            db = SessionLocal()
            db_update = {
                "status": task.status,
                "progress": 100,
                "stems": json.dumps(stem_urls),
                "bpm": bpm,
                "key": key,
                "duration": duration,
                "chords": json.dumps(chords_data),
                "completed_at": datetime.utcnow()
            }
            db.query(TaskDB).filter(TaskDB.id == task.id).update(db_update)
            db.commit()

            cache_key = getattr(task, "cache_key", None)
            if cache_key:
                cache_entry = SeparationCacheDB(
                    cache_key=cache_key,
                    stems=json.dumps(stem_urls),
                    bpm=bpm,
                    key=key,
                    duration=duration,
                    chords=json.dumps(chords_data),
                    key_info=json.dumps(keyInfo_data) if keyInfo_data else None,
                    model_version=CACHE_MODEL_VERSION,
                    created_at=datetime.utcnow(),
                )
                db.merge(cache_entry)
                db.commit()
            db.close()
            print(f"[DATABASE] Resultados guardados en Metabase para tarea: {task.id}")
        except Exception as db_e:
            print(f"[DATABASE ERROR] No se pudieron guardar resultados finales: {db_e}")
            import traceback
            traceback.print_exc()

        print(f"\n{'='*60}")
        print(f"[PROCESS] Audio processing COMPLETED for task: {task.id}")
        print(f"   - Status: {task.status}")
        print(f"   - Progress: {task.progress}%")
        print(f"   - Stems: {len(stem_urls)}")
        print(f"   - BPM: {bpm}, Key: {key}, Duration: {duration}s")
        print(f"{'='*60}\n")
        
    except asyncio.TimeoutError:
        task.status = TaskStatus.FAILED
        task.error = f"Tiempo de espera agotado en separación remota ({REMOTE_SEPARATION_TIMEOUT_SECONDS}s)"
        tasks_storage[task.id] = task
        try:
            db = SessionLocal()
            db.query(TaskDB).filter(TaskDB.id == task.id).update(
                {"status": TaskStatus.FAILED, "error": task.error}
            )
            db.commit()
            db.close()
        except Exception:
            pass
        print(f"\n[PROCESS] Processing TIMEOUT for task {task.id}: {task.error}")
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        tasks_storage[task.id] = task
        try:
            db = SessionLocal()
            db.query(TaskDB).filter(TaskDB.id == task.id).update(
                {"status": TaskStatus.FAILED, "error": task.error}
            )
            db.commit()
            db.close()
        except Exception:
            pass
        print(f"\n[PROCESS] Processing ERROR for task {task.id}: {e}")
        import traceback
        traceback.print_exc()

async def upload_stems_to_b2(stems: Dict[str, str], task_id: str) -> Dict[str, str]:
    """Upload separated stems to B2 and return URLs"""
    backend_url = os.getenv("BACKEND_URL", os.getenv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:8000"))

    def build_fallback_url(stem_path: str) -> str:
        try:
            rel_path = Path(stem_path).relative_to(Path.cwd())
            return f"{backend_url}/audio/{rel_path}".replace("\\", "/")
        except Exception:
            return f"{backend_url}/audio/{stem_path}".replace("\\", "/")

    try:
        from b2_uploader import b2_uploader
        
        b2_stems = await b2_uploader.upload_all_stems_to_b2(stems, "system", task_id)
        print(f"[CLICK_DEBUG] Raw B2 response keys: {list((b2_stems or {}).keys())}")
        # Si B2 devuelve incompleto, completar faltantes con fallback local.
        merged_stems = dict(b2_stems or {})
        for stem_name, stem_path in stems.items():
            if stem_name not in merged_stems:
                fallback_url = build_fallback_url(stem_path)
                merged_stems[stem_name] = fallback_url
                print(f"Fallback URL for missing B2 stem {stem_name}: {fallback_url}")
        print(f"[CLICK_DEBUG] Merged stems keys after fallback completion: {list(merged_stems.keys())}")
        return merged_stems
        
    except Exception as e:
        print(f"ERROR uploading stems to B2: {e}")
        # Si falla B2, convertir rutas locales a URLs del backend
        fallback_urls = {}
        for stem_name, stem_path in stems.items():
            stem_url = build_fallback_url(stem_path)
            fallback_urls[stem_name] = stem_url
            print(f"Fallback URL for {stem_name}: {stem_url}")
        print(f"[CLICK_DEBUG] Full fallback stems keys (B2 exception path): {list(fallback_urls.keys())}")
        return fallback_urls

@app.get("/debug/tasks")
async def debug_tasks():
    """Debug endpoint to see all tasks in memory"""
    tasks_info = {}
    for task_id, task in tasks_storage.items():
        tasks_info[task_id] = {
            "status": task.status,
            "progress": task.progress,
            "separation_type": task.separation_type,
            "has_stems": bool(task.stems) if hasattr(task, 'stems') else False,
            "error": task.error if hasattr(task, 'error') else None
        }
    return {
        "total_tasks": len(tasks_storage),
        "tasks": tasks_info
    }

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    """Get processing status"""
    task = await get_task_status(task_id)
    if not task:
        print(f"[STATUS] Task not found: {task_id}")
        print(f"   Available tasks in storage: {list(tasks_storage.keys())}")
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Log current status
    print(f"[STATUS] Task {task_id}: status={task.status}, progress={task.progress}%")
    
    # Return stems URLs
    stems_urls = None
    if task.status == TaskStatus.COMPLETED and task.stems:
        stems_urls = task.stems
        print(f"[STATUS] Task completed with {len(stems_urls)} stems")
    
    # Get metadata from task (with fallbacks)
    bpm = getattr(task, 'bpm', 126)
    key = getattr(task, 'key', 'E')
    timeSignature = getattr(task, 'timeSignature', '4/4')
    duration = getattr(task, 'duration', 0)
    chords = getattr(task, 'chords', None)
    keyInfo = getattr(task, 'keyInfo', None)
    
    queue_pos = queue_manager.get_queue_position(task_id)
    is_real_queue = task.status == TaskStatus.QUEUED and queue_manager.has_real_queue()
    
    response = {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "stems": stems_urls,
        "error": task.error if hasattr(task, 'error') and task.error else None,
        "bpm": bpm,
        "key": key,
        "timeSignature": timeSignature,
        "duration": duration,
        "chords": chords,
        "keyInfo": keyInfo,
        "queue_position": queue_pos if task.status == TaskStatus.QUEUED else 0,
        "is_real_queue": is_real_queue
    }
    
    if task.status == TaskStatus.QUEUED:
        response["message"] = f"Tu separación está en cola. Posición: {queue_pos}"
    
    if hasattr(task, "quality_profile"):
        response["quality_profile"] = task.quality_profile
    if hasattr(task, "estimated_cost_usd"):
        response["estimated_cost_usd"] = task.estimated_cost_usd
    if hasattr(task, "cost_guardrail_triggered"):
        response["cost_guardrail_triggered"] = task.cost_guardrail_triggered
    if hasattr(task, "cache_hit"):
        response["cache_hit"] = task.cache_hit
    
    return response

@app.get("/audio/{path:path}")
async def serve_audio(path: str):
    """
    Serve audio stems.
    Priority order:
      1. Exact local path (Path.cwd() / path)
      2. Demucs output fallback: stems/{task_id}/{stem}.wav → uploads/{task_id}/demucs_output/{stem}.wav
      3. B2 proxy (production / when B2 is reachable)
    """
    try:
        cwd = Path.cwd()

        # 1. Exact local path check
        local_path = Path(path) if Path(path).is_absolute() else cwd / path
        if local_path.exists() and local_path.is_file():
            print(f"[AUDIO] Serving from local path: {local_path}")
            return FileResponse(
                path=str(local_path),
                media_type="audio/wav",
                headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600"}
            )

        # 2. Demucs output fallback
        # B2 path format:   stems/{task_id}/{stem}.wav
        # Local disk format: uploads/{task_id}/demucs_output/{stem}.wav
        import re
        stems_match = re.match(r'^stems/([^/]+)/([^/]+\.wav)$', path)
        if stems_match:
            task_id = stems_match.group(1)
            stem_file = stems_match.group(2)
            demucs_path = cwd / "uploads" / task_id / "demucs_output" / stem_file
            if demucs_path.exists() and demucs_path.is_file():
                print(f"[AUDIO] Serving from demucs_output fallback: {demucs_path}")
                return FileResponse(
                    path=str(demucs_path),
                    media_type="audio/wav",
                    headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600"}
                )
            else:
                print(f"[AUDIO] demucs_output path not found: {demucs_path}")

        # 3. B2 proxy fallback (production)
        import requests
        b2_bucket = os.getenv("B2_BUCKET_NAME", "Multitrack")
        b2_key = f"audio/{path}" if not path.startswith("audio/") else path
        b2_url = f"https://f005.backblazeb2.com/file/{b2_bucket}/{b2_key}"

        print(f"[RESCUE] Proxying to B2 --> {b2_url}")

        def fetch():
            return requests.get(b2_url, timeout=8)  # 8s timeout — fail fast locally

        r = await asyncio.to_thread(fetch)
        print(f"[RESCUE] B2 Status: {r.status_code}")

        if r.status_code == 200:
            return Response(
                content=r.content,
                media_type="audio/wav",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Content-Length": str(len(r.content)),
                    "Cache-Control": "public, max-age=3600"
                }
            )
        else:
            print(f"[RESCUE] B2 Error: {r.status_code}")
            return Response(
                content=json.dumps({"error": "B2 failure", "status": r.status_code, "url_tried": b2_url}),
                media_type="application/json",
                status_code=r.status_code
            )

    except Exception as e:
        print(f"[RESCUE] Crash: {str(e)}")
        return Response(
            content=json.dumps({"error": str(e)}),
            media_type="application/json",
            status_code=500
        )







@app.get("/download/{task_id}/{stem_name}")
async def download_stem(task_id: str, stem_name: str):
    """Download separated stem"""
    task = await get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Task not completed")
    
    # Check if stems exist in the task
    if not task.stems or stem_name not in task.stems:
        raise HTTPException(status_code=404, detail="Stem not found")
    
    stem_path = Path(task.stems[stem_name])
    if not stem_path.exists():
        raise HTTPException(status_code=404, detail="Stem file not found")
    
    return FileResponse(
        path=str(stem_path),
        filename=f"{stem_name}",
        media_type="audio/wav"
    )

async def get_task_status(task_id: str) -> Optional[ProcessingTask]:
    """Get task status from memory storage or database fallback"""
    # 1. Intentar memoria (más rápido para tareas activas)
    task = tasks_storage.get(task_id)
    if task:
        return task
        
    # 2. Intentar Base de Datos (para tareas persistentes/Metabase)
    try:
        import json
        db = SessionLocal()
        db_task = db.query(TaskDB).filter(TaskDB.id == task_id).first()
        db.close()
        
        if db_task:
            # Convertir de DB a ProcessingTask (Pydantic)
            stems = json.loads(db_task.stems) if db_task.stems else None
            chords = json.loads(db_task.chords) if db_task.chords else None
            
            return ProcessingTask(
                id=db_task.id,
                original_filename=db_task.original_filename,
                file_path=db_task.file_path,
                separation_type=db_task.separation_type,
                status=db_task.status,
                progress=db_task.progress,
                stems=stems,
                error=db_task.error,
                bpm=db_task.bpm,
                key=db_task.key,
                duration=db_task.duration,
                chords=chords
            )
    except Exception as e:
        print(f"[DATABASE ERROR] Error consultando tarea {task_id}: {e}")
        
    return None

# Chord Analysis Endpoints
@app.post("/api/analyze-chords")
async def analyze_chords(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(None)
):
    """Analyze chords and key of an audio file from URL or upload"""
    try:
        # Generate unique task ID
        task_id = str(uuid.uuid4())
        
        # Save uploaded file with original extension
        ext = Path(file.filename or "audio.wav").suffix
        upload_dir = Path("uploads") / task_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / f"audio{ext}"
        
        if file and file.filename:
            # Upload file provided
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            print(f"[CHORD] Saved uploaded file for analysis: {file_path}")
        else:
            # No file provided, this endpoint now expects URL in request body
            return {"error": "No file provided. Use /api/analyze-chords-url endpoint for URL analysis."}
        
        # Create task
        task = ProcessingTask(
            id=task_id,
            original_filename=file.filename or "audio.wav",
            file_path=str(file_path),
            separation_type="chord-analysis",
            status=TaskStatus.PROCESSING,
            progress=0
        )
        tasks_storage[task_id] = task
        
        # Start chord analysis in background
        background_tasks.add_task(process_chord_analysis, task)
        
        return {
            "task_id": task_id,
            "status": "processing",
            "message": "Chord analysis started"
        }
        
    except Exception as e:
        print(f"Error in analyze_chords endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-chords-url")
async def analyze_chords_from_url(
    background_tasks: BackgroundTasks,
    request: dict
):
    """Analyze chords from audio URL"""
    try:
        import requests
        import os
        import shutil
        from pathlib import Path
        
        audio_url = request.get("url")
        if not audio_url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Generate unique task ID
        task_id = str(uuid.uuid4())
        
        # Download file from URL
        upload_dir = Path("uploads") / task_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / "audio.wav"
        
        print(f"Processing audio from URL: {audio_url}")
        
        # Check if it's a local backend URL
        if audio_url.startswith("http://localhost:8000/audio/") or audio_url.startswith("http://127.0.0.1:8000/audio/"):
            # Extract the file path from the URL
            url_path = audio_url.replace("http://localhost:8000/audio/", "").replace("http://127.0.0.1:8000/audio/", "")
            # Try to find the file in the uploads directory
            
            # Search for the file in uploads directory (current directory is backend/)
            uploads_dir = Path("uploads")
            found_file = None
            
            for root, dirs, files in os.walk(uploads_dir):
                for file in files:
                    if file.endswith(('.mp3', '.wav', '.m4a', '.flac')):
                        file_path_found = Path(root) / file
                        # Check if this might be the file we're looking for
                        if url_path in str(file_path_found) or file in url_path:
                            found_file = file_path_found
                            break
                if found_file:
                    break
            
            if found_file and found_file.exists():
                # Copy the existing file
                shutil.copy2(found_file, file_path)
                print(f"Using existing file: {found_file} -> {file_path}")
            else:
                # Fallback: try to download anyway
                print(f"Local file not found, trying to download: {audio_url}")
                response = requests.get(audio_url, timeout=30)
                response.raise_for_status()
                
                with open(file_path, "wb") as buffer:
                    buffer.write(response.content)
                
                print(f"Downloaded and saved audio file: {file_path}")
        else:
            # External URL - download normally
            response = requests.get(audio_url, timeout=30)
            response.raise_for_status()
            
            with open(file_path, "wb") as buffer:
                buffer.write(response.content)
            
            print(f"Downloaded and saved audio file: {file_path}")
        
        # Create task
        task = ProcessingTask(
            id=task_id,
            original_filename="audio_from_url.wav",
            file_path=str(file_path),
            separation_type="chord-analysis",
            status=TaskStatus.PROCESSING,
            progress=0
        )
        tasks_storage[task_id] = task
        
        # Start chord analysis in background
        background_tasks.add_task(process_chord_analysis, task)
        
        return {
            "task_id": task_id,
            "status": "processing",
            "message": "Chord analysis started from URL"
        }
        
    except Exception as e:
        print(f"Error in analyze_chords_from_url endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chord-analysis/{task_id}")
async def get_chord_analysis(task_id: str):
    """Get chord analysis results"""
    task = tasks_storage.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Chords are already stored as dictionaries, so we can return them directly
    chords_data = getattr(task, 'chords', [])
    if chords_data is None:
        chords_data = []

    # Key is already stored as dictionary, so we can return it directly
    key_data = getattr(task, 'key', None)
    
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "chords": chords_data,
        "key": key_data,
        "error": task.error if hasattr(task, 'error') else None
    }

async def process_chord_analysis(task: ProcessingTask):
    """Background task to analyze chords"""
    try:
        print(f"Starting chord analysis for task {task.id}")
        print(f"File path: {task.file_path}")
        
        # Check if file exists
        import os
        if not os.path.exists(task.file_path):
            raise Exception(f"Audio file not found: {task.file_path}")
        
        # Initialize chord analyzer
        print("Initializing chord analyzer...")
        from chord_analyzer import ChordAnalyzer
        analyzer = ChordAnalyzer()
        
        # Update progress
        task.progress = 20
        task.status = TaskStatus.PROCESSING
        
        # Analyze chords
        print("Analyzing chords...")
        chords = analyzer.analyze_chords(task.file_path)
        print(f"Found {len(chords)} chords")
        task.progress = 60
        
        # Analyze key
        print("Analyzing key...")
        key_info = analyzer.analyze_key(task.file_path)
        print(f"Key analysis result: {key_info}")
        task.progress = 80
        
        # Save results
        task.chords = [
            {
                "chord": chord.chord,
                "confidence": float(chord.confidence),
                "start_time": float(chord.start_time),
                "end_time": float(chord.end_time),
                "root_note": chord.root_note,
                "chord_type": chord.chord_type
            }
            for chord in chords
        ]
        
        task.key = {
            "key": key_info.key if key_info else "Unknown",
            "mode": key_info.mode if key_info else "Unknown",
            "confidence": float(key_info.confidence) if key_info else 0.0,
            "tonic": key_info.tonic if key_info else "Unknown"
        } if key_info else None
        
        task.progress = 100
        task.status = TaskStatus.COMPLETED
        tasks_storage[task.id] = task
        
        print(f"Chord analysis completed for task {task.id}")
        print(f"Chords: {len(task.chords) if task.chords else 0}")
        print(f"Key: {task.key}")
        
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        tasks_storage[task.id] = task
        print(f"Chord analysis error: {e}")

@app.post("/api/analyze-bpm")
async def analyze_bpm(file: UploadFile = File(...)):
    """
    Analiza el BPM y offset del primer beat de un archivo de audio
    """
    try:
        # Crear directorio temporal si no existe
        temp_dir = Path("temp_analysis")
        temp_dir.mkdir(exist_ok=True)
        
        # Guardar archivo temporal
        temp_file = temp_dir / f"temp_{uuid.uuid4()}_{file.filename}"
        with open(temp_file, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        try:
            # Cargar audio con librosa (asegurando mono para análisis)
            y, sr = librosa.load(str(temp_file), mono=True)
            
            # Detectar tempo y beats
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='time')
            tempo_array = np.asarray(tempo).reshape(-1)
            tempo_value = float(tempo_array[0]) if tempo_array.size > 0 else 0.0
            
            # Calcular offset del primer beat
            first_beat_time = 0.0
            beat_times = np.asarray(beat_frames, dtype=float).reshape(-1)
            if len(beat_times) > 0:
                first_beat_time = float(beat_times[0])
            
            # Detectar onset del primer ataque fuerte
            onsets = np.asarray(librosa.onset.onset_detect(y=y, sr=sr, units='time'), dtype=float).reshape(-1)
            first_onset = float(onsets[0]) if len(onsets) > 0 else 0.0
            
            # Usar el menor entre primer beat y primer onset
            offset = min(first_beat_time, first_onset) if first_onset > 0 else first_beat_time
            
            # Duración del audio
            duration = len(y) / sr
            
            # Detectar compás (time signature)
            # Análisis básico de patrones de acentuación
            if len(beat_times) >= 4:
                # Analizar patrones de acentuación en los primeros beats
                energy_per_beat = []
                for i in range(min(8, len(beat_times) - 1)):
                    start_frame = int(beat_times[i] * sr)
                    end_frame = int(beat_times[i + 1] * sr)
                    beat_energy = np.mean(np.abs(y[start_frame:end_frame]))
                    energy_per_beat.append(beat_energy)
                
                # Detectar patrón de acentuación (4/4, 3/4, etc.)
                if len(energy_per_beat) >= 4:
                    # Buscar patrones de acentuación cada 4 beats
                    accent_pattern = 4  # Default
                    if len(energy_per_beat) >= 8:
                        # Analizar si hay acentuación cada 3 beats (3/4)
                        three_beat_energy = np.mean([energy_per_beat[i] for i in range(0, len(energy_per_beat), 3)])
                        four_beat_energy = np.mean([energy_per_beat[i] for i in range(0, len(energy_per_beat), 4)])
                        
                        if three_beat_energy > four_beat_energy * 1.2:
                            accent_pattern = 3
            else:
                accent_pattern = 4
            
            result = {
                "bpm": float(round(tempo_value)),
                "offset": float(offset),
                "duration": float(duration),
                "time_signature": f"{accent_pattern}/4",
                "beat_times": beat_times.tolist()[:20],  # Primeros 20 beats
                "onsets": onsets.tolist()[:10]  # Primeros 10 onsets
            }
            
            return result
            
        finally:
            # Limpiar archivo temporal
            if temp_file.exists():
                temp_file.unlink()
                
    except Exception as e:
        print(f"Error analyzing BPM: {e}")
        raise HTTPException(status_code=500, detail=f"Error analyzing audio: {str(e)}")

def detect_offset(audio_path: str) -> float:
    """Detecta el downbeat real (primer beat fuerte del compás) en segundos."""
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    
    # 1. Detectar tempo y beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # 2. Detectar onsets (ataques)
    onset_strength = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_strength, sr=sr, units="frames",
        pre_max=3, post_max=3, pre_avg=3, post_avg=5, 
        delta=0.5, wait=20
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    
    if len(beat_times) == 0 or len(onset_times) == 0:
        return 0.1  # Fallback
    
    # 3. Buscar el primer onset que coincida con un beat (downbeat real)
    tolerance = 0.15  # 150ms de tolerancia
    
    for beat_time in beat_times:
        # Buscar onsets cerca de este beat
        for onset_time in onset_times:
            if abs(onset_time - beat_time) <= tolerance:
                # Encontramos un onset que coincide con un beat
                return round(float(max(0.1, onset_time)), 3)
    
    # 4. Si no hay coincidencia exacta, buscar el primer beat fuerte
    # Analizar energía alrededor de cada beat
    energy = np.abs(y)
    beat_energies = []
    
    for beat_time in beat_times[:5]:  # Solo los primeros 5 beats
        start_frame = int((beat_time - 0.1) * sr)
        end_frame = int((beat_time + 0.1) * sr)
        start_frame = max(0, start_frame)
        end_frame = min(len(energy), end_frame)
        
        if end_frame > start_frame:
            beat_energy = np.mean(energy[start_frame:end_frame])
            beat_energies.append((beat_time, beat_energy))
    
    if beat_energies:
        # Tomar el beat con mayor energía (más probable que sea el downbeat)
        strongest_beat = max(beat_energies, key=lambda x: x[1])
        return round(float(max(0.1, strongest_beat[0])), 3)
    
    # 5. Fallback: usar el primer beat detectado
    return round(float(max(0.1, beat_times[0])), 3)

def generate_click_track_audio(audio_path: str, output_dir: str) -> float:
    """Generate click track aligned to percussive pulse and return detected BPM."""
    import soundfile as sf
    import numpy as np
    from scipy import signal
    from pathlib import Path

    # Load audio via soundfile to avoid librosa/pkg_resources runtime issues.
    y, sr = sf.read(audio_path, dtype="float32")
    if y.ndim == 2:
        y = y.mean(axis=1)
    y = np.asarray(y, dtype=np.float32).reshape(-1)
    if y.size == 0:
        raise RuntimeError("Audio vacío para generar click")
    duration_sec = float(len(y) / sr) if sr else 0.0
    if duration_sec < 0.25:
        raise RuntimeError("Audio demasiado corto para detectar pulso")

    # Sintetizar un click estético: mezcla de sinusoides para tono y una caída percusiva (decay)
    click_dur = 0.05  # 50 ms
    t = np.linspace(0, click_dur, int(sr * click_dur), endpoint=False)
    # Tono agudo y claro como un Woodblock moderno/Metrónomo digital
    click_wave = np.sin(2 * np.pi * 1000 * t) + 0.5 * np.sin(2 * np.pi * 2000 * t)
    envelope = np.exp(-t * 200) # Envolvente con decaimiento rápido al estilo percusivo
    custom_click = click_wave * envelope
    # Normalizar levemente para que tenga un nivel saludable (0.8) sin saturar
    custom_click = (custom_click / np.max(np.abs(custom_click))) * 0.8

    # --- Beat detection without librosa ---
    # 1) Band-pass to focus kick/snare region.
    nyq = 0.5 * sr
    low = max(20.0 / nyq, 1e-6)
    high = min(250.0 / nyq, 0.999)
    if low >= high:
        low, high = 0.01, 0.25
    b, a = signal.butter(2, [low, high], btype="bandpass")
    y_bp = signal.filtfilt(b, a, y)

    # 2) Onset envelope from half-wave rectified energy.
    rectified = np.maximum(y_bp, 0.0)
    env_win = max(1, int(sr * 0.01))  # 10 ms smoothing
    onset_env = signal.convolve(rectified, np.ones(env_win) / env_win, mode="same")
    onset_env = np.maximum(0.0, onset_env - np.median(onset_env))
    onset_env = onset_env / (np.max(onset_env) + 1e-8)

    # 3) Downsample envelope for tempo detection.
    env_hz = 200.0
    env_step = max(1, int(sr / env_hz))
    onset_ds = onset_env[::env_step]
    onset_ds = onset_ds - np.mean(onset_ds)

    # 4) Autocorrelation in BPM range.
    min_bpm, max_bpm = 70.0, 190.0
    min_lag = int(env_hz * 60.0 / max_bpm)
    max_lag = int(env_hz * 60.0 / min_bpm)
    ac = signal.correlate(onset_ds, onset_ds, mode="full")
    ac = ac[len(ac) // 2 :]
    max_lag = min(max_lag, len(ac) - 1)
    if max_lag <= min_lag:
        raise RuntimeError("No se pudo estimar tempo (autocorrelation vacía)")

    ac_band = ac[min_lag : max_lag + 1]
    best_lag = int(np.argmax(ac_band)) + min_lag

    # Resolver ambiguedad x2/÷2 entre lags cercanos (musica real).
    candidate_lags = {best_lag}
    if best_lag * 2 <= max_lag:
        candidate_lags.add(best_lag * 2)
    if best_lag // 2 >= min_lag:
        candidate_lags.add(best_lag // 2)
    candidate_lags = sorted(candidate_lags)

    def lag_score(lag_value: int) -> float:
        phase_scores = []
        for phase in range(lag_value):
            idx = np.arange(phase, len(onset_ds), lag_value, dtype=int)
            if idx.size == 0:
                continue
            phase_scores.append(float(np.sum(onset_ds[idx])))
        return max(phase_scores) if phase_scores else -1.0

    best_lag = max(candidate_lags, key=lag_score)
    beat_period_sec = best_lag / env_hz
    bpm = 60.0 / max(beat_period_sec, 1e-6)

    # 5) Phase alignment: choose start offset maximizing onset energy on beat grid.
    phase_candidates = np.arange(best_lag)
    sample_count = len(onset_ds)
    best_phase = 0
    best_score = -1.0
    for phase in phase_candidates:
        idx = np.arange(phase, sample_count, best_lag, dtype=int)
        if idx.size == 0:
            continue
        score = float(np.sum(onset_ds[idx]))
        if score > best_score:
            best_score = score
            best_phase = int(phase)

    first_beat_sample = int(best_phase * env_step)
    beat_interval_samples = int(round(beat_period_sec * sr))
    beat_interval_samples = max(1, beat_interval_samples)

    print(
        f"[CLICK_DEBUG] Beat grid detected: bpm={bpm:.2f}, "
        f"interval_samples={beat_interval_samples}, first_beat_sample={first_beat_sample}"
    )

    # 6) Build click track on detected beat grid.
    clicks = np.zeros(len(y), dtype=np.float32)
    click_len = min(len(custom_click), len(clicks))
    for start in range(first_beat_sample, len(clicks), beat_interval_samples):
        end = min(start + click_len, len(clicks))
        clicks[start:end] += custom_click[: end - start]
    clicks = np.clip(clicks, -1.0, 1.0)

    # Write to WAV file with BPM in stem name.
    bpm_int = int(round(bpm))
    click_key = f"click_{bpm_int}"
    output_path = Path(output_dir) / f"{click_key}.wav"
    sf.write(str(output_path), clicks, sr, subtype='PCM_16')
    return float(bpm_int)

def detect_bpm_and_duration(audio_path: str):
    """Detecta BPM promedio y duración del audio con algoritmo mejorado."""
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    
    duration = float(len(y) / sr) if sr else 0.0

    # Usar múltiples métodos para detectar BPM más preciso
    # Método 1: beat_track con diferentes parámetros
    tempo1, beats1 = librosa.beat.beat_track(y=y, sr=sr, start_bpm=60, tightness=100)
    
    # Método 2: beat_track con parámetros más conservadores
    tempo2, beats2 = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120, tightness=50)
    
    # Método 3: Usar onset_strength para detectar tempo
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo3, beats3 = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    
    # Método 4: Análisis de espectro para detectar tempo
    tempo4, beats4 = librosa.beat.beat_track(y=y, sr=sr, units='time', hop_length=512)
    
    # Método 5: Usar tempo con diferentes hop_length
    tempo5, beats5 = librosa.beat.beat_track(y=y, sr=sr, hop_length=1024)
    
    # Método 6: Análisis de tempo con diferentes unidades
    tempo6, beats6 = librosa.beat.beat_track(y=y, sr=sr, units='frames')
    
    # Calcular promedio de los métodos
    tempos = [tempo1, tempo2, tempo3, tempo4, tempo5, tempo6]
    
    # Filtrar valores extremos (menos de 40 o más de 250 BPM)
    valid_tempos = [t for t in tempos if 40 <= t <= 250]
    
    if valid_tempos:
        # Usar la mediana para evitar outliers
        tempo = np.median(valid_tempos)
        
        # Verificar si el tempo es consistente con los beats detectados
        if len(beats1) > 0:
            beat_times = librosa.frames_to_time(beats1, sr=sr)
            if len(beat_times) > 1:
                # Calcular BPM basado en intervalos entre beats
                intervals = np.diff(beat_times)
                median_interval = np.median(intervals)
                calculated_bpm = 60.0 / median_interval
                
                # Si el BPM calculado es muy diferente, usar el calculado
                if abs(calculated_bpm - tempo) > 20:
                    tempo = calculated_bpm
    else:
        # Fallback al primer método si todos son inválidos
        tempo = tempo1
    
    # Normalización del BPM para rango musical estándar
    if tempo < 70:
        tempo = tempo * 2  # Subir al doble si está muy lento
    elif tempo > 180:
        tempo = tempo / 2  # Bajar a la mitad si está muy rápido
    
    # Asegurar que el tempo esté en un rango razonable
    tempo = max(60, min(180, tempo))
    
    # Redondear a números enteros (120, 121, 122, etc.)
    original_tempo = tempo
    print(f"BPM antes del redondeo: {tempo}")
    
    # Redondear al entero más cercano
    tempo = round(tempo)
    
    print(f"BPM después del redondeo: {original_tempo} -> {tempo}")
    print(f"BPM final que se devuelve: {tempo}")
    return tempo, duration


def estimate_processing_cost(duration_seconds: float, requested_tracks: List[str], quality_profile: str, hi_fi: bool) -> float:
    """Estimate relative processing cost in USD for monitoring/guardrails."""
    minutes = max(duration_seconds / 60.0, 0.5)
    profile_multipliers = {
        "fast": 0.8,
        "pro_balanced": 1.0,
        "hifi": 1.6,
    }
    profile_factor = profile_multipliers.get((quality_profile or "pro_balanced").lower(), 1.0)
    tracks_factor = 1.0 + max(len(requested_tracks) - 4, 0) * 0.08
    hifi_factor = 1.2 if hi_fi else 1.0
    baseline_per_minute = 0.08
    estimated = minutes * baseline_per_minute * profile_factor * tracks_factor * hifi_factor
    return round(float(estimated), 3)

@app.post("/api/analyze-key")
async def analyze_key(file: UploadFile = File(...)):
    """
    Analiza la tonalidad (key) de un archivo de audio usando Chroma CQT.
    """
    try:
        temp_dir = Path("temp_analysis")
        temp_dir.mkdir(exist_ok=True)
        temp_file = temp_dir / f"key_{uuid.uuid4()}_{file.filename}"
        
        with open(temp_file, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
            
        try:
            # Cargar audio (mono para análisis de pitch)
            y, sr = librosa.load(str(temp_file), mono=True)
            
            # Extraer Chroma CQT
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)
            
            # Definir plantillas de acordes mayores y menores
            maj_template = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            min_template = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            
            notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            
            best_key = ""
            best_score = -1
            
            for i in range(12):
                # Rotamos la plantilla para cada nota
                shifted_maj = np.roll(maj_template, i)
                shifted_min = np.roll(min_template, i)
                
                # Correlación simple
                score_maj = np.correlate(chroma_mean, shifted_maj)
                score_min = np.correlate(chroma_mean, shifted_min)
                
                if score_maj > best_score:
                    best_score = score_maj
                    best_key = f"{notes[i]}"
                if score_min > best_score:
                    best_score = score_min
                    best_key = f"{notes[i]} m"
            
            return {"key": best_key}
            
        finally:
            if temp_file.exists():
                temp_file.unlink()
                
    except Exception as e:
        print(f"Error analyzing Key: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        # Guardar el archivo temporalmente
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Detectar offset, bpm y duración
        offset = detect_offset(tmp_path)
        bpm, duration = detect_bpm_and_duration(tmp_path)

        # Eliminar archivo temporal
        os.remove(tmp_path)

        print(f"RESULTADO FINAL: offset={offset}, bpm={bpm}, duration={duration}")
        
        return {
            "success": True,
            "offset": offset,
            "bpm": bpm,
            "duration": duration
        }

    except Exception as e:
        print(f"Error analyzing audio: {e}")
        raise HTTPException(status_code=500, detail=f"Error analyzing audio: {str(e)}")

def _validate_training_manifest(manifest: dict) -> None:
    """
    Validacion robusta de 6 canales.
    """
    songs = manifest.get("songs")
    if not songs or not isinstance(songs, list):
        raise ValueError("El dataset está vacío. Cura al menos una canción.")

    for s in songs:
        sid = s.get("id")
        name = s.get("name", "Sin Título")
        ai = s.get("ai_mapping") or {}
        sources = s.get("trackSources") or {}
        
        # Validar que al menos haya ALGO mapeado
        main_keys = ["vocals", "drums", "bass", "guitar", "piano"]
        assigned = [k for k in main_keys if ai.get(k)]
        other = ai.get("other") or []
        
        if not assigned and not other:
            raise ValueError(f"La canción '{name}' no tiene ninguna pista asignada.")

        # Verificar URLs de lo asignado
        for key in assigned:
            track_id = ai[key]
            url = sources.get(track_id)
            if not url:
                raise ValueError(f"Error en '{name}': No se encuentra la URL para {key} ({track_id})")

@app.post("/api/training/start")
async def start_training(request_data: dict):
    """
    Lanzamiento robusto de entrenamiento 6-stems.
    Retorna INMEDIATAMENTE con un job_id. No espera sincronización.
    """
    try:
        import modal
        print("[BACKEND] Iniciando proceso de entrenamiento...")
        
        manifest = request_data.get("manifest")
        if not manifest:
            raise HTTPException(status_code=400, detail="Petición inválida: falta manifest")

        # 1. Validar localmente antes de llamar a la nube
        try:
            _validate_training_manifest(manifest)
        except ValueError as e:
            print(f"[BACKEND] Validación fallida: {e}")
            raise HTTPException(status_code=400, detail=str(e))

        epochs = int(request_data.get("epochs") or 20)
        
        # 2. Conectar con Modal
        print("[BACKEND] Conectando con Modal Cloud...")
        try:
            sync_func = modal.Function.from_name("moises-demucs-trainer", "sync_b2_dataset")
            train_func = modal.Function.from_name("moises-demucs-trainer", "train_model")
        except Exception as e:
            print(f"[BACKEND] Error buscando funciones en Modal: {e}")
            raise HTTPException(status_code=503, detail=f"No se pudo conectar con el motor de IA en Modal: {str(e)}")

        # 3. Lanzar sincronización como spawn (NO bloqueante - retorna en segundos)
        print(f"[BACKEND] Lanzando sincronización de {len(manifest['songs'])} temas...")
        try:
            sync_call = sync_func.spawn({"manifest": manifest})
            sync_call_id = getattr(sync_call, "object_id", None) or getattr(sync_call, "function_call_id", None)
        except Exception as e:
            print(f"[BACKEND] Error lanzando sync: {e}")
            raise HTTPException(status_code=500, detail=f"No se pudo iniciar la sincronización: {str(e)}")

        print(f"[BACKEND] Sync lanzado en segundo plano. ID: {sync_call_id}")

        # 4. Lanzar Entrenamiento también como spawn (NO bloqueante)
        print(f"[BACKEND] Lanzando entrenamiento ({epochs} épocas)...")
        try:
            train_call = train_func.spawn(epochs=epochs)
            call_id = getattr(train_call, "object_id", None) or getattr(train_call, "function_call_id", None)
        except Exception as e:
            print(f"[BACKEND] Error lanzando training: {e}")
            raise HTTPException(status_code=500, detail=f"No se pudo iniciar el entrenamiento: {str(e)}")
        
        print(f"[BACKEND] Éxito. Tarea entrenamiento ID: {call_id}")
        # Respuesta inmediata (<2seg). El frontend sondea /api/training/status
        return {
            "success": True,
            "training_call_id": call_id,
            "sync_call_id": sync_call_id,
            "message": "Tareas lanzadas en la nube. Monitoreando progreso..."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[BACKEND] CRASH INESPERADO: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error Crítico Interno: {str(e)}")

@app.get("/api/training/status/{call_id}")
async def get_training_status(call_id: str):
    try:
        import modal
        from modal.functions import FunctionCall
        
        # Conectar con la llamada asincrona
        call = FunctionCall.from_id(call_id)
        
        try:
            # Intentar obtener el resultado. Si falla con el error de libreria, saltara al except Exception
            result = call.get(timeout=0.5)
            
            stats = getattr(call, "stats", None)
            created_at = getattr(stats, "created_at", None)
            finished_at = getattr(stats, "finished_at", None)
            
            return {
                "status": "completed",
                "result": result,
                "duration": (finished_at - created_at) if (created_at and finished_at) else None
            }
        except Exception as e:
            # FALLBACK INTELIGENTE: Solo si la tarea NO está corriendo y se perdió el ID
            err_name = type(e).__name__
            if "Timeout" in err_name or "Pending" in err_name:
                print(f"[STATUS] Tarea {call_id} SIGUE EN CURSO.")
                return {"status": "running", "message": "Entrenando en la nube (GPU activa)..."}

            try:
                check_func = modal.Function.from_name("moises-demucs-trainer", "check_results")
                cloud_files = check_func.remote()
                if cloud_files.get("exists"):
                    print(f"[STATUS] Tarea {call_id} no encontrada pero MODELO DETECTADO. Enviando COMPLETED.")
                    return {
                        "status": "completed",
                        "message": "Entrenamiento finalizado y guardado.",
                        "duration": None,
                        "files": cloud_files.get("files")
                    }
            except:
                pass

            return {"status": "error", "message": f"Fallo en la nube: {str(e)}"}
            
            # Si llegamos aqui, es UN ERROR REAL de ejecucion en la nube
            print(f"[STATUS] ERROR CRITICO EN TAREA {call_id}: {e}")
            return {
                "status": "error",
                "message": f"Fallo en la nube: {str(e)}"
            }

    except Exception as e:
        print(f"[STATUS] Error consultando Modal: {e}")
        return {"status": "error", "message": f"Error de conexión: {str(e)}"}

async def extract_with_ytdlp(youtube_url: str, video_id: str):
    """Extraer audio usando yt-dlp"""
    try:
        import subprocess
        import base64
        import re
        import sys
        
        clean_url = f"https://www.youtube.com/watch?v={video_id}"
        print(f"[yt-dlp] Descargando audio de: {clean_url}")

        def run_ytdlp(args, timeout=300):
            """
            Ejecuta yt-dlp de forma robusta:
            1) intenta binario `yt-dlp`
            2) fallback a `python -m yt_dlp`
            """
            cmd_bin = ["yt-dlp", *args]
            cmd_module = [sys.executable, "-m", "yt_dlp", *args]

            try:
                return subprocess.run(cmd_bin, capture_output=True, text=True, timeout=timeout)
            except FileNotFoundError:
                print("[yt-dlp] Binario no encontrado. Usando fallback: python -m yt_dlp")
                return subprocess.run(cmd_module, capture_output=True, text=True, timeout=timeout)
        
        # Crear directorio temporal
        temp_dir = Path("temp_youtube")
        temp_dir.mkdir(exist_ok=True)
        
        # Primero obtener el título real del video
        print(f"[yt-dlp] Obteniendo título del video...")
        title_args = ["--no-playlist", "--get-title", clean_url]
        title_result = run_ytdlp(title_args, timeout=30)
        
        if title_result.returncode == 0 and title_result.stdout.strip():
            video_title = title_result.stdout.strip()
            # Limpiar caracteres no válidos para nombre de archivo
            video_title = re.sub(r'[<>:"/\\|?*]', '_', video_title)
            print(f"[yt-dlp] Título del video: {video_title}")
        else:
            video_title = video_id
            print(f"[yt-dlp] No se pudo obtener título, usando video_id: {video_id}")
        
        output_file = temp_dir / f"{video_id}.mp3"
        
        # Comando yt-dlp para descargar solo audio
        ytdlp_args = [
            "--no-playlist",
            "-x",  # Extract audio
            "--audio-format", "mp3",
            "--audio-quality", "0",  # Best quality
            "-o", str(output_file),
            clean_url
        ]
        
        print(f"[yt-dlp] Ejecutando descarga de audio...")
        
        # Ejecutar yt-dlp
        result = run_ytdlp(ytdlp_args, timeout=300)
        
        if result.returncode != 0:
            print(f"[yt-dlp] Error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"yt-dlp error: {result.stderr}")
        
        print(f"[yt-dlp] Descarga completada: {output_file}")
        
        # Leer el archivo
        with open(output_file, 'rb') as f:
            audio_data = f.read()
        
        # Limpiar archivo temporal
        output_file.unlink(missing_ok=True)
        
        # Convertir a base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        return {
            "success": True,
            "title": video_title,
            "duration": 0,
            "audioData": audio_base64,
            "format": "mp3"
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Timeout descargando de YouTube")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="yt-dlp no está disponible (ni binario ni módulo Python). Instala con: python -m pip install yt-dlp")
    except Exception as e:
        print(f"[yt-dlp] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/youtube-extract")
async def extract_youtube_audio(request: Request):
    """
    Extrae audio de YouTube.
    Por defecto usa yt-dlp (gratis/self-hosted) para evitar costo por API.
    Si YOUTUBE_EXTRACT_PROVIDER=rapidapi, intenta RapidAPI y hace fallback a yt-dlp.
    """
    try:
        import httpx
        import re
        
        data = await request.json()
        youtube_url = data.get("url")
        
        if not youtube_url:
            raise HTTPException(status_code=400, detail="URL de YouTube requerida")
        
        print(f"[YouTube API] Extrayendo audio de: {youtube_url}")
        
        # Extraer video ID de la URL
        video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', youtube_url)
        if not video_id_match:
            raise HTTPException(status_code=400, detail="URL de YouTube inválida")
        
        video_id = video_id_match.group(1)
        print(f"[YouTube API] Video ID: {video_id}")
        
        # Provider selection (default: local/free via yt-dlp)
        provider = (os.getenv("YOUTUBE_EXTRACT_PROVIDER", "ytdlp") or "ytdlp").strip().lower()

        # RAPIDAPI_KEY placeholders should be treated as missing
        rapidapi_key = (os.getenv('RAPIDAPI_KEY') or '').strip()
        rapidapi_key_missing = (
            not rapidapi_key or
            rapidapi_key.lower() in {'your-rapidapi-key-here', 'changeme', 'none', 'null'}
        )

        if provider != "rapidapi":
            print("[YouTube API] Provider=ytdlp (gratis/local)")
            return await extract_with_ytdlp(youtube_url, video_id)

        if rapidapi_key_missing:
            print("[YouTube API] Provider=rapidapi pero RAPIDAPI_KEY no válida. Fallback a yt-dlp")
            return await extract_with_ytdlp(youtube_url, video_id)
        
        # Provider=rapidapi
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                'https://youtube-mp36.p.rapidapi.com/dl',
                params={'id': video_id},
                headers={
                    'x-rapidapi-key': rapidapi_key,
                    'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
                }
            )
            
            if response.status_code != 200:
                print(f"[YouTube API] RapidAPI error: {response.status_code} - {response.text[:250]}")
                print("[YouTube API] Fallback a yt-dlp...")
                return await extract_with_ytdlp(youtube_url, video_id)
            
            result = response.json()
            print(f"[YouTube API] Respuesta: {result}")
            
            if result.get('status') != 'ok':
                print(f"[YouTube API] RapidAPI status no-ok ({result}). Fallback a yt-dlp...")
                return await extract_with_ytdlp(youtube_url, video_id)
            
            # Descargar el MP3
            mp3_url = result.get('link')
            video_title = result.get('title', 'video')
            
            if not mp3_url:
                print("[YouTube API] RapidAPI sin link. Fallback a yt-dlp...")
                return await extract_with_ytdlp(youtube_url, video_id)
            
            print(f"[YouTube API] Descargando MP3: {mp3_url}")
            
            # Descargar el archivo con timeout largo y reintentos
            max_retries = 3
            audio_data = None
            
            for attempt in range(max_retries):
                try:
                    print(f"[YouTube API] Intento {attempt + 1}/{max_retries}")
                    
                    # Timeout de 120 segundos para archivos grandes
                    download_client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
                    mp3_response = await download_client.get(
                        mp3_url,
                        headers={
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': '*/*',
                            'Referer': 'https://youtube-mp36.p.rapidapi.com/'
                        }
                    )
                    await download_client.aclose()
                    
                    print(f"[YouTube API] Status code: {mp3_response.status_code}")
                    
                    if mp3_response.status_code == 200:
                        audio_data = mp3_response.content
                        print(f"[YouTube API] Descarga exitosa: {len(audio_data)} bytes")
                        break
                    else:
                        print(f"[YouTube API] Error en descarga: {mp3_response.status_code} - {mp3_response.text[:200]}")
                        
                except Exception as e:
                    print(f"[YouTube API] Error en intento {attempt + 1}: {e}")
                    if attempt == max_retries - 1:
                        raise
                    await asyncio.sleep(2)  # Esperar 2 segundos antes de reintentar
            
            if not audio_data:
                print("[YouTube API] RapidAPI download failed. Fallback a yt-dlp...")
                return await extract_with_ytdlp(youtube_url, video_id)
            
            print(f"[YouTube API] Audio descargado: {video_title} ({len(audio_data)} bytes)")
            
            # Retornar el audio como base64
            import base64
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
            
            return {
                "success": True,
                "title": video_title,
                "duration": 0,  # RapidAPI no retorna duración
                "audioData": audio_base64,
                "format": "mp3"
            }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[YouTube API] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/pitch-shift")
async def pitch_shift_audio(request: Request):
    """
    Endpoint para cambiar el pitch (tono) de un audio sin cambiar el tempo.
    Usa pyrubberband para procesamiento de alta calidad.
    """
    try:
        data = await request.json()
        audio_url = data.get('audioUrl')
        semitones = data.get('semitones', 0)
        
        if not audio_url:
            raise HTTPException(status_code=400, detail="audioUrl requerido")
        
        if semitones == 0:
            raise HTTPException(status_code=400, detail="semitones debe ser != 0")
        
        print(f"[PITCH SHIFT] URL: {audio_url}, Semitonos: {semitones}")
        
        # Importar pyrubberband
        try:
            import pyrubberband as pyrb
            import soundfile as sf
        except ImportError:
            raise HTTPException(
                status_code=501, 
                detail="Pitch shift no disponible en este servidor. pyrubberband no está instalado debido a incompatibilidad con Python 3.12."
            )
        
        # Descargar audio
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(audio_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Error descargando audio")
            
            audio_data = response.content
        
        # Guardar temporalmente
        temp_dir = Path("temp_pitch")
        temp_dir.mkdir(exist_ok=True)
        
        temp_input = temp_dir / f"input_{uuid.uuid4()}.wav"
        temp_output = temp_dir / f"output_{uuid.uuid4()}.wav"
        
        with open(temp_input, 'wb') as f:
            f.write(audio_data)
        
        # Cargar audio
        y, sr = librosa.load(str(temp_input), sr=None, mono=False)
        print(f"[PITCH SHIFT] Audio cargado: {y.shape}, SR: {sr}")
        
        # Aplicar pitch shift SIN cambiar tempo
        print(f"[PITCH SHIFT] Procesando con pyrubberband...")
        y_shifted = pyrb.pitch_shift(y, sr, n_steps=semitones)
        print(f"[PITCH SHIFT] Procesamiento completado")
        
        # Guardar resultado
        sf.write(str(temp_output), y_shifted.T if len(y_shifted.shape) > 1 else y_shifted, sr)
        
        # Leer archivo procesado
        with open(temp_output, 'rb') as f:
            processed_data = f.read()
        
        # Limpiar archivos temporales
        temp_input.unlink(missing_ok=True)
        temp_output.unlink(missing_ok=True)
        
        # Devolver audio procesado
        return StreamingResponse(
            iter([processed_data]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"attachment; filename=pitch_shifted_{semitones}st.wav"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PITCH SHIFT] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export-audio")
async def export_audio(
    file: UploadFile = File(...),
    tempo_percent: float = Form(100.0),
    pitch_semitones: float = Form(0.0),
    export_format: str = Form("wav"),
    filename: str = Form("export"),
):
    """
    Exporta audio procesado en backend (WAV/MP3) para evitar fallos de encode en frontend.
    """
    temp_dir = Path("temp_export")
    temp_dir.mkdir(exist_ok=True)
    uid = str(uuid.uuid4())
    temp_input = temp_dir / f"in_{uid}_{file.filename or 'audio'}"
    temp_wav = temp_dir / f"out_{uid}.wav"
    temp_mp3 = temp_dir / f"out_{uid}.mp3"

    try:
        payload = await file.read()
        with open(temp_input, "wb") as f:
            f.write(payload)

        y, sr = librosa.load(str(temp_input), sr=None, mono=False)

        # librosa can return mono as shape (n,), normalize to (channels, n)
        y2 = np.asarray(y)
        if y2.ndim == 1:
            y2 = np.expand_dims(y2, axis=0)

        rate = float(max(0.5, min(2.0, tempo_percent / 100.0)))
        n_steps = float(pitch_semitones)

        if abs(rate - 1.0) > 1e-6:
            y2 = np.vstack([librosa.effects.time_stretch(ch, rate=rate) for ch in y2])

        if abs(n_steps) > 1e-6:
            y2 = np.vstack([librosa.effects.pitch_shift(ch, sr=sr, n_steps=n_steps) for ch in y2])

        y2 = np.clip(y2, -1.0, 1.0)

        import soundfile as sf
        sf.write(str(temp_wav), y2.T if y2.shape[0] > 1 else y2[0], sr, subtype="PCM_24")

        requested_format = (export_format or "wav").strip().lower()
        base_name = re.sub(r'[^0-9A-Za-z._-]', '_', filename or "export")
        if requested_format == "mp3":
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(temp_wav),
                "-codec:a", "libmp3lame",
                "-b:a", "320k",
                str(temp_mp3),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"ffmpeg mp3 error: {result.stderr[:300]}")

            with open(temp_mp3, "rb") as f:
                out_data = f.read()

            return StreamingResponse(
                iter([out_data]),
                media_type="audio/mpeg",
                headers={"Content-Disposition": f'attachment; filename="{base_name}.mp3"'},
            )

        with open(temp_wav, "rb") as f:
            out_data = f.read()

        return StreamingResponse(
            iter([out_data]),
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.wav"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[EXPORT AUDIO] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error exportando audio: {str(e)}")
    finally:
        temp_input.unlink(missing_ok=True)
        temp_wav.unlink(missing_ok=True)
        temp_mp3.unlink(missing_ok=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
