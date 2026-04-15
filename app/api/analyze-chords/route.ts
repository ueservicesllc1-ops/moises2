import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    console.log('🔗 Proxying Chord Analysis upload to:', `${BACKEND_URL}/api/analyze-chords`)
    
    const response = await fetch(`${BACKEND_URL}/api/analyze-chords`, {
      method: 'POST',
      body: formData,
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
    console.error('❌ Error in /api/analyze-chords proxy:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
