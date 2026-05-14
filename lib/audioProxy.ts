/**
 * B2 en el navegador: nunca URL directa a f005/s3.
 * - Local (por defecto): mismo origen `…/api/download?url=…` (Next en dev, como en prod)
 * - Local + `NEXT_PUBLIC_REMOTE_AUDIO_PROXY`: ese origen HTTPS (p. ej. Railway si tu red no llega a B2)
 * - Producción: `${origin}/api/download?url=…`
 * FastAPI / URLs no-B2: sin cambio.
 */

import { getBackendUrl } from './config'

export const B2_AUDIO_PATH_REGEX =
  /^https?:\/\/(?:s3\.us-east-005|f005)\.backblazeb2\.com\/(?:file\/)?(?:moises2|Multitrack)\/audio\/(.+)$/i

export function stemPathFromB2PublicUrl(url: string): string | null {
  const m = String(url).trim().match(B2_AUDIO_PATH_REGEX)
  return m?.[1] ?? null
}

/** Solo corrige host legado; el resto se deja igual que en base de datos. */
export function normalizeStemPlayUrl(url: string | undefined | null): string {
  if (url == null) return ''
  const u = String(url).trim()
  if (!u) return u
  if (u.startsWith('blob:') || u.startsWith('data:')) return u
  const oldIp = '104.197.145.173'
  if (u.includes(oldIp)) {
    const base = getBackendUrl().replace(/\/$/, '')
    return u
      .replace(`http://${oldIp}:8000`, base)
      .replace(`https://${oldIp}:8000`, base)
  }
  return u
}

function isLocalDevBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

