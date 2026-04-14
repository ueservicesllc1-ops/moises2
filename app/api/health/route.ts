import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
  try {
    const response = await fetch(`${backendUrl}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          status: 'degraded',
          backend: 'down',
          service: 'moises-clone-frontend',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    const backendHealth = await response.json()
    return NextResponse.json({
      status: 'ok',
      backend: backendHealth?.status || 'ok',
      service: 'moises-clone-frontend',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        backend: 'down',
        service: 'moises-clone-frontend',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
