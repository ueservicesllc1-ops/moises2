#!/usr/bin/env node
/**
 * Espera a que FastAPI responda en /api/health antes de arrancar Next.
 * Evita carreras en start:full (concurrently): el primer POST /api/separate ya encuentra Python.
 *
 * Variables:
 *   BACKEND_HEALTH_URL — por defecto http://127.0.0.1:8000/api/health
 *   WAIT_BACKEND_MS     — timeout total (default 120000)
 *   WAIT_BACKEND_INTERVAL_MS — intervalo entre intentos (default 1000)
 */

const healthUrl =
  process.env.BACKEND_HEALTH_URL?.trim() || 'http://127.0.0.1:8000/api/health'
const totalMs = Math.max(5000, parseInt(process.env.WAIT_BACKEND_MS || '120000', 10))
const intervalMs = Math.max(200, parseInt(process.env.WAIT_BACKEND_INTERVAL_MS || '1000', 10))

const start = Date.now()

async function once() {
  const res = await fetch(healthUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
  })
  return res.ok
}

;(async () => {
  let attempt = 0
  while (Date.now() - start < totalMs) {
    attempt += 1
    try {
      if (await once()) {
        console.log(`[wait-for-backend] OK en ${attempt} intento(s) → ${healthUrl}`)
        process.exit(0)
      }
      console.warn(`[wait-for-backend] HTTP no OK, reintento ${attempt}…`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[wait-for-backend] intento ${attempt}: ${msg}`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  console.error(
    `[wait-for-backend] Timeout ${totalMs}ms — Python no respondió en ${healthUrl}. Revisa logs del backend.`
  )
  process.exit(1)
})()
