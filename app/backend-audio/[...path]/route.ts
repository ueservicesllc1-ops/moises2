import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

/**
 * Misma convención que backend/main.py serve_audio → B2 público (sin credenciales).
 */
function buildB2PublicFileUrl(path: string): string {
  const bucket = process.env.B2_BUCKET_NAME?.trim() || 'Multitrack'
  const b2Key = path.startsWith('audio/') ? path : `audio/${path}`
  const keyParts = b2Key.split('/').map(encodeURIComponent).join('/')
  return `https://f005.backblazeb2.com/file/${encodeURIComponent(bucket)}/${keyParts}`
}

async function fetchB2Direct(
  path: string,
  range: string | null
): Promise<Response | null> {
  const url = buildB2PublicFileUrl(path)
  const headers: HeadersInit = {}
  if (range) (headers as Record<string, string>)['Range'] = range
  try {
    return await fetch(url, {
      headers,
      signal: AbortSignal.timeout(120_000),
      cache: 'no-store',
    })
  } catch (e) {
    console.warn('[backend-audio] B2 directo falló:', url, e)
    return null
  }
}

function nextResponseFromUpstream(res: Response, passHeaders: string[]): NextResponse {
  const outHeaders = new Headers()
  res.headers.forEach((v, k) => {
    if (passHeaders.includes(k.toLowerCase())) outHeaders.set(k, v)
  })
  return new NextResponse(res.body, { status: res.status, headers: outHeaders })
}

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

  const base = getServerBackendUrl()
  const url = `${base}/audio/${path}`
  let lastError: unknown

  try {
    const res = await fetchUpstream(url, upstreamHeaders, 4)

    const outHeaders = new Headers()
    res.headers.forEach((v, k) => {
      if (passHeaders.includes(k.toLowerCase())) outHeaders.set(k, v)
    })

    if (!res.ok) {
      const b2 = await fetchB2Direct(path, range)
      if (b2?.ok) {
        console.warn('[backend-audio] upstream HTTP', res.status, '→ B2 público OK')
        return nextResponseFromUpstream(b2, passHeaders)
      }
      const text = await res.text().catch(() => '')
      console.error('[backend-audio]', res.status, url, text.slice(0, 200))
      return new NextResponse(text || res.statusText, { status: res.status, headers: outHeaders })
    }

    return nextResponseFromUpstream(res, passHeaders)
  } catch (e) {
    lastError = e
    console.warn('[backend-audio] upstream falló:', url, e)
  }

  const b2 = await fetchB2Direct(path, range)
  if (b2?.ok) {
    console.warn('[backend-audio] FastAPI no alcanzable → sirviendo desde B2 público')
    return nextResponseFromUpstream(b2, passHeaders)
  }

  console.error('[backend-audio] fallo upstream y B2:', lastError, 'B2:', b2?.status)
  return NextResponse.json(
    {
      error: 'No se pudo obtener el audio del backend ni desde B2',
      hint:
        'Monolith: revisa que Python escuche en :8000. Servicios separados: BACKEND_URL o BACKEND_PUBLIC_URL. Comprueba B2_BUCKET_NAME y que el archivo exista en el bucket.',
    },
    { status: 502 }
  )
}
