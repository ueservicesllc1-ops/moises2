import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params
    const BACKEND_URL = getServerBackendUrl()

    console.log('🔍 Checking chord analysis status proxy for task:', taskId)

    const response = await fetch(`${BACKEND_URL}/api/chord-analysis/${taskId}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}`, details: errorText },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('❌ Error in /api/chord-analysis status proxy:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
