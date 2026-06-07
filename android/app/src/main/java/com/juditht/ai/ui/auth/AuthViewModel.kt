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
    val error: String? = null,
    val isNewPremium: Boolean = false
)

@HiltViewModel
class AuthViewModel @Inject constructor() : ViewModel() {

    private val auth = FirebaseAuth.getInstance()
    private val firestore = com.google.firebase.firestore.FirebaseFirestore.getInstance()

    private val _state = MutableStateFlow(AuthState(currentUser = auth.currentUser))
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private var tokenListener: com.google.firebase.firestore.ListenerRegistration? = null
    private var lastKnownPlanId: String? = null

    init {
        auth.addAuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            _state.value = _state.value.copy(currentUser = user)
            setupFirestoreListener(user?.uid)
        }
        
        viewModelScope.launch {
            try {
                auth.currentUser?.reload()?.await()
            } catch (e: Exception) {
                // Ignore network issues
            }
        }
    }

    private fun setupFirestoreListener(uid: String?) {
        tokenListener?.remove()
        tokenListener = null
        if (uid == null) {
            lastKnownPlanId = null
            return
        }

        val docRef = firestore.collection("users").document(uid)
        
        // Ensure user is tagged as android
        docRef.get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) {
                val email = auth.currentUser?.email ?: ""
                val displayName = auth.currentUser?.displayName ?: email.substringBefore("@")
                docRef.set(hashMapOf(
                    "email" to email,
                    "displayName" to displayName,
                    "planId" to "free",
                    "isPremium" to false,
                    "tokenBalance" to 0,
                    "freeSeparationUsed" to false,
                    "platform" to "android",
                    "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                ))
            } else if (snapshot.getString("platform") == null || snapshot.getString("platform") != "android") {
                docRef.update("platform", "android")
            }
        }

        tokenListener = docRef.addSnapshotListener { snapshot, error ->
            if (error != null) return@addSnapshotListener
            if (snapshot != null && snapshot.exists()) {
                val planId = snapshot.getString("planId") ?: "free"
                
                if (lastKnownPlanId != null && 
                    (lastKnownPlanId == "free" || lastKnownPlanId == "starter") && 
                    (planId != "free" && planId != "starter")) {
                    // User just upgraded to premium!
                    _state.value = _state.value.copy(isNewPremium = true)
                }
                lastKnownPlanId = planId
            }
        }
    }

    fun clearNewPremiumStatus() {
        _state.value = _state.value.copy(isNewPremium = false)
    }

    override fun onCleared() {
        super.onCleared()
        tokenListener?.remove()
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
