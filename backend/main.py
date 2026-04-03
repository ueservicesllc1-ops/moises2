from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import uuid
import asyncio
import tempfile
from pathlib import Path
from typing import List, Optional, Dict
import json

from audio_processor_real import audio_processor
from chord_analyzer import ChordAnalyzer
from models import ProcessingTask, TaskStatus
# from database import get_db, init_db  # Commented out - not using database
from b2_storage import b2_storage
import librosa
import numpy as np

# In-memory task storage
tasks_storage = {}

app = FastAPI(
    title="Moises Clone API",
    description="AI-powered audio separation service",
    version="1.0.0"
)

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
    # init_db()  # Commented out - not using database
    await b2_storage.initialize()

# Audio processor instance (already imported)

@app.get("/")
async def root():
    return {"message": "Moises Clone API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {"status": "OK", "message": "Backend is running"}

# Endpoints de separación (múltiples rutas para compatibilidad)
@app.post("/api/separate-demucs")
async def separate_with_demucs(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None)
):
    return await separate_audio_handler(background_tasks, file, separation_type, hi_fi, separation_options, user_id)

@app.post("/separate")
async def separate_alias(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None)
):
    return await separate_audio_handler(background_tasks, file, separation_type, hi_fi, separation_options, user_id)

async def separate_audio_handler(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    hi_fi: str = Form("false"),
    separation_options: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None)
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
        
        # Crear tarea
        task = ProcessingTask(
            id=task_id,
            original_filename=file.filename,
            file_path=str(file_path),
            separation_type=separation_type,
            status=TaskStatus.PROCESSING,
            progress=0
        )
        tasks_storage[task_id] = task
        
        # Procesar en background
        background_tasks.add_task(
            process_audio, 
            task, 
            custom_tracks,
            hi_fi == "true"
        )
        
        return {
            "success": True,
            "data": {
                "task_id": task_id,
                "status": "processing",
                "message": "Separación iniciada con Demucs",
                "filename": file.filename
            }
        }
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_audio(task: ProcessingTask, custom_tracks: Optional[Dict] = None, hi_fi: bool = False):
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
        
        # Callback para actualizar progreso
        def update_progress(progress: int, message: str = ""):
            current_task = tasks_storage.get(task.id)
            if current_task:
                current_task.progress = progress
                tasks_storage[task.id] = current_task
            else:
                task.progress = progress
                tasks_storage[task.id] = task
            print(f"[PROGRESS] {progress}% - {message} [Task ID: {task.id}]")
        
        # Determinar qué tracks solicitar
        requested_tracks = None
        
        if task.separation_type == "custom" and custom_tracks:
            requested_tracks = [track for track, enabled in custom_tracks.items() if enabled]
        elif task.separation_type == "vocals-instrumental":
            requested_tracks = ["vocals", "instrumental"]
        elif task.separation_type == "vocals-drums-bass-other":
            requested_tracks = ["vocals", "drums", "bass", "other", "guitar", "piano"]
        else:
            requested_tracks = ["vocals", "drums", "bass", "other", "guitar", "piano"]
            
        if not requested_tracks:
            requested_tracks = ["vocals", "drums", "bass", "other", "guitar", "piano"]
            
        print(f"[MODAL] Tracks a extraer: {requested_tracks}")
        update_progress(20, "Subiendo audio a Instancias Base de Inteligencia Artificial (Nvidia T4 GPU)...")
        
        # 1. Empacar Audio Original
        with open(task.file_path, "rb") as f:
            audio_bytes = f.read()

        # 2. Conectar e Invocar el Cerebro en Modal
        import modal
        print(f"[MODAL] 🚀 Disparando Cálculos Matriciales Serverless...")
        update_progress(50, "Cocinando magia sonora con Tarjetas Gráficas de última generación...")
        
        remote_gpu_func = modal.Function.lookup("moises-demucs-worker", "separate_audio")
        # Esto suspende el hilo principal 15-20 segs pero ¡SIN USAR tu procesador! Todo se opera en la Nube
        stems_bytes = await asyncio.to_thread(remote_gpu_func.remote, audio_bytes, requested_tracks, hi_fi)
        
        # 3. Extraer Tracks De Vueltos por internet y escupirlos al Disco para subida a B2
        print(f"[MODAL] ✨ Extracción terminada en tiempo récord! Serializando audios a disco físico...")
        update_progress(80, "¡La cirugía fue un éxito! Recibiendo partes diseccionadas desde el Espacio Exterior...")
        
        stems = {}
        target_dir = Path(task.file_path).parent / "demucs_output"
        target_dir.mkdir(exist_ok=True, parents=True)
        
        for key_name, byte_stream in stems_bytes.items():
            stem_path = target_dir / f"{key_name}.wav"
            with open(stem_path, "wb") as f_out:
                f_out.write(byte_stream)
            stems[key_name] = str(stem_path)
        
        print(f"\n[PROCESS] Demucs separation completed! Got {len(stems)} stems")
        print(f"   Stems: {list(stems.keys())}")
        
        # Upload stems to B2 for online playback
        print(f"\n[PROCESS] Uploading {len(stems)} stems to B2...")
        task.progress = 85
        tasks_storage[task.id] = task
        
        stem_urls = await upload_stems_to_b2(stems, task.id)
        
        print(f"[PROCESS] B2 upload completed! {len(stem_urls)} stems uploaded")
        
        task.progress = 95
        tasks_storage[task.id] = task
        
        # Analizar metadata del audio original
        print(f"[PROCESS] Analizando metadata del audio...")
        try:
            bpm, duration = detect_bpm_and_duration(task.file_path)
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
            
            # Analizar acordes
            print(f"[PROCESS] Analizando acordes...")
            chords_list = analyzer.analyze_chords(task.file_path)
            
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
                # Definir escalas diatónicas (7 acordes por tonalidad)
                # Formato: tonalidad -> [I, ii, iii, IV, V, vi, vii°]
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
                # Fallback: usar análisis espectral
                key_result = analyzer.analyze_key(task.file_path)
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
        
        tasks_storage[task.id] = task
        
        print(f"\n{'='*60}")
        print(f"[PROCESS] Audio processing COMPLETED for task: {task.id}")
        print(f"   - Status: {task.status}")
        print(f"   - Progress: {task.progress}%")
        print(f"   - Stems: {len(stem_urls)}")
        print(f"   - BPM: {bpm}, Key: {key}, Duration: {duration}s")
        print(f"{'='*60}\n")
        
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        tasks_storage[task.id] = task
        print(f"\n[PROCESS] Processing ERROR for task {task.id}: {e}")
        import traceback
        traceback.print_exc()

