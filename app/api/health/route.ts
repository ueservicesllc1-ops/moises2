import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'
import { applyLocalDevBrowserCors } from '@/lib/devBrowserCors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers()
  applyLocalDevBrowserCors(request, headers)
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Max-Age', '86400')
  return new NextResponse(null, { status: 204, headers })
}

/** Siempre HTTP 200: el propio Next responde; el backend Python es opcional en local. */
export async function GET(request: NextRequest) {
  const backendUrl = getServerBackendUrl()
  const base = {
    status: 'ok' as const,
    service: 'moises-clone-frontend',
    timestamp: new Date().toISOString(),
  }

  try {
    const response = await fetch(`${backendUrl}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      const res = NextResponse.json({
        ...base,
        backend: 'down' as const,
        backendUrl,
        detail: `HTTP ${response.status}`,
      })
      applyLocalDevBrowserCors(request, res.headers)
      return res
    }

    const backendHealth = await response.json().catch(() => ({}))
    const res = NextResponse.json({
      ...base,
      backend: 'up' as const,
      backendHealth: backendHealth?.status ?? 'ok',
      backendUrl,
      dependencies: backendHealth?.dependencies ?? null,
    })
    applyLocalDevBrowserCors(request, res.headers)
    return res
  } catch {
    const res = NextResponse.json({
      ...base,
      backend: 'down' as const,
      backendUrl,
      detail: 'Backend no alcanzable (¿Python en :8000?)',
    })
    applyLocalDevBrowserCors(request, res.headers)
    return res
  }
}
