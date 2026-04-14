import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}))

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
