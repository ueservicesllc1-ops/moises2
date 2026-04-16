import { NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const BACKEND_URL = getServerBackendUrl()
    const response = await fetch(`${BACKEND_URL}/api/visits/stats`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: 'Backend error', details: text }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch visit stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
