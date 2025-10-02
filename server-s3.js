/**
 * Servidor S3-Compatible para Backblaze B2
 * Usa AWS SDK para subir archivos a B2
 */

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
// Eliminadas las dependencias de IA

// Eliminada la función streamToBuffer

const app = express();
const upload = multer();
app.use(cors());
app.use(express.json());

// Configuración de B2
const B2_CONFIG = {
  applicationKeyId: '005c2b526be0baa0000000016',
  applicationKey: 'K005U9iUQRtywTCO3MvZuiBVQQe/GHY',
  bucketName: 'moises2'
};

// Configura el cliente S3 para Backblaze con límites de conexión
const s3 = new S3Client({
  region: "us-east-005",
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  credentials: {
    accessKeyId: B2_CONFIG.applicationKeyId,
    secretAccessKey: B2_CONFIG.applicationKey,
  },
  requestHandler: {
    httpsAgent: {
      maxSockets: 10, // Limitar sockets concurrentes
      keepAlive: true,
      keepAliveMsecs: 30000
    }
  }
});

// Sistema de caché simple en memoria
const audioCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Función para limpiar caché expirado
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of audioCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      audioCache.delete(key);
    }
  }
}, 60000); // Limpiar cada minuto

// Endpoint para subir archivos
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    // Generar nombre de archivo
    const fileName = `audio/${userId}/${Date.now()}_${req.file.originalname}`;

    console.log('Uploading to B2 S3:', fileName);
    console.log('File size:', req.file.size);
    console.log('Buffer length:', req.file.buffer.length);
    console.log('Content type:', req.file.mimetype);

    // PRIMERO: Subir archivo a B2
    const command = new PutObjectCommand({
      Bucket: B2_CONFIG.bucketName,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ContentLength: req.file.buffer.length,
      ACL: 'public-read'
    });

    const result = await s3.send(command);
    
    // URL de descarga
    const downloadUrl = `https://s3.us-east-005.backblazeb2.com/${B2_CONFIG.bucketName}/${fileName}`;
    
    console.log('✅ File uploaded successfully to B2:', downloadUrl);
    
    // SEGUNDO: Solo subir archivo, sin extraer datos
    console.log('✅ File uploaded successfully, no data extraction needed');
    
    const responseData = { 
      success: true, 
      downloadUrl: downloadUrl,
      fileName: fileName,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      etag: result.ETag
    };
    
    console.log('📤 Sending response to frontend:', JSON.stringify(responseData, null, 2));
    
    res.json(responseData);

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ 
      error: "Upload failed", 
      details: err.message 
    });
  }
});

// Endpoint para servir archivos desde B2 usando regex con caché
app.get(/^\/api\/audio\/(.+)$/, async (req, res) => {
  try {
    // Capturar la ruta del grupo de captura
    const fullPath = req.params[0];
    const fileName = `audio/${fullPath}`;
    
    // Verificar caché primero
    const cached = audioCache.get(fileName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`🎵 Serving audio file from cache: ${fileName}`);
      res.set({
        'Content-Type': cached.contentType,
        'Content-Length': cached.contentLength,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Range',
        'X-Cache': 'HIT'
      });
      return res.send(cached.data);
    }
    
    console.log(`🎵 Serving audio file from B2: ${fileName}`);
    
    const command = new GetObjectCommand({
      Bucket: B2_CONFIG.bucketName,
      Key: fileName
    });
    
    const response = await s3.send(command);
    
    // Leer el archivo completo para caché
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const audioData = Buffer.concat(chunks);
    
    // Guardar en caché
    audioCache.set(fileName, {
      data: audioData,
      contentType: response.ContentType || 'audio/wav',
      contentLength: response.ContentLength,
      timestamp: Date.now()
    });
    
    // Configurar headers para streaming de audio
    res.set({
      'Content-Type': response.ContentType || 'audio/wav',
      'Content-Length': response.ContentLength,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Range',
      'X-Cache': 'MISS'
    });
    
    // Enviar datos
    res.send(audioData);
    
  } catch (err) {
    console.error('Error serving audio file:', err);
    res.status(404).json({ error: "Audio file not found" });
  }
});

// Endpoint de salud
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "B2 S3 Proxy Server running",
    bucket: B2_CONFIG.bucketName,
    endpoint: "https://s3.us-east-005.backblazeb2.com"
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 B2 S3 Proxy Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  console.log(`🪣 Bucket: ${B2_CONFIG.bucketName}`);
  console.log(`🌐 Endpoint: https://s3.us-east-005.backblazeb2.com`);
});

module.exports = app;
