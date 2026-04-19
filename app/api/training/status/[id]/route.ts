import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const callId = params.id
    const BACKEND_URL = getServerBackendUrl()

    const response = await fetch(`${BACKEND_URL}/api/training/status/${callId}`, {
      method: 'GET',
    })

    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
