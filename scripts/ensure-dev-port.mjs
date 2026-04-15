/**
 * Evita el caso típico en Windows: el puerto 3000 está ocupado por otro programa,
 * Next sube a 3001, pero sigues abriendo localhost:3000 → HTML roto y 404 en /_next/static.
 */
import net from 'net'

const port = Number(process.env.DEV_PORT || process.argv[2] || 3000)

function portFree(p) {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', (e) => {
      if (e && e.code === 'EADDRINUSE') resolve(false)
      else reject(e)
    })
    s.listen(p, '127.0.0.1', () => {
      s.close(() => resolve(true))
    })
  })
}

const ok = await portFree(port)
if (!ok) {
  console.error('')
  console.error(`[next] El puerto ${port} ya está en uso.`)
  console.error(
    '[next] Si abres http://localhost:' +
      port +
      ' verás otra app o una respuesta vacía: los archivos /_next/static/... darán 404.',
  )
  console.error('[next] Opciones: cierra el proceso que usa ese puerto, o ejecuta: npm run dev:any')
  console.error('[next] Windows (PowerShell): Get-NetTCPConnection -LocalPort ' + port)
  console.error('')
  process.exit(1)
}
