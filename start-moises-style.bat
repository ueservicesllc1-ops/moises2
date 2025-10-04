@echo off
echo 🚀 Iniciando Moises Style - Arquitectura Completa
echo.

echo 📋 Verificando servidores...
echo.

REM Verificar si Next.js está corriendo
echo 🌐 Verificando Next.js (puerto 3000)...
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Next.js ya está corriendo
) else (
    echo ❌ Next.js no está corriendo - Iniciando...
    start "Next.js Frontend" cmd /k "npm run dev"
    timeout /t 3 >nul
)

REM Verificar si el proxy está corriendo
echo 🔗 Verificando Proxy B2 (puerto 3001)...
curl -s http://localhost:3001/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Proxy B2 ya está corriendo
) else (
    echo ❌ Proxy B2 no está corriendo - Iniciando...
    start "B2 Proxy" cmd /k ".\start-proxy.bat"
    timeout /t 3 >nul
)

REM Verificar si el backend original está corriendo
echo ⚡ Verificando Backend Original (puerto 8000)...
curl -s http://localhost:8000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend Original ya está corriendo
) else (
    echo ❌ Backend Original no está corriendo - Iniciando...
    start "Backend Original" cmd /k "cd backend && python main.py"
    timeout /t 3 >nul
)

REM Iniciar el nuevo servidor Moises Style
echo 🎵 Iniciando Moises Style API (puerto 8001)...
curl -s http://localhost:8001/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Moises Style API ya está corriendo
) else (
    echo ❌ Moises Style API no está corriendo - Iniciando...
    start "Moises Style API" cmd /k "cd backend && python moises_main.py"
    timeout /t 3 >nul
)

echo.
echo 🎉 Todos los servidores están iniciando...
echo.
echo 📊 Estado de los Servidores:
echo.
echo 🌐 Frontend Next.js:     http://localhost:3000
echo 🔗 Proxy B2:            http://localhost:3001
echo ⚡ Backend Original:     http://localhost:8000
echo 🎵 Moises Style API:    http://localhost:8001
echo.
echo 🎵 Página Moises Style:  http://localhost:3000/moises-style
echo.
echo 💡 Mantén estas ventanas abiertas mientras usas la aplicación
echo 💡 Presiona Ctrl+C en cualquier ventana para detener el servidor
echo.
echo 🔧 Comandos útiles:
echo    - Verificar salud: curl http://localhost:8001/api/health
echo    - Estadísticas: curl http://localhost:8001/api/stats
echo    - Limpieza manual: curl -X POST http://localhost:8001/api/cleanup/manual
echo.

pause
