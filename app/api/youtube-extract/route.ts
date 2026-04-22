import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { error: 'URL de YouTube requerida' },
        { status: 400 }
      )
    }

    console.log('🎬 Extrayendo audio de YouTube:', url)

    // Usar la misma URL que el resto de proxies (respeta BACKEND_INTERNAL_URL en Railway)
    const { getServerBackendUrl } = await import('@/lib/backendUrl')
    const backendUrl = getServerBackendUrl()
    console.log('   Backend URL:', backendUrl)
    console.log('   Endpoint completo:', `${backendUrl}/youtube-extract`)
    
    let response
    try {
      response = await fetch(`${backendUrl}/youtube-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
    } catch (fetchError: any) {
      console.error('❌ Error de conexión con el backend:', fetchError)
      throw new Error(`No se puede conectar con el backend de Python en ${backendUrl}. Asegúrate de que el servidor esté corriendo (python backend/main.py)`)
    }

    console.log('   Response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        detail: `Backend error: ${response.status} ${response.statusText}` 
      }))
      console.error('❌ Error del backend Python:', errorData)
      throw new Error(errorData.detail || errorData.error || 'Error al extraer audio')
    }

    const data = await response.json()
    console.log('✅ Audio extraído correctamente:', data.title)
    console.log('   Audio data length:', data.audioData?.length || 0, 'characters')

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('❌ Error extrayendo audio de YouTube:', error)
    return NextResponse.json(
      { error: error.message || 'Error al extraer audio de YouTube' },
      { status: 500 }
    )
  }
}

