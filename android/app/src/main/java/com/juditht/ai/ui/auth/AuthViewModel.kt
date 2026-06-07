package com.juditht.ai.ui.auth

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

data class AuthState(
    val isLoading: Boolean = false,
    val currentUser: FirebaseUser? = null,
    val error: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor() : ViewModel() {

    private val auth = FirebaseAuth.getInstance()

    private val _state = MutableStateFlow(AuthState(currentUser = auth.currentUser))
    val state: StateFlow<AuthState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                auth.currentUser?.reload()?.await()
                _state.value = _state.value.copy(currentUser = auth.currentUser)
            } catch (e: Exception) {
                // Ignore network issues
            }
        }
    }

    val isLoggedIn: Boolean get() = auth.currentUser != null
    val currentUserId: String get() = auth.currentUser?.uid ?: ""

    fun signInWithEmail(email: String, password: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                auth.signInWithEmailAndPassword(email, password).await()
                _state.value = AuthState(currentUser = auth.currentUser)
            } catch (e: Exception) {
                _state.value = AuthState(error = e.message ?: "Sign in failed")
            }
        }
    }

    fun signUpWithEmail(name: String, email: String, password: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                auth.createUserWithEmailAndPassword(email, password).await()
                auth.currentUser?.updateProfile(
                    com.google.firebase.auth.userProfileChangeRequest { displayName = name }
                )?.await()
                _state.value = AuthState(currentUser = auth.currentUser)
            } catch (e: Exception) {
                _state.value = AuthState(error = e.message ?: "Sign up failed")
            }
        }
    }

    fun signInWithGoogle(context: Context, onIntent: (Intent) -> Unit) {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            // Use the Web client ID (type 3) as requestIdToken — this is correct for Firebase Auth
            .requestIdToken("987812763731-ve9mp5squndupmphqk7kqb2ur3ou7are.apps.googleusercontent.com")
            .requestEmail()
            .build()
        val client = GoogleSignIn.getClient(context, gso)
        onIntent(client.signInIntent)
    }

    fun handleGoogleSignInResult(idToken: String?) {
        if (idToken == null) {
            _state.value = AuthState(error = "Google Sign-In cancelled")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val credential = GoogleAuthProvider.getCredential(idToken, null)
                auth.signInWithCredential(credential).await()
                _state.value = AuthState(currentUser = auth.currentUser)
            } catch (e: Exception) {
                _state.value = AuthState(error = e.message ?: "Google sign in failed")
            }
        }
    }

    fun handleGoogleActivityResult(data: Intent?) {
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            handleGoogleSignInResult(account.idToken)
        } catch (e: ApiException) {
            _state.value = AuthState(error = "Google Sign-In error: ${e.statusCode}")
        }
    }

    fun signOut() {
        auth.signOut()
        _state.value = AuthState()
    }
}
