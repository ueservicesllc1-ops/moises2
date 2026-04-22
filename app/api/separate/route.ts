import { NextRequest, NextResponse } from 'next/server'
import { postFormDataToBackend } from '@/lib/backendUrl'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    console.log('🔗 POST /separate →', process.env.BACKEND_FETCH_MODE === 'remote' ? 'FastAPI remoto' : 'FastAPI local (getServerBackendUrl)')

    // Compatibilidad entre despliegues: distintos backends usan rutas diferentes.
    const candidatePaths = ['/separate', '/api/separate-demucs', '/api/separate']
    const tried: Array<{ path: string; status: number; statusText: string }> = []
    let response: Response | null = null

    for (const path of candidatePaths) {
      response = await postFormDataToBackend(path, formData, { timeoutMs: 300_000 })
      tried.push({ path, status: response.status, statusText: response.statusText })

      if (response.ok) {
        console.log(`✅ Backend separation route found: ${path}`)
        break
      }

      if (response.status !== 404) {
        // Si no es 404, no seguimos intentando para no ocultar errores reales (400/500/etc)
        break
      }

      console.warn(`⚠️ Backend 404 en ${path}, probando siguiente ruta...`)
    }

    if (!response) {
      return NextResponse.json(
        {
          error: 'Backend error: no response from backend',
          details: 'No backend response was returned after trying all candidate routes.',
          triedRoutes: tried,
        },
        { status: 502 }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          error: `Backend error: ${response.status} ${response.statusText}`,
          details: errorText,
          triedRoutes: tried,
        },
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
