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

const seen = new Set<string>()

function pushBase(list: string[], raw?: string | null) {
  const s = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  if (!s || isPlaceholderBackendUrl(s) || seen.has(s)) return
  seen.add(s)
  list.push(s)
}

/**
 * Bases a probar en orden (proxy servidor → Python).
 * - Servicios separados en Railway: pon BACKEND_URL o BACKEND_PUBLIC_URL con la URL https del API.
 * - Monolith (Docker start:full): suele funcionar http://127.0.0.1:8000 al final de la lista.
 */
export function getServerBackendBaseUrls(): string[] {
  seen.clear()
  const list: string[] = []
  pushBase(list, process.env.INTERNAL_BACKEND_URL)
  pushBase(list, process.env.BACKEND_URL)
  pushBase(list, process.env.BACKEND_PUBLIC_URL)
  pushBase(list, process.env.NEXT_PUBLIC_API_URL)
  pushBase(list, 'http://127.0.0.1:8000')
  return list.length ? list : ['http://127.0.0.1:8000']
}

/** Primera base (compat con rutas /api que solo hacen un fetch). */
export function getServerBackendUrl(): string {
  return getServerBackendBaseUrls()[0]
}
