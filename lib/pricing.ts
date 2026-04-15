/** Planes públicos — enlaces de pago opcionales (Stripe Checkout, Lemon Squeezy, etc.) */
export const checkoutUrls = {
  liteMonthly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_MONTHLY ?? '',
  liteYearly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_YEARLY ?? '',
  proMonthly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_MONTHLY ?? '',
  proYearly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_YEARLY ?? '',
} as const

export type BillingPeriod = 'monthly' | 'yearly'