/** URL https pública B2 (f005 / S3 compat). */
function isLikelyB2PublicFileUrl(url: string): boolean {
  const u = String(url).trim()
  if (!/^https:\/\//i.test(u)) return false
  return /backblazeb2\.com/i.test(u) && /\/file\//i.test(u)
}

const LOCAL_B2_PROXY_FALLBACK = 'http://localhost:3001'

/**
 * Si está definido y es `https`, en localhost el audio B2 va por ese origen (p. ej. Railway).
 */
export function getDevRemoteAudioProxyBase(): string | null {
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_REMOTE_AUDIO_PROXY?.trim() : ''
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * Origen del proxy `/api/download` en el navegador.
 * - Local sin env: mismo origen que la app (Next en :3000), no :3001 — un solo proceso y mismo patrón que prod.
 * - Local + NEXT_PUBLIC_REMOTE_AUDIO_PROXY: Railway u otro HTTPS.
 * - Prod: mismo origen.
 */
function getB2BrowserProxyBase(): string {
  if (typeof window === 'undefined') return ''
  if (isLocalDevBrowser()) {
    const remote = getDevRemoteAudioProxyBase()
    if (remote) return remote
    return window.location.origin.replace(/\/$/, '')
  }
  return window.location.origin.replace(/\/$/, '')
}

/** Siempre `…/api/download?url=`. */
export function b2ProxiedDownloadUrl(originalB2Url: string): string {
  let base = getB2BrowserProxyBase()
  if (!base) base = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''
  if (!base) base = LOCAL_B2_PROXY_FALLBACK
  return `${base.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(originalB2Url)}`
}

/** URL usable en `fetch()` desde el navegador (p. ej. sync de click). B2 siempre vía proxy. */
export function resolveAudioFetchUrl(url: string | undefined | null): string {
  const n = normalizeStemPlayUrl(url)
  if (!n) return ''
  if (isLikelyB2PublicFileUrl(n)) return b2ProxiedDownloadUrl(n)
  return n
}

async function assertRemoteAudioProxyAlive(): Promise<void> {
  const base = getDevRemoteAudioProxyBase()
  if (!base) throw new Error('NEXT_PUBLIC_REMOTE_AUDIO_PROXY no configurado')
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error('remote health not ok')
  } catch {
    throw new Error(
      'Proxy remoto de audio no responde. Revisa NEXT_PUBLIC_REMOTE_AUDIO_PROXY y que Railway esté arriba.'
    )
  }
}

function networkFetchUrl(
  url: string,
  originalForLog: string,
  logCtx: { devHeaderDone: boolean; prodHeaderDone: boolean }
): string {
  if (typeof window === 'undefined' || !isLikelyB2PublicFileUrl(url)) {
    return url
  }
  const proxy = b2ProxiedDownloadUrl(url)
  if (isLocalDevBrowser()) {
    if (!logCtx.devHeaderDone) {
      const remote = getDevRemoteAudioProxyBase()
      console.log('[AUDIO] dev mode detected')
      if (remote) {
        console.log('[AUDIO] DEV_REMOTE_PROXY — B2 via Railway:', remote)
      } else {
        console.log('[AUDIO] B2 via mismo origen Next /api/download (puerto de esta app)')
      }
      logCtx.devHeaderDone = true
    }
  } else {
    if (!logCtx.prodHeaderDone) {
      console.log('[AUDIO] production mode — B2 via same-origin /api/download (Railway)')
      logCtx.prodHeaderDone = true
    }
  }
  console.log('[AUDIO] proxy URL:', proxy)
  console.log('[AUDIO] original B2 URL:', originalForLog)
  return proxy
}

async function blobLooksLikeWav(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false
  const buf = await blob.slice(0, 12).arrayBuffer()
  const v = new Uint8Array(buf)
  return v[0] === 0x52 && v[1] === 0x49 && v[2] === 0x46 && v[3] === 0x46
}

async function cachePutWav(cache: Cache, key: string, blob: Blob): Promise<void> {
  await cache.put(
    key,
    new Response(blob, { headers: { 'Content-Type': 'audio/wav' } })
  )
}

/**
 * Cache API + fetch. B2 vía `/api/download` (mismo origen, Railway remoto en dev, o prod).
 */
export async function getCachedAudioBlobUrl(
  preferredUrl: string,
  fallbackUrl?: string
): Promise<string> {
  const resolved = normalizeStemPlayUrl(preferredUrl) || preferredUrl
  const tryKeys = Array.from(
    new Set(
      [preferredUrl, resolved, ...(fallbackUrl && fallbackUrl !== resolved ? [fallbackUrl] : [])].filter(
        Boolean
      ) as string[]
    )
  )

  const logCtx = { devHeaderDone: false, prodHeaderDone: false }

  try {
    const cache = await caches.open('moises-audio-cache')
    for (const key of tryKeys) {
      const hit = await cache.match(key)
      if (hit) {
        const blob = await hit.blob()
        if (!(await blobLooksLikeWav(blob))) {
          console.warn('[audio] caché corrupta (no WAV), ignorando:', key)
          try {
            await cache.delete(key)
          } catch {
            /* ignore */
          }
          continue
        }
        return URL.createObjectURL(blob)
      }
    }

    const needsDevProxyCheck =
      isLocalDevBrowser() &&
      (isLikelyB2PublicFileUrl(resolved) || (!!fallbackUrl && isLikelyB2PublicFileUrl(fallbackUrl)))
    if (needsDevProxyCheck && getDevRemoteAudioProxyBase()) {
      await assertRemoteAudioProxyAlive()
    }

    const fetchResolved = networkFetchUrl(resolved, preferredUrl, logCtx)
    let response = await fetch(fetchResolved)
    let cacheKey = preferredUrl

    if (!response.ok && fallbackUrl && fallbackUrl !== resolved) {
      console.warn('[audio] fetch no ok', response.status, '→ fallback')
      const fetchFallback = networkFetchUrl(fallbackUrl, fallbackUrl, logCtx)
      response = await fetch(fetchFallback)
      cacheKey = fallbackUrl
    }

    if (!response.ok) {
      let detail = ''
      try {
        const t = (await response.text()).trim()
        if (t) detail = `: ${t.slice(0, 300)}`
      } catch {
        /* ignore */
      }
      throw new Error(`HTTP ${response.status}${detail}`)
    }

    const blob = await response.blob()
    if (!(await blobLooksLikeWav(blob))) {
      throw new Error('Respuesta no es WAV válido')
    }

    try {
      await cachePutWav(cache, cacheKey, blob)
    } catch {
      /* cache opcional */
    }

    return URL.createObjectURL(blob)
  } catch (e) {
    if (e instanceof Error && e.message.includes('Proxy remoto de audio')) {
      console.error(e.message)
      throw e
    }
    if (fallbackUrl && fallbackUrl !== resolved) {
      try {
        const r = await fetch(networkFetchUrl(fallbackUrl, fallbackUrl, logCtx))
        if (r.ok) {
          const blob = await r.blob()
          if (await blobLooksLikeWav(blob)) {
            try {
              const cache = await caches.open('moises-audio-cache')
              await cachePutWav(cache, fallbackUrl, blob)
            } catch {
              /* ignore */
            }
            return URL.createObjectURL(blob)
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (isLocalDevBrowser() && (isLikelyB2PublicFileUrl(resolved) || (fallbackUrl && isLikelyB2PublicFileUrl(fallbackUrl)))) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/failed to fetch|networkerror|load failed|network request failed|ETIMEDOUT|502|500|503/i.test(msg)) {
        console.error('[AUDIO]', msg)
      }
    }
    console.warn('Error cargando audio', e)
    if (isLocalDevBrowser() && isLikelyB2PublicFileUrl(resolved)) {
      const detail = e instanceof Error ? e.message : String(e)
      const hint = getDevRemoteAudioProxyBase()
        ? `No se pudo cargar el stem vía el proxy remoto. Detalle: ${detail}`
        : `No se pudo cargar el stem. Detalle: ${detail}. Si ves timeout hacia Backblaze, en .env.local puedes usar NEXT_PUBLIC_REMOTE_AUDIO_PROXY=https://<tu-app>.up.railway.app (audio sale por Railway) y reiniciar npm run dev.`
      throw new Error(hint)
    }
    return resolved
  }
}
