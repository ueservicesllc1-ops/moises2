/**
 * Token system constants and helpers.
 *
 * 1 token ≈ 1.8 seconds of audio processing
 * 33 tokens = 1 minute of audio
 *
 * Plans:
 *   free  — 0 tokens, 1 free separation with 40s preview
 *   lite  — 1,000  tokens (~30 min)
 *   pro   — 6,000  tokens (~3 hours)
 *   ultra — 20,000 tokens (~10 hours, marketed as "unlimited")
 */

export const TOKENS_PER_MINUTE = 33

export type TokenPlanId = 'free' | 'lite' | 'pro' | 'ultra'

export interface TokenPlan {
  id: TokenPlanId
  displayName: string
  emoji: string
  monthlyTokens: number
  priceMonthly: number          // USD
  minutesMonthly: number        // approximate
  songsApprox: string           // human-readable
  tagline: string
  highlighted: boolean
}

export const TOKEN_PLANS: TokenPlan[] = [
  {
    id: 'free',
    displayName: 'Free',
    emoji: '🎵',
    monthlyTokens: 0,
    priceMonthly: 0,
    minutesMonthly: 0,
    songsApprox: '1 canción gratis',
    tagline: '1 separación gratis · Preview de 40 segundos',
    highlighted: false,
  },
  {
    id: 'lite',
    displayName: 'Lite',
    emoji: '⚡',
    monthlyTokens: 1_000,
    priceMonthly: 1.99,
    minutesMonthly: 30,
    songsApprox: '6–8 canciones',
    tagline: 'Perfecto para empezar',
    highlighted: false,
  },
  {
    id: 'pro',
    displayName: 'Pro',
    emoji: '🚀',
    monthlyTokens: 6_000,
    priceMonthly: 4.99,
    minutesMonthly: 180,
    songsApprox: '40–50 canciones',
    tagline: 'Para músicos activos',
    highlighted: true,
  },
  {
    id: 'ultra',
    displayName: 'Ultra',
    emoji: '♾️',
    monthlyTokens: 20_000,
    priceMonthly: 9.99,
    minutesMonthly: 600,
    songsApprox: 'Ilimitado',
    tagline: 'Sin límites — para pros',
    highlighted: false,
  },
]

/** Cost in tokens to separate `durationSeconds` of audio. */
export function tokenCostForDuration(durationSeconds: number): number {
  return Math.ceil((durationSeconds / 60) * TOKENS_PER_MINUTE)
}

/** Preview cutoff for free users (seconds). */
export const FREE_PREVIEW_SECONDS = 40

/** Number of free separations a Free user gets. */
export const FREE_SEPARATIONS = 1

export function getPlanById(id: string): TokenPlan {
  return TOKEN_PLANS.find((p) => p.id === id) ?? TOKEN_PLANS[0]
}

/** Returns true if the user can start a separation based on their token state. */
export function canStartSeparation(params: {
  planId: TokenPlanId
  tokenBalance: number
  freeSeparationUsed: boolean
}): { allowed: boolean; reason?: string } {
  const { planId, tokenBalance, freeSeparationUsed } = params

  if (planId === 'free') {
    if (tokenBalance > 0) {
      return { allowed: true }
    }
    if (freeSeparationUsed) {
      return { allowed: false, reason: 'free_exhausted' }
    }
    return { allowed: true }
  }

  if (tokenBalance <= 0) {
    return { allowed: false, reason: 'no_tokens' }
  }

  return { allowed: true }
}
