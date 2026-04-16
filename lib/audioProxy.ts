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
        return URL.createObjectURL(blob)
      }
    }

    let response = await fetch(preferredUrl)
    if (!response.ok && fallbackUrl && fallbackUrl !== preferredUrl) {
      console.warn('[audio] proxy no ok', response.status, '→ B2 directo')
      response = await fetch(fallbackUrl)
      if (response.ok) {
        await cache.put(fallbackUrl, response.clone())
        const blob = await response.blob()
        return URL.createObjectURL(blob)
      }
    } else if (response.ok) {
      await cache.put(preferredUrl, response.clone())
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch (e) {
    if (fallbackUrl && fallbackUrl !== preferredUrl) {
      try {
        const r = await fetch(fallbackUrl)
        if (r.ok) {
          try {
            const cache = await caches.open('moises-audio-cache')
            await cache.put(fallbackUrl, r.clone())
          } catch {
            /* cache opcional */
          }
          const blob = await r.blob()
          return URL.createObjectURL(blob)
        }
      } catch {
        /* ignore */
      }
    }
    console.warn('Error cargando audio (proxy/B2)', e)
    return preferredUrl
  }
}
