import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 2000

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
    return res
  } catch (err: any) {
    const isConnectionError = err?.cause?.code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')
    if (isConnectionError && retries > 0) {
      console.log(`⏳ Python backend not ready, retrying in ${RETRY_DELAY_MS}ms... (${retries} left)`)
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      return fetchWithRetry(url, options, retries - 1)
    }
    throw err
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const BACKEND_URL = getServerBackendUrl()

    console.log('🔗 Forwarding to Python backend:', `${BACKEND_URL}/separate`)

    const response = await fetchWithRetry(`${BACKEND_URL}/separate`, {
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
    console.error('❌ Error in /api/separate:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
