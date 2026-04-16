import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

/**
 * Proxy a FastAPI GET /audio/{path}. Los rewrites en next.config a 127.0.0.1 fallan en producción (500).
 */
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path?.join('/') ?? ''
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const url = `${getServerBackendUrl()}/audio/${path}`
  const range = request.headers.get('range')
  const upstreamHeaders: HeadersInit = {}
  if (range) (upstreamHeaders as Record<string, string>)['Range'] = range

  try {
    const res = await fetch(url, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(300_000),
    })

    const outHeaders = new Headers()
    const pass = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'cache-control',
      'etag',
    ]
    res.headers.forEach((v, k) => {
      if (pass.includes(k.toLowerCase())) outHeaders.set(k, v)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[backend-audio]', res.status, url, text.slice(0, 200))
      return new NextResponse(text || res.statusText, { status: res.status, headers: outHeaders })
    }

    return new NextResponse(res.body, { status: res.status, headers: outHeaders })
  } catch (e) {
    console.error('[backend-audio] proxy failed:', url, e)
    return NextResponse.json(
      { error: 'No se pudo obtener el audio del backend', hint: 'Comprueba BACKEND_URL en el deploy.' },
      { status: 502 }
    )
  }
}
