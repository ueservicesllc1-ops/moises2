import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const BACKEND_URL = getServerBackendUrl()

    const response = await fetch(`${BACKEND_URL}/api/export-mix`, {
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

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const disposition = response.headers.get('content-disposition') || 'attachment; filename="mix.wav"'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
