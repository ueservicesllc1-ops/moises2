import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}))
    const BACKEND_URL = getServerBackendUrl()

    const response = await fetch(`${BACKEND_URL}/api/training/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error || `Backend error: ${response.status} ${response.statusText}`,
          details: data?.details || null,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
