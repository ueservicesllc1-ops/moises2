import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'
import { getServerBackendUrl } from '@/lib/backendUrl'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb()
    
    // 1. Obtener usuarios de Firestore
    const usersSnapshot = await db.collection('users').get()
    const users = usersSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        email: data.email || 'Sin email',
        displayName: data.displayName || 'Sin nombre',
        isPremium: data.isPremium || false,
        planId: data.planId || 'free',
        tokenBalance: data.tokenBalance || 0,
        freeSeparationUsed: data.freeSeparationUsed || false,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
      }
    })

    // 2. Obtener estadísticas de visitas del backend
    const BACKEND_URL = getServerBackendUrl()
    let visitsStats = { total_visits: 0, unique_visitors: 0, today_visits: 0 }
    try {
      const visitsRes = await fetch(`${BACKEND_URL}/api/visits/stats`, { cache: 'no-store' })
      if (visitsRes.ok) {
        visitsStats = await visitsRes.json()
      }
    } catch (visitsErr) {
      console.error('[admin-stats] Error fetching visits stats:', visitsErr)
    }

    // 3. Obtener estadísticas detalladas de separaciones
    let separationStats = { total_songs: 0, android_songs: 0, web_songs: 0 }
    try {
      const sepRes = await fetch(`${BACKEND_URL}/api/admin/separation-stats`, { cache: 'no-store' })
      if (sepRes.ok) {
        separationStats = await sepRes.json()
      }
    } catch (sepErr) {
      console.error('[admin-stats] Error fetching separation stats:', sepErr)
    }

    // 4. Calcular instalaciones de Android estimando por el User-Agent "JudithAndroidApp" en la tabla de visitas
    let androidInstalls = 0
    try {
      const androidInstallRes = await fetch(`${BACKEND_URL}/api/visits/android-count`, { cache: 'no-store' })
      if (androidInstallRes.ok) {
        const androidData = await androidInstallRes.json()
        androidInstalls = androidData.count || 0
      }
    } catch (androidErr) {
      console.error('[admin-stats] Error fetching android installs:', androidErr)
    }

    return NextResponse.json({
      users,
      visitsStats,
      separationStats,
      androidInstalls
    })
  } catch (error) {
    console.error('[admin-stats] General error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
