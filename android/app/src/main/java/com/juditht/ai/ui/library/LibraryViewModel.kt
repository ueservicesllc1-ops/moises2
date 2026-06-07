package com.juditht.ai.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.juditht.ai.data.model.SeparationJobEntity
import com.juditht.ai.data.repository.SeparationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LibraryState(
    val jobs: List<SeparationJobEntity> = emptyList(),
    val filter: LibraryFilter = LibraryFilter.All,
    val searchQuery: String = ""
)

enum class LibraryFilter(val label: String) {
    All("All Tracks"),
    Completed("Completed"),
    Processing("Processing"),
    Failed("Failed")
}

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val repository: SeparationRepository
) : ViewModel() {

    private val _filter = MutableStateFlow(LibraryFilter.All)
    private val _searchQuery = MutableStateFlow("")

    val state: StateFlow<LibraryState> = combine(
        repository.getAllJobs(),
        _filter,
        _searchQuery
    ) { jobs, filter, query ->
        val filtered = jobs
            .filter { job ->
                when (filter) {
                    LibraryFilter.All        -> true
                    LibraryFilter.Completed  -> job.status == "completed"
                    LibraryFilter.Processing -> job.status == "processing" || job.status == "queued"
                    LibraryFilter.Failed     -> job.status == "failed"
                }
            }
            .filter { job ->
                query.isBlank() || job.originalFilename.contains(query, ignoreCase = true)
            }
        LibraryState(jobs = filtered, filter = filter, searchQuery = query)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), LibraryState())

    fun setFilter(filter: LibraryFilter) { _filter.value = filter }
    fun setSearchQuery(query: String)    { _searchQuery.value = query }

    fun deleteJob(taskId: String) {
        viewModelScope.launch { repository.deleteJob(taskId) }
    }
}
