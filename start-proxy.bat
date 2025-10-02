@echo off
echo 🚀 Iniciando B2 Proxy Server...
echo.
echo 📋 Verificando dependencias...

REM Verificar si las dependencias están instaladas
if not exist "node_modules\express" (
    echo ❌ Dependencias no encontradas. Instalando...
    call npm install express multer cors @aws-sdk/client-s3
    if errorlevel 1 (
        echo ❌ Error instalando dependencias
        pause
        exit /b 1
    )
)

echo ✅ Dependencias verificadas
echo.
echo 🌐 Iniciando proxy server en http://localhost:3001
echo 📁 Upload endpoint: http://localhost:3001/api/upload
echo ❤️  Health check: http://localhost:3001/api/health
echo.
echo 💡 Mantén esta ventana abierta mientras usas la aplicación
echo 💡 Presiona Ctrl+C para detener el servidor
echo.

node server-s3.js

pause
