import { NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export const dynamic = 'force-dynamic'

/** Siempre HTTP 200: el propio Next responde; el backend Python es opcional en local. */
export async function GET() {
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
      return NextResponse.json({
        ...base,
        backend: 'down' as const,
        backendUrl,
        detail: `HTTP ${response.status}`,
      })
    }

    const backendHealth = await response.json().catch(() => ({}))
    return NextResponse.json({
      ...base,
      backend: 'up' as const,
      backendHealth: backendHealth?.status ?? 'ok',
      backendUrl,
    })
  } catch {
    return NextResponse.json({
      ...base,
      backend: 'down' as const,
      backendUrl,
      detail: 'Backend no alcanzable (¿Python en :8000?)',
    })
  }
}
