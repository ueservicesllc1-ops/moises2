import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripeServerClient } from '@/lib/stripe'
import { getAdminDb } from '@/lib/firebaseAdmin'

async function markUserPlanFromCheckout(session: Stripe.Checkout.Session) {
  const uid = session.client_reference_id
  const planId = session.metadata?.planId
  const billingPeriod = session.metadata?.billingPeriod

  if (!uid || (planId !== 'lite' && planId !== 'pro')) return

  const db = getAdminDb()
  await db.collection('users').doc(uid).set(
    {
      planId,
      isPremium: true,
      billingPeriod: billingPeriod === 'yearly' ? 'yearly' : 'monthly',
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
      planUpdateSource: 'stripe_webhook_checkout_completed',
      planUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

async function markSubscriptionStatus(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null
  if (!subscriptionId && !customerId) return

  const db = getAdminDb()
  let querySnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData> | null = null

  if (subscriptionId) {
    querySnap = await db
      .collection('users')
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get()
  }

  if ((!querySnap || querySnap.empty) && customerId) {
    querySnap = await db
      .collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get()
  }

  if (!querySnap || querySnap.empty) return

  const active = subscription.status === 'active' || subscription.status === 'trialing'
  const docRef = querySnap.docs[0].ref
  await docRef.set(
    {
      isPremium: active,
      planId: active ? (subscription.metadata?.planId || 'pro') : 'starter',
      stripeSubscriptionStatus: subscription.status,
      planUpdateSource: 'stripe_webhook_subscription_update',
      planUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('stripe-signature')
    const webhookSecretRaw = process.env.STRIPE_WEBHOOK_SECRET
    if (!signature || !webhookSecretRaw) {
      return NextResponse.json({ error: 'Missing Stripe signature or webhook secret' }, { status: 400 })
    }

    const stripe = getStripeServerClient()
    const payload = await request.text()
    const webhookSecrets = webhookSecretRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    let event: Stripe.Event | null = null
    for (const secret of webhookSecrets) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, secret)
        break
      } catch {
        // try next secret
      }
    }

    if (!event) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await markUserPlanFromCheckout(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await markSubscriptionStatus(event.data.object as Stripe.Subscription)
        break
      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 400 })
  }
}
