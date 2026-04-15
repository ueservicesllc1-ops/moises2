import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeServerClient(): Stripe {
  if (stripeClient) return stripeClient

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }

  stripeClient = new Stripe(secretKey)
  return stripeClient
}

export type CheckoutPlan = 'lite' | 'pro'
export type CheckoutBilling = 'monthly' | 'yearly'

export function resolveStripePriceId(plan: CheckoutPlan, billing: CheckoutBilling): string {
  if (plan === 'lite') {
    return billing === 'yearly'
      ? process.env.STRIPE_PRICE_LITE_YEARLY ?? ''
      : process.env.STRIPE_PRICE_LITE_MONTHLY ?? ''
  }
  return billing === 'yearly'
    ? process.env.STRIPE_PRICE_PRO_YEARLY ?? ''
    : process.env.STRIPE_PRICE_PRO_MONTHLY ?? ''
}
