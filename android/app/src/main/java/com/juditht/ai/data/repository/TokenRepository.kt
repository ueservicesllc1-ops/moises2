package com.juditht.ai.data.repository

import com.juditht.ai.data.api.SonicSplitApiService
import com.juditht.ai.data.model.TokenStatus
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRepository @Inject constructor(
    private val api: SonicSplitApiService
) {
    /** Fetch the user's current token state from the backend. */
    suspend fun getTokenStatus(uid: String): ApiResult<TokenStatus> {
        return try {
            val response = api.checkTokens(uid)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                val status = TokenStatus(
                    planId            = body["planId"] as? String ?: "free",
                    tokenBalance      = (body["tokenBalance"] as? Double)?.toInt()
                        ?: (body["tokenBalance"] as? Int) ?: 0,
                    freeSeparationUsed = body["freeSeparationUsed"] as? Boolean ?: false,
                    canSeparate       = body["canSeparate"] as? Boolean ?: true,
                    reason            = body["reason"] as? String,
                )
                ApiResult.Success(status)
            } else {
                ApiResult.Error(
                    response.errorBody()?.string() ?: "Token check failed",
                    response.code()
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Network error")
        }
    }
}
