import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'
import { canStartSeparation } from '@/lib/tokens'
import type { TokenPlanId } from '@/lib/tokens'

export const dynamic = 'force-dynamic'

/**
 * GET /api/check-tokens?uid=<firebase_uid>
 * Returns the user's token state so clients can decide whether to show a paywall.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = request.nextUrl.searchParams.get('uid')
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 })
    }

    const db = getAdminDb()
    const userDoc = await db.collection('users').doc(uid).get()

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const data = userDoc.data() ?? {}
    const planId: TokenPlanId = (['lite', 'pro', 'ultra'].includes(data.planId) ? data.planId : 'free') as TokenPlanId
    const tokenBalance: number = typeof data.tokenBalance === 'number' ? data.tokenBalance : 0
    const freeSeparationUsed: boolean = data.freeSeparationUsed === true

    const { allowed, reason } = canStartSeparation({ planId, tokenBalance, freeSeparationUsed })

    return NextResponse.json({
      planId,
      tokenBalance,
      freeSeparationUsed,
      canSeparate: allowed,
      reason: reason ?? null,
    })
  } catch (error) {
    console.error('[check-tokens] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
