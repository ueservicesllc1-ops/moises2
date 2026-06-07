import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const { userId, planId, tokenBalance } = await request.json()
    if (!userId || !planId) {
      return NextResponse.json({ error: 'Missing userId or planId' }, { status: 400 })
    }

    const db = getAdminDb()
    const userRef = db.collection('users').doc(userId)
    
    const isPremium = planId !== 'free' && planId !== 'starter'
    
    const updateData: Record<string, any> = {
      planId,
      isPremium
    }

    if (typeof tokenBalance === 'number') {
      updateData.tokenBalance = tokenBalance
    } else {
      // Default tokens if not specified
      if (planId === 'lite') updateData.tokenBalance = 1000
      else if (planId === 'pro') updateData.tokenBalance = 6000
      else if (planId === 'ultra') updateData.tokenBalance = 20000
      else updateData.tokenBalance = 0
    }

    await userRef.set(updateData, { merge: true })

    return NextResponse.json({ success: true, message: `Updated user to plan ${planId}` })
  } catch (error) {
    console.error('[admin-update-user] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
