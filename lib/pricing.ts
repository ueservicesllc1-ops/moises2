/** Planes públicos — enlaces de pago opcionales (Stripe Checkout, Lemon Squeezy, etc.) */
export const checkoutUrls = {
  liteMonthly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_MONTHLY ?? '',
  liteYearly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_YEARLY ?? '',
  proMonthly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_MONTHLY ?? '',
  proYearly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_YEARLY ?? '',
} as const

export type BillingPeriod = 'monthly' | 'yearly'

export type PlanId = 'starter' | 'lite' | 'pro'

export type PlanLimits = {
  planId: PlanId
  displayName: string
  includedMinutesMonthly: number | null
  fastQueueMinutesMonthly: number
  maxUploadBytes: number
  requiresCard: boolean
  freePreviews: boolean
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  starter: {
    planId: 'starter',
    displayName: 'Starter',
    includedMinutesMonthly: 10,
    fastQueueMinutesMonthly: 0,
    maxUploadBytes: 200 * 1024 * 1024,
    requiresCard: false,
    freePreviews: true,
  },
  lite: {
    planId: 'lite',
    displayName: 'Lite',
    includedMinutesMonthly: null,
    fastQueueMinutesMonthly: 90,
    maxUploadBytes: 2 * 1024 * 1024 * 1024,
    requiresCard: true,
    freePreviews: true,
  },
  pro: {
    planId: 'pro',
    displayName: 'Pro',
    includedMinutesMonthly: null,
    fastQueueMinutesMonthly: 250,
    maxUploadBytes: 2 * 1024 * 1024 * 1024,
    requiresCard: true,
    freePreviews: true,
  },
}

type UserLike = {
  planId?: string
  isPremium?: boolean
} | null | undefined

export function resolvePlanIdFromUserData(userData: UserLike): PlanId {
  if (!userData) return 'starter'
  if (userData.planId === 'starter' || userData.planId === 'lite' || userData.planId === 'pro') {
    return userData.planId
  }
  if (userData.isPremium) return 'pro'
  return 'starter'
}
