"""
B2 Uploader - Subir pistas separadas a Backblaze B2
"""

import os
import aioboto3
import aiofiles
from pathlib import Path
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

class B2Uploader:
    def __init__(self):
        # Configuración S3 de Backblaze B2
        self.endpoint_url = os.getenv("B2_ENDPOINT_URL", "https://s3.us-east-005.backblazeb2.com")
        self.b2_bucket = os.getenv("B2_BUCKET_NAME", "Multitrack")
        self.key_id = os.getenv("B2_APPLICATION_KEY_ID")
        self.app_key = os.getenv("B2_APPLICATION_KEY")
        
    async def upload_stem_to_b2(self, file_path: str, user_id: str, song_id: str, stem_name: str) -> str:
        """Subir una pista separada a B2 directamente"""
        try:
            print(f"Uploading stem to B2 natively: {stem_name}")
            
            # Key = ruta relativa en el bucket
            b2_key = f"audio/stems/{song_id}/{stem_name}.wav"
            
            if not self.key_id or not self.app_key:
                print("WARN: B2 Keys missing, returning local path fallback")
                # Fallback to local
                return f"/audio/uploads/{song_id}/stems/{stem_name}.wav"
            
            session = aioboto3.Session(
                aws_access_key_id=self.key_id,
                aws_secret_access_key=self.app_key,
                region_name="us-east-005"
            )
            
            async with session.client("s3", endpoint_url=self.endpoint_url) as s3_client:
                # Subir archivo streaming
                async with aiofiles.open(file_path, 'rb') as f:
                    file_data = await f.read()
                    
                await s3_client.put_object(
                    Bucket=self.b2_bucket,
                    Key=b2_key,
                    Body=file_data,
                    ContentType="audio/wav"
                )
                
            # Construir y validar URL final 
            # FIX: El endpoint S3 a menudo falla en el navegador para archivos públicos sin auth
            # Usamos el Native B2 URL público: f005.backblazeb2.com/file/<bucket>/<key>
            download_url = f"https://f005.backblazeb2.com/file/{self.b2_bucket}/{b2_key}"
            print(f"Stem uploaded seamlessly to B2: {stem_name} -> {download_url}")
            return download_url
            
        except Exception as e:
            print(f"Error uploading stem {stem_name}: {e}")
            return ""

    async def upload_all_stems_to_b2(self, stems: Dict[str, str], user_id: str, song_id: str) -> Dict[str, str]:
        """Subir todas las pistas separadas a B2"""
        print(f"Uploading all stems natively to B2 for song: {song_id}")
        
        b2_stems = {}
        
        # Subir cada pista secuencial o en paralelo
        upload_tasks = []
        for stem_name, stem_path in stems.items():
            if os.path.exists(stem_path):
                task = self.upload_stem_to_b2(stem_path, user_id, song_id, stem_name)
                upload_tasks.append((stem_name, task))
        
        # Iterar sobre las tareas asincrónicas
        import asyncio
        results = await asyncio.gather(*(t for _, t in upload_tasks), return_exceptions=True)
        
        for (stem_name, _), result in zip(upload_tasks, results):
            if isinstance(result, Exception):
                print(f"Error uploading {stem_name}: {result}")
            elif result:
                b2_stems[stem_name] = result
            else:
                print(f"Failed to upload {stem_name}")

        print(f"Upload complete. {len(b2_stems)} stems uploaded directly to B2")
        return b2_stems

# Instancia global
b2_uploader = B2Uploader()
