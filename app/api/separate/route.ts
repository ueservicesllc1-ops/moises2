import { NextRequest, NextResponse } from 'next/server'
import { postFormDataToBackend } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    console.log('🔗 Forwarding /separate to Python (multi-base, ver getServerBackendBaseUrls)')

    const response = await postFormDataToBackend('/separate', formData, { timeoutMs: 300_000 })

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
    console.error('❌ Error in /api/separate:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
