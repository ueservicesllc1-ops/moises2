/**
 * URL única del FastAPI para el proceso Node (Route Handlers, proxy /api → Python).
 *
 * No hay “probar URL A, luego B”: una sola resolución determinista.
 *
 * Monolito (Docker / Railway una imagen: Next + Python en el mismo contenedor):
 *   - Por defecto: http://127.0.0.1:8000
 *   - Opcional: BACKEND_INTERNAL_URL si quieres fijarla explícitamente.
 *   - Ignora BACKEND_URL / NEXT_PUBLIC_API_URL salvo modo remoto (abajo). Si en Railway
 *     dejaste placeholders tipo TU-BACKEND-FASTAPI, no se usan para el servidor.
 *
 * Stack separado (Next en un servicio, FastAPI en otro):
 *   - BACKEND_FETCH_MODE=remote
 *   - Y una sola URL alcanzable desde Node: INTERNAL_BACKEND_URL o BACKEND_URL (sin placeholder).
 *
 * Cliente (navegador): ver getBackendUrl() en lib/config.ts (NEXT_PUBLIC_* y mismo origen).
 */

const PLACEHOLDER_RE =
  /tu-backend|your-backend|placeholder|example\.com|changeme|replace-me|xxx\.xxx/i

const LOOPBACK = 'http://127.0.0.1:8000'

export function isPlaceholderBackendUrl(url: string | undefined | null): boolean {
  if (url == null || !String(url).trim()) return true
  return PLACEHOLDER_RE.test(String(url).trim())
}

function normalizeBase(raw: string | undefined | null): string | null {
  const s = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  if (!s || isPlaceholderBackendUrl(s)) return null
  return s
}

function isRemoteFetchMode(): boolean {
  const v = process.env.BACKEND_FETCH_MODE
  return v === 'remote' || v === '1' || v === 'true'
}

/**
 * Una sola base URL para todos los fetch server-side hacia FastAPI.
 */
export function getServerBackendUrl(): string {
  const internal = normalizeBase(process.env.BACKEND_INTERNAL_URL)
  if (internal) return internal

  if (isRemoteFetchMode()) {
    const remote =
      normalizeBase(process.env.INTERNAL_BACKEND_URL) ||
      normalizeBase(process.env.BACKEND_URL) ||
      normalizeBase(process.env.BACKEND_PUBLIC_URL)
    if (remote) return remote
    console.error(
      '[backend] BACKEND_FETCH_MODE=remote pero no hay INTERNAL_BACKEND_URL / BACKEND_URL válidas; usando loopback (revisa variables en Railway).'
    )
  }

  return LOOPBACK
}

export function cloneFormData(fd: FormData): FormData {
  const out = new FormData()
  fd.forEach((value, key) => {
    out.append(key, value)
  })
  return out
}

/**
 * POST multipart al FastAPI en la única URL resuelta.
 */
export async function postFormDataToBackend(
  path: string,
  formData: FormData,
  options?: { timeoutMs?: number }
): Promise<Response> {
  const base = getServerBackendUrl()
  const timeoutMs = options?.timeoutMs ?? 300_000
  const p = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${p}`
  return fetch(url, {
    method: 'POST',
    body: cloneFormData(formData),
    signal: AbortSignal.timeout(timeoutMs),
  })
}
