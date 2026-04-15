import { NextRequest, NextResponse } from 'next/server'
import { getStripeServerClient } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sessionId?: string; uid?: string }
    if (!body.sessionId || !body.uid) {
      return NextResponse.json({ error: 'Missing sessionId or uid' }, { status: 400 })
    }

    const stripe = getStripeServerClient()
    const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
      expand: ['subscription'],
    })

    if (session.client_reference_id !== body.uid) {
      return NextResponse.json({ error: 'Session does not belong to user' }, { status: 403 })
    }

    const planId = session.metadata?.planId
    const billingPeriod = session.metadata?.billingPeriod
    const isPaid = session.payment_status === 'paid' || session.status === 'complete'

    if (!isPaid || (planId !== 'lite' && planId !== 'pro')) {
      return NextResponse.json({ active: false }, { status: 200 })
    }

    return NextResponse.json({
      active: true,
      planId,
      billingPeriod: billingPeriod === 'yearly' ? 'yearly' : 'monthly',
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
    })
  } catch (error) {
    console.error('Error validating Stripe checkout session:', error)
    return NextResponse.json({ error: 'Could not validate checkout session' }, { status: 500 })
  }
}
