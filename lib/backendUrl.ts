/**
 * URLs del FastAPI para el servidor Next (Route Handlers, /api/*).
 *
 * En Railway con un solo servicio (Docker start:full), Python escucha en 127.0.0.1:8000.
 * Si en env quedó un placeholder (p. ej. TU-BACKEND-FASTAPI), se ignora y se usa localhost.
 *
 * Si Next y Python están en servicios separados, define BACKEND_URL o INTERNAL_BACKEND_URL con la URL real del API.
 */

const PLACEHOLDER_RE = /tu-backend|your-backend|placeholder|example\.com/i

export function isPlaceholderBackendUrl(url: string | undefined | null): boolean {
  if (url == null || !String(url).trim()) return true
  return PLACEHOLDER_RE.test(String(url).trim())
}

/** Solo servidor Node: nunca exponer esto al bundle cliente como URL absoluta por defecto. */
export function getServerBackendUrl(): string {
  const candidates = [
    process.env.INTERNAL_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ]
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : ''
    if (s && !isPlaceholderBackendUrl(s)) {
      return s.replace(/\/$/, '')
    }
  }
  return 'http://127.0.0.1:8000'
}
