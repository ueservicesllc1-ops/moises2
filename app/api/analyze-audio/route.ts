import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const backendUrl = getServerBackendUrl()
    const formData = await request.formData()

    const response = await fetch(`${backendUrl}/api/analyze-audio`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Backend error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in /api/analyze-audio:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
