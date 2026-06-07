package com.juditht.ai.data.api

import com.juditht.ai.data.model.SeparateResponse
import com.juditht.ai.data.model.StatusResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface SonicSplitApiService {

    /**
     * Upload an audio file and start the AI separation job.
     * POST /api/separate-demucs
     */
    @Multipart
    @POST("api/separate-demucs")
    suspend fun separateAudio(
        @Part file: MultipartBody.Part,
        @Part("separation_type") separationType: RequestBody,
        @Part("hi_fi")           hiFi: RequestBody,
        @Part("quality_profile") qualityProfile: RequestBody,
        @Part("generate_click")  generateClick: RequestBody,
        @Part("user_id")         userId: RequestBody,
        @Part("separation_options") separationOptions: RequestBody?,
    ): Response<SeparateResponse>

    /**
     * Poll the status of a separation job.
     * GET /status/{task_id}
     */
    @GET("status/{taskId}")
    suspend fun getStatus(
        @Path("taskId") taskId: String
    ): Response<StatusResponse>

    /**
     * Health check.
     * GET /api/health
     */
    @GET("api/health")
    suspend fun health(): Response<Map<String, Any>>
}
