package com.juditht.ai.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.ListenerRegistration
import com.juditht.ai.data.model.TokenStatus
import com.juditht.ai.data.model.TokenTransaction
import com.juditht.ai.data.repository.ApiResult
import com.juditht.ai.data.repository.TokenRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileState(
    val isLoading: Boolean = false,
    val tokenStatus: TokenStatus? = null,
    val transactions: List<TokenTransaction> = emptyList(),
    val planUpdatedAt: String? = null,
    val billingPeriod: String? = null,
    val error: String? = null
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val tokenRepository: TokenRepository
) : ViewModel() {

    private val auth = FirebaseAuth.getInstance()
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state.asStateFlow()
    private var historyListener: ListenerRegistration? = null

    init {
        refresh()
    }

    fun refresh() {
        val uid = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }

            // Fetch extra subscription info directly from Firestore
            try {
                FirebaseFirestore.getInstance().collection("users").document(uid).get()
                    .addOnSuccessListener { snapshot ->
                        if (snapshot.exists()) {
                            val planUpdatedAt = snapshot.getString("planUpdatedAt")
                            val billingPeriod = snapshot.getString("billingPeriod")
                            _state.update { it.copy(planUpdatedAt = planUpdatedAt, billingPeriod = billingPeriod) }
                        }
                    }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Listen to transaction history in real-time
            historyListener?.remove()
            historyListener = FirebaseFirestore.getInstance()
                .collection("users")
                .document(uid)
                .collection("token_history")
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .addSnapshotListener { snapshot, e ->
                    if (snapshot != null) {
                        val txs = snapshot.documents.mapNotNull { doc ->
                            val amount = doc.getLong("amount")?.toInt() ?: 0
                            val type = doc.getString("type") ?: ""
                            val description = doc.getString("description") ?: ""
                            val timestamp = doc.getTimestamp("timestamp")?.seconds?.times(1000) ?: 0L
                            TokenTransaction(
                                id = doc.id,
                                amount = amount,
                                type = type,
                                description = description,
                                timestamp = timestamp
                            )
                        }
                        _state.update { it.copy(transactions = txs) }
                    }
                }

            when (val result = tokenRepository.getTokenStatus(uid)) {
                is ApiResult.Success -> {
                    _state.update { it.copy(isLoading = false, tokenStatus = result.data) }
                }
                is ApiResult.Error -> {
                    _state.update { it.copy(isLoading = false, error = result.message) }
                }
                else -> {}
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        historyListener?.remove()
    }
}
