import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const BACKEND_URL = getServerBackendUrl()
    const response = await fetch(`${BACKEND_URL}/api/visits/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: body?.path || '/',
        visitorId: body?.visitorId || '',
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: 'Backend error', details: text }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to track visit', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
