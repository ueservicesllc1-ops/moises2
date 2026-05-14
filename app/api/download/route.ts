import { NextRequest, NextResponse } from 'next/server'
import { applyLocalDevBrowserCors } from '@/lib/devBrowserCors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers()
  applyLocalDevBrowserCors(request, headers)
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Range, Accept')
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Type, Accept-Ranges, Content-Range, ETag, Last-Modified'
  )
  headers.set('Access-Control-Max-Age', '86400')
  return new NextResponse(null, { status: 204, headers })
}

/** Misma política que `b2-proxy.mjs`: solo HTTPS a hosts B2 públicos conocidos. */
function isAllowedB2DownloadUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw).trim())
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return h === 'f005.backblazeb2.com' || h === 's3.us-east-005.backblazeb2.com'
  } catch {
    return false
  }
}

function normalizeUrlParam(raw: string): string {
  let decoded = String(raw).trim()
  try {
    if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
      decoded = decodeURIComponent(decoded)
    }
  } catch {
    /* mantener */
  }
  return decoded
}

/**
 * GET /api/download?url=<https B2…>
 * El navegador nunca pega a f005 directo: Next (Railway o local) reenvía el binario desde B2.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url')
  if (!raw?.trim()) {
    const res = NextResponse.json({ error: 'Missing url' }, { status: 400 })
    applyLocalDevBrowserCors(request, res.headers)
    return res
  }

  const decoded = normalizeUrlParam(raw)
  if (!isAllowedB2DownloadUrl(decoded)) {
    const res = NextResponse.json({ error: 'URL not allowed' }, { status: 403 })
    applyLocalDevBrowserCors(request, res.headers)
    return res
  }

  const range = request.headers.get('range')
  let upstream: Response
  try {
    upstream = await fetch(decoded, {
      method: 'GET',
      headers: {
        ...(range ? { Range: range } : {}),
        'User-Agent': 'MoisesStudio/1.0 (Next /api/download)',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(300_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const res = new NextResponse(`fetch B2 failed: ${msg}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
    applyLocalDevBrowserCors(request, res.headers)
    return res
  }

  const pass = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'etag',
    'cache-control',
    'last-modified',
  ]
  const out = new Headers()
  for (const k of pass) {
    const v = upstream.headers.get(k)
    if (v) out.set(k, v)
  }

  applyLocalDevBrowserCors(request, out)

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
