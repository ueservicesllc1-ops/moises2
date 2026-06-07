package com.juditht.ai.data.db

import androidx.room.*
import com.juditht.ai.data.model.SeparationJobEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SeparationJobDao {

    @Query("SELECT * FROM separation_jobs ORDER BY createdAt DESC")
    fun getAllJobs(): Flow<List<SeparationJobEntity>>

    @Query("SELECT * FROM separation_jobs WHERE taskId = :taskId")
    suspend fun getJobById(taskId: String): SeparationJobEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertJob(job: SeparationJobEntity)

    @Delete
    suspend fun deleteJob(job: SeparationJobEntity)

    @Query("DELETE FROM separation_jobs WHERE taskId = :taskId")
    suspend fun deleteJobById(taskId: String)
}

@Database(
    entities = [SeparationJobEntity::class],
    version = 1,
    exportSchema = false
)
abstract class SonicSplitDatabase : RoomDatabase() {
    abstract fun separationJobDao(): SeparationJobDao
}
