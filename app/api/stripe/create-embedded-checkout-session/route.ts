import { NextRequest, NextResponse } from 'next/server'
import {
  getStripeServerClient,
  resolveStripePriceId,
  type CheckoutBilling,
  type CheckoutPlan,
} from '@/lib/stripe'

type Payload = {
  plan?: CheckoutPlan
  billing?: CheckoutBilling
  uid?: string
  email?: string
}

function isValidPlan(plan: string | undefined): plan is CheckoutPlan {
  return plan === 'lite' || plan === 'pro'
}

function isValidBilling(billing: string | undefined): billing is CheckoutBilling {
  return billing === 'monthly' || billing === 'yearly'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload
    if (!isValidPlan(body.plan) || !isValidBilling(body.billing)) {
      return NextResponse.json({ error: 'Invalid plan or billing' }, { status: 400 })
    }
    if (!body.uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 })
    }

    const priceId = resolveStripePriceId(body.plan, body.billing)
    if (!priceId) {
      return NextResponse.json({ error: 'Missing Stripe price ID in env' }, { status: 500 })
    }

    const stripe = getStripeServerClient()
    const origin = request.nextUrl.origin
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'embedded_page' as any,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: body.email || undefined,
      client_reference_id: body.uid,
      metadata: {
        planId: body.plan,
        billingPeriod: body.billing,
      },
      subscription_data: {
        metadata: {
          planId: body.plan,
          billingPeriod: body.billing,
        },
      },
      allow_promotion_codes: true,
    })

    if (!session.client_secret) {
      return NextResponse.json({ error: 'Stripe client secret missing' }, { status: 500 })
    }

    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (error) {
    console.error('Error creating embedded Stripe checkout session:', error)
    const message = error instanceof Error ? error.message : 'Could not create embedded checkout session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
