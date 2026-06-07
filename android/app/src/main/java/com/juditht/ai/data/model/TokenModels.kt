package com.juditht.ai.data.model

/** Token plan IDs matching the backend. */
enum class TokenPlan(
    val planId: String,
    val displayName: String,
    val emoji: String,
    val tokensMonthly: Int,
    val priceMonthly: Double,
    val minutesMonthly: Int,
    val songsApprox: String,
    val tagline: String,
    val isHighlighted: Boolean
) {
    FREE(
        planId = "free",
        displayName = "Free",
        emoji = "🎵",
        tokensMonthly = 0,
        priceMonthly = 0.0,
        minutesMonthly = 0,
        songsApprox = "1 canción gratis",
        tagline = "1 separación · Preview 40 segundos",
        isHighlighted = false
    ),
    LITE(
        planId = "lite",
        displayName = "Lite",
        emoji = "⚡",
        tokensMonthly = 1_000,
        priceMonthly = 1.99,
        minutesMonthly = 30,
        songsApprox = "6–8 canciones",
        tagline = "Perfecto para empezar",
        isHighlighted = false
    ),
    PRO(
        planId = "pro",
        displayName = "Pro",
        emoji = "🚀",
        tokensMonthly = 6_000,
        priceMonthly = 4.99,
        minutesMonthly = 180,
        songsApprox = "40–50 canciones",
        tagline = "Para músicos activos",
        isHighlighted = true
    ),
    ULTRA(
        planId = "ultra",
        displayName = "Ultra",
        emoji = "♾️",
        tokensMonthly = 20_000,
        priceMonthly = 9.99,
        minutesMonthly = 600,
        songsApprox = "Ilimitado",
        tagline = "Sin límites — para pros",
        isHighlighted = false
    );

    companion object {
        fun fromPlanId(id: String): TokenPlan =
            values().firstOrNull { it.planId == id } ?: FREE
    }
}

/** Runtime token state fetched from the backend. */
data class TokenStatus(
    val planId: String = "free",
    val tokenBalance: Int = 0,
    val freeSeparationUsed: Boolean = false,
    val canSeparate: Boolean = true,
    val reason: String? = null
) {
    val plan: TokenPlan get() = TokenPlan.fromPlanId(planId)
    val isFree: Boolean get() = planId == "free" || planId == "starter"
    val isUpgradeRequired: Boolean get() = !canSeparate
}

/** Cost helpers mirroring the backend (33 tokens/min). */
object TokenCost {
    const val TOKENS_PER_MINUTE = 33
    const val FREE_PREVIEW_SECONDS = 40L

    fun costForDuration(durationSeconds: Double): Int =
        maxOf(1, ((durationSeconds / 60.0) * TOKENS_PER_MINUTE).toInt())
}

data class TokenTransaction(
    val id: String = "",
    val amount: Int = 0,
    val type: String = "",
    val description: String = "",
    val timestamp: Long = 0L
)
