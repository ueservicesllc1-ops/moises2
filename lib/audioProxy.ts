/**
 * URLs públicas B2 → ruta relativa bajo /backend-audio (misma convención que FastAPI /audio/{path}).
 */

export const B2_AUDIO_PATH_REGEX =
  /^https?:\/\/(?:s3\.us-east-005|f005)\.backblazeb2\.com\/(?:file\/)?(?:moises2|Multitrack)\/audio\/(.+)$/i

export function stemPathFromB2PublicUrl(url: string): string | null {
  const m = String(url).trim().match(B2_AUDIO_PATH_REGEX)
  return m?.[1] ?? null
}

export function toBackendAudioProxyUrl(stemPath: string): string {
  return `/backend-audio/${stemPath}`
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
 * Cache API + fetch: intenta primero el proxy (backend → disco/B2); si falla, URL B2 pública (Railway sin Python).
 */
export async function getCachedAudioBlobUrl(
  preferredUrl: string,
  fallbackUrl?: string
): Promise<string> {
  const tryKeys = [preferredUrl, ...(fallbackUrl && fallbackUrl !== preferredUrl ? [fallbackUrl] : [])]

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

    let response = await fetch(preferredUrl)
    let cacheKey = preferredUrl

    if (!response.ok && fallbackUrl && fallbackUrl !== preferredUrl) {
      console.warn('[audio] proxy no ok', response.status, '→ B2 directo')
      response = await fetch(fallbackUrl)
      cacheKey = fallbackUrl
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
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
    if (fallbackUrl && fallbackUrl !== preferredUrl) {
      try {
        const r = await fetch(fallbackUrl)
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
    console.warn('Error cargando audio (proxy/B2)', e)
    return preferredUrl
  }
}
