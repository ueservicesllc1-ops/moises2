from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import uuid
import asyncio
import subprocess
from pathlib import Path
from typing import List, Optional, Dict
import json

from audio_processor_real import audio_processor
from chord_analyzer import ChordAnalyzer
from models import ProcessingTask, TaskStatus
from database import get_db, init_db
from b2_storage import b2_storage
from moises_style_processor import moises_processor

# In-memory task storage
tasks_storage = {}
# Store active processes for cancellation
active_processes = {}

app = FastAPI(
    title="Moises Clone API",
    description="AI-powered audio separation service",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for serving uploaded files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Initialize database and B2
@app.on_event("startup")
async def startup_event():
    init_db()
    await b2_storage.initialize()

# Audio processor instance (already imported)

@app.get("/")
async def root():
    return {"message": "Moises Clone API", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {"status": "OK", "message": "Backend is running"}

@app.get("/api/audio/{path:path}")
async def serve_audio_file(path: str):
    """Proxy para servir archivos de audio desde B2 con CORS habilitado"""
    try:
        print(f"Serving audio file: {path}")
        
        # Descargar archivo desde B2
        file_data = await b2_storage.download_file_bytes(path)
        
        if not file_data:
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Determinar content type basado en la extensión
        extension = path.split('.')[-1].lower()
        content_type_map = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'm4a': 'audio/mp4',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac'
        }
        content_type = content_type_map.get(extension, 'audio/mpeg')
        
        # Retornar archivo con headers CORS
        from fastapi.responses import Response
        return Response(
            content=file_data,
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except Exception as e:
        print(f"Error serving audio file {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/delete-files")
async def delete_files_from_b2(request: dict):
    """Eliminar archivos de B2 cuando se borra una canción"""
    try:
        song_id = request.get("songId")
        file_url = request.get("fileUrl")
        stems = request.get("stems", {})
        
        print(f"Eliminando archivos para canción {song_id}")
        
        deleted_files = []
        
        # Eliminar archivo original si existe
        if file_url:
            original_path = _extract_b2_path_from_url(file_url)
            if original_path:
                success = await b2_storage.delete_file(original_path)
                if success:
                    deleted_files.append(f"Original: {original_path}")
                    print(f"Archivo original eliminado: {original_path}")
        
        # Eliminar stems si existen
        if stems:
            for stem_name, stem_url in stems.items():
                if stem_url:
                    stem_path = _extract_b2_path_from_url(stem_url)
                    if stem_path:
                        success = await b2_storage.delete_file(stem_path)
                        if success:
                            deleted_files.append(f"{stem_name}: {stem_path}")
                            print(f"Stem {stem_name} eliminado: {stem_path}")
        
        return {
            "success": True,
            "deleted_files": deleted_files,
            "message": f"Eliminados {len(deleted_files)} archivos de B2"
        }
        
    except Exception as e:
        print(f"Error eliminando archivos de B2: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _extract_b2_path_from_url(url: str) -> str:
    """Extraer la ruta del archivo desde la URL de B2"""
    try:
        if 'moises/' in url:
            return url.split('moises/')[1]
        return None
    except:
        return None

@app.post("/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = "2stems",
    separation_options: Optional[str] = None,
    hi_fi: bool = False
):
    """Upload audio file and start separation process"""
    
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be audio")
    
    # Generate unique task ID
    task_id = str(uuid.uuid4())
    
    # Create upload directory
    upload_dir = Path(f"uploads/{task_id}")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded file
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp3'
    file_path = upload_dir / f"original.{file_ext}"
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    print(f"File saved to: {file_path}")
    print(f"File exists: {file_path.exists()}")
    
    # Parse separation options if provided
    custom_tracks = None
    if separation_options:
        try:
            import json
            custom_tracks = json.loads(separation_options)
        except:
            pass
    
    # Create processing task
    task = ProcessingTask(
        id=task_id,
        original_filename=file.filename,
        file_path=str(file_path),
        separation_type=separation_type,
        status=TaskStatus.PROCESSING
    )
    
    # Start background processing with options
    background_tasks.add_task(process_audio, task, custom_tracks, hi_fi)
    
    return {
        "task_id": task_id,
        "status": "uploaded",
        "message": "Audio upload successful",
        "file_url": f"http://localhost:8000/uploads/{task_id}/original.{file_ext}",
        "separation_type": separation_type,
        "hi_fi": hi_fi
    }

@app.post("/api/upload")
async def upload_to_b2(
    file: UploadFile = File(...),
    user_id: str = None,
    song_id: str = None,
    folder: str = "newsongs"
):
    """Upload file to B2 storage via proxy"""
    
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be audio")
    
    try:
        # Upload to B2 using the existing b2_storage
        file_content = await file.read()
        
        # Generate unique filename
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp3'
        b2_filename = f"{song_id or 'unknown'}/{file.filename}"
        
        # Upload to B2
        upload_result = await b2_storage.upload_file(
            file_content=file_content,
            filename=b2_filename,
            content_type=file.content_type
        )
        
        return {
            "success": True,
            "downloadUrl": upload_result.get("download_url"),
            "fileId": upload_result.get("file_id"),
            "filename": b2_filename
        }
        
    except Exception as e:
        print(f"Error uploading to B2: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/separate")
async def separate_audio_direct(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    separation_type: str = Form("vocals-instrumental"),
    separation_options: Optional[str] = Form(None),
    hi_fi: bool = Form(False),
    song_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
):
    """Separate audio using Moises Style architecture - Solo B2 Storage"""
    
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be audio")
    
    # Siempre usar arquitectura Moises Style
    try:
        print(f"Iniciando separacion Moises Style para: {file.filename}")
        print(f"Usuario: {user_id or 'anonymous'}")
        print(f"Tipo separacion: {separation_type}")
        print(f"Hi-Fi: {hi_fi}")
        
        # Leer contenido del archivo
        file_content = await file.read()
        print(f"Archivo leido: {len(file_content)} bytes")
        
        # Usar el procesador Moises Style
        try:
            result = await moises_processor.separate_audio_moises_style(
                file_content=file_content,
                filename=file.filename,
                user_id=user_id or "anonymous",
                separation_type=separation_type,
                hi_fi=hi_fi
            )
            print(f"Procesador Moises Style completado: {result}")
        except Exception as proc_error:
            print(f"Error en procesador Moises Style: {proc_error}")
            import traceback
            print(f"Stack trace procesador: {traceback.format_exc()}")
            raise proc_error
        
        print(f"Resultado procesador: {result}")
        
        if result["success"]:
            response_data = {
                "success": True,
                "message": "Audio separado exitosamente estilo Moises",
                "data": {
                    "task_id": result["task_id"],
                    "song_id": result["song_id"],
                    "original_url": result["original_url"],
                    "stems": result["stems"],
                    "separation_type": result["separation_type"],
                    "hi_fi": result["hi_fi"],
                    "processed_at": result["processed_at"],
                    "user_id": result["user_id"]
                }
            }
            print(f"Respuesta exitosa: {response_data}")
            return response_data
        else:
            error_msg = result.get("error", "Error desconocido en procesamiento")
            print(f"Error en procesamiento: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
            
    except Exception as e:
        print(f"Error completo en Moises Style: {e}")
        print(f"Tipo de error: {type(e)}")
        import traceback
        print(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    """Get processing status"""
    task = await get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Return B2 URLs directly (already uploaded to B2)
    stems_urls = None
    if task.status == TaskStatus.COMPLETED and task.stems:
        stems_urls = task.stems  # These are already B2 URLs
    
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "stems": stems_urls,
        "bpm": 126,  # Default BPM
        "key": "E",  # Default key
        "timeSignature": "4/4",  # Default time signature
        "duration": "5:00"  # Default duration
    }

@app.get("/audio/{path:path}")
async def serve_audio(path: str):
    """Serve audio files from B2 to avoid CORS issues"""
    try:
        # Download file from B2
        file_content = await b2_storage.download_file(path)
        
        # Return as streaming response
        return StreamingResponse(
            file_content,
            media_type="audio/wav",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
                "Access-Control-Allow-Headers": "Range",
                "Cache-Control": "public, max-age=3600"
            }
        )
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

async def process_audio(task: ProcessingTask, custom_tracks: Optional[Dict] = None, hi_fi: bool = False):
    """Background task to process audio"""
    try:
        # Update task status
        task.status = TaskStatus.PROCESSING
        task.progress = 10
        
        # Process based on separation type
        if task.separation_type == "custom" and custom_tracks:
            # Custom track separation with REAL AI
            stems = await audio_processor.separate_custom_tracks(
                task.file_path,
                custom_tracks,
                hi_fi
            )
        else:
            # Use REAL Demucs AI processing for best quality
            def update_progress(progress: int, message: str = ""):
                task.progress = progress
                print(f"Progress: {progress}% - {message}")
            
            # Determinar qué tracks solicitar basado en separation_type
            requested_tracks = None
            if task.separation_type == "vocals-instrumental":
                requested_tracks = ["vocals", "instrumental"]
            elif task.separation_type == "vocals-drums-bass-other":
                requested_tracks = ["vocals", "drums", "bass", "other"]
            
            stems = await audio_processor.separate_with_demucs(task.file_path, update_progress, requested_tracks)
        
        # Upload stems to B2 for online playback
        print(f"Uploading {len(stems)} stems to B2...")
        task.progress = 85
        b2_stems = await upload_stems_to_b2(stems, task.id)
        task.progress = 95
        
        # Update task with B2 URLs
        task.stems = b2_stems
        task.status = TaskStatus.COMPLETED
        task.progress = 100
        
        print(f"Audio processing completed with B2 URLs: {b2_stems}")
        
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        print(f"Processing error: {e}")

async def upload_stems_to_b2(stems: Dict[str, str], task_id: str) -> Dict[str, str]:
    """Upload separated stems to B2 and return URLs"""
    try:
        import aiohttp
        import aiofiles
        
        b2_stems = {}
        
        for stem_name, stem_path in stems.items():
            if os.path.exists(stem_path):
                print(f"Uploading {stem_name} to B2...")
                
                # Read file
                async with aiofiles.open(stem_path, 'rb') as f:
                    file_data = await f.read()
                
                # Create FormData
                form_data = aiohttp.FormData()
                form_data.add_field('file', file_data, filename=f"{stem_name}.wav", content_type='audio/wav')
                form_data.add_field('userId', 'system')
                form_data.add_field('songId', task_id)
                form_data.add_field('trackName', stem_name)
                form_data.add_field('folder', 'stems')
                
                # Upload to B2 via proxy
                async with aiohttp.ClientSession() as session:
                    async with session.post('http://localhost:3001/api/upload', data=form_data) as response:
                        if response.status == 200:
                            result = await response.json()
                            b2_url = result.get('downloadUrl', '')
                            b2_stems[stem_name] = b2_url
                            print(f"SUCCESS: {stem_name} uploaded to B2: {b2_url}")
                        else:
                            print(f"ERROR: Failed to upload {stem_name}: {response.status}")
        
        return b2_stems
        
    except Exception as e:
        print(f"ERROR uploading stems to B2: {e}")
        return stems  # Return local paths as fallback

async def get_task_status(task_id: str) -> Optional[ProcessingTask]:
    """Get task status from memory storage"""
    return tasks_storage.get(task_id)

# Chord Analysis Endpoints
@app.post("/api/analyze-chords")
async def analyze_chords(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """Analyze chords and key of an audio file"""
    try:
        # Generate unique task ID
        task_id = str(uuid.uuid4())
        
        # Save uploaded file
        upload_dir = Path("uploads") / task_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / "audio.wav"
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Create task
        task = ProcessingTask(
            id=task_id,
            status=TaskStatus.PROCESSING,
            file_path=str(file_path),
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chord-analysis/{task_id}")
async def get_chord_analysis(task_id: str):
    """Get chord analysis results"""
    task = tasks_storage.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "chords": task.chords if hasattr(task, 'chords') else None,
        "key": task.key if hasattr(task, 'key') else None,
        "error": task.error if hasattr(task, 'error') else None
    }

async def process_chord_analysis(task: ProcessingTask):
    """Background task to analyze chords"""
    try:
        # Initialize chord analyzer
        analyzer = ChordAnalyzer()
        
        # Update progress
        task.progress = 20
        task.status = TaskStatus.PROCESSING
        
        # Analyze chords
        chords = analyzer.analyze_chords(task.file_path)
        task.progress = 60
        
        # Analyze key
        key_info = analyzer.analyze_key(task.file_path)
        task.progress = 80
        
        # Save results
        task.chords = [
            {
                "chord": chord.chord,
                "confidence": chord.confidence,
                "start_time": chord.start_time,
                "end_time": chord.end_time,
                "root_note": chord.root_note,
                "chord_type": chord.chord_type
            }
            for chord in chords
        ]
        
        task.key = {
            "key": key_info.key if key_info else "Unknown",
            "mode": key_info.mode if key_info else "Unknown",
            "confidence": key_info.confidence if key_info else 0.0,
            "tonic": key_info.tonic if key_info else "Unknown"
        } if key_info else None
        
        task.progress = 100
        task.status = TaskStatus.COMPLETED
        
        print(f"Chord analysis completed for task {task.id}")
        
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        print(f"Chord analysis error: {e}")

@app.post("/cancel/{task_id}")
async def cancel_separation(task_id: str):
    """Cancel an active separation process"""
    try:
        if task_id not in tasks_storage:
            raise HTTPException(status_code=404, detail="Task not found")
        
        task = tasks_storage[task_id]
        
        # Mark task as cancelled
        task.status = TaskStatus.FAILED
        task.error = "Process cancelled by user"
        
        # Kill the process if it exists
        if task_id in active_processes:
            process = active_processes[task_id]
            if process.poll() is None:  # Process is still running
                process.terminate()
                print(f"Process {task_id} terminated")
            del active_processes[task_id]
        
        # Clean up files
        try:
            upload_dir = Path(f"uploads/{task_id}")
            if upload_dir.exists():
                import shutil
                shutil.rmtree(upload_dir)
                print(f"Cleaned up files for task {task_id}")
        except Exception as e:
            print(f"Error cleaning up files: {e}")
        
        return {"message": "Separation cancelled successfully", "task_id": task_id}
        
    except Exception as e:
        print(f"Error cancelling separation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
