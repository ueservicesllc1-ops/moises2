package com.juditht.ai.ui.auth

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.R
import com.juditht.ai.ui.components.*
import com.juditht.ai.ui.theme.*

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showSignUp by remember { mutableStateOf(false) }

    // Google Sign-In launcher
    val googleLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            viewModel.handleGoogleActivityResult(result.data)
        }
    }

    // Navigate on success
    LaunchedEffect(state.currentUser) {
        if (state.currentUser != null) onLoginSuccess()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SonicBackground)
    ) {
        // Ambient gradient mesh
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(SonicPrimary.copy(alpha = 0.05f), Color.Transparent),
                        radius = 800f
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(32.dp))

            // ── Brand logo — mismo logo que la web app (/public/images/logo.png)
            androidx.compose.foundation.Image(
                painter = painterResource(id = R.drawable.logo),
                contentDescription = "Judit Logo",
                modifier = Modifier
                    .height(80.dp)
                    .widthIn(max = 280.dp)
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text  = "The future of studio-grade stem separation.",
                style = MaterialTheme.typography.bodyMedium,
                color = SonicOnSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(40.dp))

            // ── Auth Card ─────────────────────────────────────────────────────
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                AnimatedContent(
                    targetState = showSignUp,
                    transitionSpec = {
                        fadeIn() + slideInHorizontally { if (targetState) it else -it } togetherWith
                        fadeOut() + slideOutHorizontally { if (targetState) -it else it }
                    }
                ) { isSignUp ->
                    if (isSignUp) {
                        SignUpForm(
                            isLoading = state.isLoading,
                            error = state.error,
                            onSignUp = { name, email, pass ->
                                viewModel.signUpWithEmail(name, email, pass)
                            },
                            onSwitchToLogin = { showSignUp = false }
                        )
                    } else {
                        LoginForm(
                            isLoading = state.isLoading,
                            error = state.error,
                            onLogin = { email, pass ->
                                viewModel.signInWithEmail(email, pass)
                            },
                            onGoogleSignIn = {
                                viewModel.signInWithGoogle(context) { intent ->
                                    googleLauncher.launch(intent)
                                }
                            },
                            onSwitchToSignUp = { showSignUp = true }
                        )
                    }
                }
            }

            Spacer(Modifier.height(32.dp))

            // ── Feature pills ──────────────────────────────────────────────────
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FeaturePill(icon = "🎵", title = "Lossless", subtitle = "WAV & FLAC")
                FeaturePill(icon = "⚡", title = "Fast AI", subtitle = "GPU Powered")
            }
        }
    }
}

@Composable
private fun LoginForm(
    isLoading: Boolean,
    error: String?,
    onLogin: (String, String) -> Unit,
    onGoogleSignIn: () -> Unit,
    onSwitchToSignUp: () -> Unit
) {
    var email    by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPass by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Welcome back", style = MaterialTheme.typography.headlineLarge, color = SonicOnSurface)
            Text("Access your studio projects.", style = MaterialTheme.typography.bodyMedium, color = SonicOnSurfaceVariant)
        }

        SonicTextField(
            value = email, onValueChange = { email = it },
            label = "EMAIL ADDRESS", placeholder = "name@studio.com",
            keyboardType = KeyboardType.Email
        )
        SonicTextField(
            value = password, onValueChange = { password = it },
            label = "PASSWORD", placeholder = "••••••••",
            keyboardType = KeyboardType.Password,
            isPassword = true,
            showPassword = showPass,
            onTogglePassword = { showPass = !showPass }
        )

        if (error != null) {
            Text(error, color = SonicError, style = MaterialTheme.typography.bodySmall)
        }

        SonicPrimaryButton(
            text = "Sign In", isLoading = isLoading,
            onClick = { onLogin(email, password) },
            modifier = Modifier.fillMaxWidth()
        )

        // Divider
        Row(verticalAlignment = Alignment.CenterVertically) {
            Divider(modifier = Modifier.weight(1f), color = GlassWhite10)
            Text(" OR CONTINUE WITH ", style = MaterialTheme.typography.labelSmall, color = SonicOnSurfaceVariant)
            Divider(modifier = Modifier.weight(1f), color = GlassWhite10)
        }

        SonicOutlinedButton(
            text = "Google",
            onClick = onGoogleSignIn,
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = { Text("G", style = MaterialTheme.typography.titleLarge, color = SonicPrimary) }
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("New to Judit? ", style = MaterialTheme.typography.bodyMedium, color = SonicOnSurfaceVariant)
            Text(
                "Sign Up",
                style = MaterialTheme.typography.bodyMedium,
                color = SonicPrimary,
                modifier = Modifier.clickable { onSwitchToSignUp() }
            )
        }
    }
}

