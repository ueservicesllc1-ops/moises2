/** Planes públicos — enlaces de pago opcionales (Stripe Checkout, Lemon Squeezy, etc.) */
export const checkoutUrls = {
  liteMonthly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_MONTHLY ?? '',
  liteYearly: process.env.NEXT_PUBLIC_CHECKOUT_LITE_YEARLY ?? '',
  proMonthly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_MONTHLY ?? '',
  proYearly: process.env.NEXT_PUBLIC_CHECKOUT_PRO_YEARLY ?? '',
} as const

export type BillingPeriod = 'monthly' | 'yearly'

export type PlanId = 'starter' | 'free' | 'lite' | 'pro' | 'ultra'

export type PlanLimits = {
  planId: PlanId
  displayName: string
  includedMinutesMonthly: number | null
  fastQueueMinutesMonthly: number
  maxUploadBytes: number
  requiresCard: boolean
  freePreviews: boolean
  tokensMonthly: number
  previewOnlySeconds: number | null  // null = full access
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  starter: {
    planId: 'starter',
    displayName: 'Free',
    includedMinutesMonthly: 0,
    fastQueueMinutesMonthly: 0,
    maxUploadBytes: 200 * 1024 * 1024,
    requiresCard: false,
    freePreviews: true,
    tokensMonthly: 0,
    previewOnlySeconds: 40,
  },
  free: {
    planId: 'free',
    displayName: 'Free',
    includedMinutesMonthly: 0,
    fastQueueMinutesMonthly: 0,
    maxUploadBytes: 200 * 1024 * 1024,
    requiresCard: false,
    freePreviews: true,
    tokensMonthly: 0,
    previewOnlySeconds: 40,
  },
  lite: {
    planId: 'lite',
    displayName: 'Lite',
    includedMinutesMonthly: 30,
    fastQueueMinutesMonthly: 90,
    maxUploadBytes: 2 * 1024 * 1024 * 1024,
    requiresCard: true,
    freePreviews: false,
    tokensMonthly: 1_000,
    previewOnlySeconds: null,
  },
  pro: {
    planId: 'pro',
    displayName: 'Pro',
    includedMinutesMonthly: 180,
    fastQueueMinutesMonthly: 250,
    maxUploadBytes: 2 * 1024 * 1024 * 1024,
    requiresCard: true,
    freePreviews: false,
    tokensMonthly: 6_000,
    previewOnlySeconds: null,
  },
  ultra: {
    planId: 'ultra',
    displayName: 'Ultra',
    includedMinutesMonthly: 600,
    fastQueueMinutesMonthly: 600,
    maxUploadBytes: 2 * 1024 * 1024 * 1024,
    requiresCard: true,
    freePreviews: false,
    tokensMonthly: 20_000,
    previewOnlySeconds: null,
  },
}

type UserLike = {
  planId?: string
  isPremium?: boolean
} | null | undefined

export function resolvePlanIdFromUserData(userData: UserLike): PlanId {
  if (!userData) return 'free'
  if (
    userData.planId === 'free' ||
    userData.planId === 'starter' ||
    userData.planId === 'lite' ||
    userData.planId === 'pro' ||
    userData.planId === 'ultra'
  ) {
    return userData.planId as PlanId
  }
  if (userData.isPremium) return 'pro'
  return 'free'
}