async def upload_stems_to_b2(stems: Dict[str, str], task_id: str) -> Dict[str, str]:
    """Upload separated stems to B2 and return URLs"""
    try:
        from b2_uploader import b2_uploader
        
        b2_stems = await b2_uploader.upload_all_stems_to_b2(stems, "system", task_id)
        return b2_stems
        
    except Exception as e:
        print(f"ERROR uploading stems to B2: {e}")
        # Si falla B2, convertir rutas locales a URLs del backend
        backend_url = os.getenv("BACKEND_URL", os.getenv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:8000"))
        fallback_urls = {}
        for stem_name, stem_path in stems.items():
            # Convertir ruta absoluta a relativa desde backend
            try:
                rel_path = Path(stem_path).relative_to(Path.cwd())
                stem_url = f"{backend_url}/audio/{rel_path}".replace("\\", "/")
                fallback_urls[stem_name] = stem_url
                print(f"Fallback URL for {stem_name}: {stem_url}")
            except:
                fallback_urls[stem_name] = f"{backend_url}/audio/{stem_path}".replace("\\", "/")
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
        "keyInfo": keyInfo
    }
    
    return response

@app.get("/audio/{path:path}")
async def serve_audio(path: str):
    """Serve audio files from local filesystem or B2"""
    try:
        # Try multiple local paths
        possible_paths = [
            f"uploads/{path}",  # Archivos originales y stems
            f"../uploads/{path}",
            path  # Ruta absoluta o relativa directa
        ]
        
        local_path = None
        for p in possible_paths:
            if os.path.exists(p):
                local_path = p
                break
        
        # Try local file first
        if local_path:
            # Determine media type based on file extension
            if path.endswith('.mp3'):
                media_type = "audio/mpeg"
            elif path.endswith('.wav'):
                media_type = "audio/wav"
            else:
                media_type = "audio/wav"  # Default
            
            print(f"[SERVE_AUDIO] Serving from: {local_path}")
            
            # Return file response
            return FileResponse(
                local_path,
                media_type=media_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET",
                    "Access-Control-Allow-Headers": "Range",
                    "Cache-Control": "public, max-age=3600"
                }
            )
        
        # If not found locally, try to stream from B2
        print(f"Audio file not found locally: {local_path}, trying B2 proxy...")
        try:
            # Construct B2 Native URL
            b2_bucket = os.getenv("B2_BUCKET_NAME", "Multitrack")
            # f005 is the Native B2 CDN which allows direct reads
            b2_url = f"https://f005.backblazeb2.com/file/{b2_bucket}/audio/{path}"
            print(f"Streaming from B2 URL: {b2_url}")
            
            # Stream the file from B2 through backend
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(b2_url) as response:
                    if response.status == 200:
                        content = await response.read()
                        
                        # Determine media type
                        if path.endswith('.mp3'):
                            media_type = "audio/mpeg"
                        elif path.endswith('.wav'):
                            media_type = "audio/wav"
                        else:
                            media_type = "audio/wav"
                        
                        from fastapi.responses import Response
                        return Response(
                            content=content,
                            media_type=media_type,
                            headers={
                                "Access-Control-Allow-Origin": "*",
                                "Access-Control-Allow-Methods": "GET",
                                "Access-Control-Allow-Headers": "Range",
                                "Cache-Control": "public, max-age=3600",
                                "Accept-Ranges": "bytes"
                            }
                        )
                    else:
                        print(f"B2 returned status: {response.status}")
                        raise HTTPException(status_code=404, detail="Audio file not found in B2")
        except Exception as b2_error:
            print(f"Error streaming from B2: {b2_error}")
        
        # If still not found, raise 404
        print(f"Audio file not found anywhere: {path}")
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error serving audio {path}: {e}")
        raise HTTPException(status_code=404, detail="Audio file not found")

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
    """Get task status from memory storage"""
    return tasks_storage.get(task_id)

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
        
        # Save uploaded file
        upload_dir = Path("uploads") / task_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / "audio.wav"
        
        if file and file.filename:
            # Upload file provided
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            print(f"Saved uploaded file for chord analysis: {file_path}")
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
    chords_data = None
    if hasattr(task, 'chords') and task.chords:
        chords_data = task.chords  # Already stored as dictionaries
    
    # Key is already stored as dictionary, so we can return it directly
    key_data = None
    if hasattr(task, 'key') and task.key:
        key_data = task.key  # Already stored as dictionary
    
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
            # Cargar audio con librosa
            y, sr = librosa.load(str(temp_file))
            
            # Detectar tempo y beats
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='time')
            
            # Calcular offset del primer beat
            first_beat_time = 0.0
            if len(beat_frames) > 0:
                first_beat_time = beat_frames[0]
            
            # Detectar onset del primer ataque fuerte
            onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
            first_onset = onsets[0] if len(onsets) > 0 else 0.0
            
            # Usar el menor entre primer beat y primer onset
            offset = min(first_beat_time, first_onset) if first_onset > 0 else first_beat_time
            
            # Duración del audio
            duration = len(y) / sr
            
            # Detectar compás (time signature)
            # Análisis básico de patrones de acentuación
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
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
                "bpm": float(tempo),
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

