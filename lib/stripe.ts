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

export type CheckoutPlan = 'lite' | 'pro' | 'ultra'
export type CheckoutBilling = 'monthly' | 'yearly'

export function resolveStripePriceId(plan: CheckoutPlan, billing: CheckoutBilling): string {
  if (plan === 'lite') {
    return billing === 'yearly'
      ? process.env.STRIPE_PRICE_LITE_YEARLY ?? ''
      : process.env.STRIPE_PRICE_LITE_MONTHLY ?? ''
  }
  if (plan === 'ultra') {
    return billing === 'yearly'
      ? process.env.STRIPE_PRICE_ULTRA_YEARLY ?? process.env.STRIPE_PRICE_ULTRA_MONTHLY ?? ''
      : process.env.STRIPE_PRICE_ULTRA_MONTHLY ?? ''
  }
  // pro (default)
  return billing === 'yearly'
    ? process.env.STRIPE_PRICE_PRO_YEARLY ?? ''
    : process.env.STRIPE_PRICE_PRO_MONTHLY ?? ''
}

/** Maps plan IDs to the number of tokens credited on subscription renewal. */
export const PLAN_TOKEN_GRANTS: Record<string, number> = {
  lite:  1_000,
  pro:   6_000,
  ultra: 20_000,
}
