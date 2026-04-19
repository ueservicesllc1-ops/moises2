import { NextRequest, NextResponse } from 'next/server'
import { getServerBackendUrl } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}))
    const BACKEND_URL = getServerBackendUrl()

    const response = await fetch(`${BACKEND_URL}/api/training/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300000), // Aumentado a 5 minutos para sincronización
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error || data?.detail || `Error del Servidor AI: ${response.status} ${response.statusText}`,
          details: data?.details || null,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[training/start] Error:', error)
    return NextResponse.json(
      {
        error: error.name === 'AbortError' ? 'Tiempo de espera agotado (Timeout)' : 'Error interno de comunicación con el motor de IA',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 },
    )
  }
}