def detect_bpm_and_duration(audio_path: str):
    """Detecta BPM promedio y duración del audio con algoritmo mejorado."""
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    
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
    
    duration = librosa.get_duration(y=y, sr=sr)
    return int(tempo), round(float(duration), 2)

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

async def extract_with_ytdlp(youtube_url: str, video_id: str):
    """Extraer audio usando yt-dlp"""
    try:
        import subprocess
        import base64
        import re
        
        print(f"[yt-dlp] Descargando audio de: {youtube_url}")
        
        # Crear directorio temporal
        temp_dir = Path("temp_youtube")
        temp_dir.mkdir(exist_ok=True)
        
        # Primero obtener el título real del video
        print(f"[yt-dlp] Obteniendo título del video...")
        title_cmd = [
            "yt-dlp",
            "--get-title",
            youtube_url
        ]
        
        title_result = subprocess.run(title_cmd, capture_output=True, text=True, timeout=30)
        
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
        cmd = [
            "yt-dlp",
            "-x",  # Extract audio
            "--audio-format", "mp3",
            "--audio-quality", "0",  # Best quality
            "-o", str(output_file),
            youtube_url
        ]
        
        print(f"[yt-dlp] Ejecutando: {' '.join(cmd)}")
        
        # Ejecutar yt-dlp
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
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
        raise HTTPException(status_code=500, detail="yt-dlp no está instalado. Instálalo con: pip install yt-dlp")
    except Exception as e:
        print(f"[yt-dlp] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/youtube-extract")
async def extract_youtube_audio(request: Request):
    """
    Extrae audio de un video de YouTube usando RapidAPI o yt-dlp
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
        
        # Obtener API key de variable de entorno
        rapidapi_key = os.getenv('RAPIDAPI_KEY')
        if not rapidapi_key:
            # Fallback: usar yt-dlp directamente
            print("[YouTube API] No RAPIDAPI_KEY found, usando yt-dlp")
            return await extract_with_ytdlp(youtube_url, video_id)
        
        # Llamar a RapidAPI
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
                print(f"[YouTube API] Error: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Error al obtener audio: {response.status_code}"
                )
            
            result = response.json()
            print(f"[YouTube API] Respuesta: {result}")
            
            if result.get('status') != 'ok':
                raise HTTPException(status_code=400, detail="No se pudo procesar el video")
            
            # Descargar el MP3
            mp3_url = result.get('link')
            video_title = result.get('title', 'video')
            
            if not mp3_url:
                raise HTTPException(status_code=500, detail="No se obtuvo el link de descarga")
            
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
                raise HTTPException(status_code=500, detail="No se pudo descargar el audio después de varios intentos")
            
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
