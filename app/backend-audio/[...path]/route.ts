import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendBaseUrls } from '@/lib/backendUrl'

/**
 * Proxy a FastAPI GET /audio/{path}.
 * Prueba varias bases (env + 127.0.0.1) y reintenta si Python aún no escucha (race al arrancar).
 */
async function fetchUpstream(
  url: string,
  upstreamHeaders: HeadersInit,
  maxAttempts: number
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetch(url, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(300_000),
      })
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      const retryable =
        /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket/i.test(msg) ||
        (e instanceof Error && msg.includes('aborted'))
      if (!retryable || attempt === maxAttempts - 1) {
        throw e
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw lastErr
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path?.join('/') ?? ''
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const range = request.headers.get('range')
  const upstreamHeaders: HeadersInit = {}
  if (range) (upstreamHeaders as Record<string, string>)['Range'] = range

  const passHeaders = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'cache-control',
    'etag',
  ]

  const bases = getServerBackendBaseUrls()
  let lastError: unknown

  for (const base of bases) {
    const url = `${base}/audio/${path}`
    try {
      const res = await fetchUpstream(url, upstreamHeaders, 4)

      const outHeaders = new Headers()
      res.headers.forEach((v, k) => {
        if (passHeaders.includes(k.toLowerCase())) outHeaders.set(k, v)
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('[backend-audio]', res.status, url, text.slice(0, 200))
        return new NextResponse(text || res.statusText, { status: res.status, headers: outHeaders })
      }

      return new NextResponse(res.body, { status: res.status, headers: outHeaders })
    } catch (e) {
      lastError = e
      console.warn('[backend-audio] base failed, next:', base, e)
    }
  }

  console.error('[backend-audio] all bases failed:', lastError)
  return NextResponse.json(
    {
      error: 'No se pudo obtener el audio del backend',
      hint:
        'Si Python está en otro servicio Railway, define BACKEND_URL o BACKEND_PUBLIC_URL con la URL https del API. Monolith: revisa logs (¿Python en :8000?).',
    },
    { status: 502 }
  )
}
