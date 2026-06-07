package com.juditht.ai.ui.paywall

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.juditht.ai.data.api.SonicSplitApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PaywallState(
    val billingPeriod: String = "monthly", // "monthly" or "yearly"
    val isCreatingSession: Boolean = false,
    val checkoutUrl: String? = null,
    val error: String? = null
)

@HiltViewModel
class PaywallViewModel @Inject constructor(
    private val api: SonicSplitApiService
) : ViewModel() {

    private val _state = MutableStateFlow(PaywallState())
    val state: StateFlow<PaywallState> = _state.asStateFlow()

    fun setBillingPeriod(period: String) {
        _state.update { it.copy(billingPeriod = period) }
    }

    fun initiateCheckout(plan: String, uid: String, email: String) {
        viewModelScope.launch {
            _state.update { it.copy(isCreatingSession = true, error = null, checkoutUrl = null) }
            try {
                val payload = mapOf(
                    "plan" to plan,
                    "billing" to _state.value.billingPeriod,
                    "uid" to uid,
                    "email" to email
                )
                val response = api.createCheckoutSession(payload)
                if (response.isSuccessful && response.body() != null) {
                    val url = response.body()!!["url"]
                    if (url != null) {
                        _state.update { it.copy(isCreatingSession = false, checkoutUrl = url) }
                    } else {
                        _state.update { it.copy(isCreatingSession = false, error = "Falta la URL de pago") }
                    }
                } else {
                    val errorMsg = response.errorBody()?.string() ?: "Error de red en Stripe"
                    _state.update { it.copy(isCreatingSession = false, error = errorMsg) }
                }
            } catch (e: Exception) {
                _state.update { it.copy(isCreatingSession = false, error = e.message ?: "Error desconocido") }
            }
        }
    }

    fun clearCheckoutUrl() {
        _state.update { it.copy(checkoutUrl = null) }
    }
}