@Composable
private fun SignUpForm(
    isLoading: Boolean,
    error: String?,
    onSignUp: (String, String, String) -> Unit,
    onSwitchToLogin: () -> Unit
) {
    var name     by remember { mutableStateOf("") }
    var email    by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPass by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Create Account", style = MaterialTheme.typography.headlineLarge, color = SonicOnSurface)
            Text("Start splitting high-fidelity stems for free.", style = MaterialTheme.typography.bodyMedium, color = SonicOnSurfaceVariant)
        }

        SonicTextField(value = name, onValueChange = { name = it }, label = "FULL NAME", placeholder = "John Producer")
        SonicTextField(value = email, onValueChange = { email = it }, label = "EMAIL ADDRESS", placeholder = "name@studio.com", keyboardType = KeyboardType.Email)
        SonicTextField(
            value = password, onValueChange = { password = it },
            label = "CREATE PASSWORD", placeholder = "••••••••",
            keyboardType = KeyboardType.Password, isPassword = true,
            showPassword = showPass, onTogglePassword = { showPass = !showPass }
        )

        if (error != null) {
            Text(error, color = SonicError, style = MaterialTheme.typography.bodySmall)
        }

        SonicPrimaryButton(
            text = "Create Account", isLoading = isLoading,
            onClick = { onSignUp(name, email, password) },
            modifier = Modifier.fillMaxWidth()
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("Already have an account? ", style = MaterialTheme.typography.bodyMedium, color = SonicOnSurfaceVariant)
            Text("Sign In", style = MaterialTheme.typography.bodyMedium, color = SonicPrimary,
                modifier = Modifier.clickable { onSwitchToLogin() })
        }
    }
}

@Composable
private fun SonicTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
    showPassword: Boolean = false,
    onTogglePassword: (() -> Unit)? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel(text = label)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = {
                Text(placeholder, color = SonicOutline, style = MaterialTheme.typography.bodyLarge)
            },
            singleLine = true,
            visualTransformation = if (isPassword && !showPassword) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            trailingIcon = if (isPassword && onTogglePassword != null) {
                {
                    IconButton(onClick = onTogglePassword) {
                        Icon(
                            if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = null,
                            tint = SonicOutline
                        )
                    }
                }
            } else null,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor  = GlassWhite05,
                focusedContainerColor    = GlassWhite08,
                unfocusedBorderColor     = GlassWhite10,
                focusedBorderColor       = SonicPrimary,
                cursorColor              = SonicPrimary,
                focusedTextColor         = SonicOnSurface,
                unfocusedTextColor       = SonicOnSurface,
            )
        )
    }
}

@Composable
private fun FeaturePill(icon: String, title: String, subtitle: String) {
    GlassCard(modifier = Modifier.wrapContentSize(), cornerRadius = 12.dp) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(SonicPrimary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center
            ) {
                Text(icon, fontSize = 20.sp)
            }
            Column {
                Text(title, style = MaterialTheme.typography.labelLarge, color = SonicPrimary)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = SonicOnSurfaceVariant)
            }
        }
    }
}
