"""
B2 Storage - Simplified version for demo
"""

import aiohttp
import asyncio
from typing import AsyncGenerator

class B2Storage:
    def __init__(self):
        self.initialized = False
    
    async def initialize(self):
        """Initialize B2 storage"""
        self.initialized = True
        print("B2 Storage initialized (demo mode)")
    
    async def download_file(self, file_path: str) -> AsyncGenerator[bytes, None]:
        """Download file from B2 and stream it"""
        try:
            # Construir URL completa de B2
            b2_url = f"https://s3.us-east-005.backblazeb2.com/moises2/{file_path}"
            print(f"📥 Downloading from B2: {b2_url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(b2_url) as response:
                    if response.status == 200:
                        async for chunk in response.content.iter_chunked(8192):
                            yield chunk
                    else:
                        print(f"❌ Error downloading {file_path}: {response.status}")
                        raise Exception(f"Failed to download file: {response.status}")
        except Exception as e:
            print(f"❌ Error in download_file: {e}")
            raise

# Global instance
b2_storage = B2Storage()
