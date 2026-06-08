package com.juditht.ai.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.data.model.TokenPlan
import com.juditht.ai.ui.auth.AuthViewModel
import com.juditht.ai.ui.components.*
import com.juditht.ai.ui.theme.*

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Calendar
import java.util.TimeZone

@Composable
fun ProfileScreen(
    onLibraryClick: () -> Unit,
    onUploadClick: () -> Unit,
    onNavigateToPaywall: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val authState by authViewModel.state.collectAsStateWithLifecycle()

    // Trigger redirection on logout
    LaunchedEffect(authState.currentUser) {
        if (authState.currentUser == null) {
            onLoggedOut()
        }
    }

    // Refresh token status whenever screen is viewed
    LaunchedEffect(Unit) {
        viewModel.refresh()
    }

    Scaffold(
        containerColor = SonicBackground,
        topBar = {
            SonicTopBar(title = "Judit")
        },
        bottomBar = {
            SonicBottomNav(
                activeTab = 2,
                onLibraryClick = onLibraryClick,
                onUploadClick = onUploadClick,
                onProfileClick = {}
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(16.dp))

            // ── User Avatar & Identity Card ───────────────────────────────────
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                cornerRadius = 16.dp
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(50))
                            .background(
                                Brush.linearGradient(
                                    listOf(SonicPrimary, SonicSecondary)
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = (authState.currentUser?.displayName?.take(1) ?: authState.currentUser?.email?.take(1) ?: "U").uppercase(),
                            color = Color.White,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(Modifier.height(14.dp))

                    Text(
                        text = authState.currentUser?.displayName ?: "Usuario de Judit",
                        style = MaterialTheme.typography.titleLarge,
                        color = SonicOnSurface
                    )

                    Spacer(Modifier.height(2.dp))

                    Text(
                        text = authState.currentUser?.email ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = SonicOnSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── Token Status & Plan Details Card ──────────────────────────────
            val tokenStatus = state.tokenStatus
            val plan = tokenStatus?.plan ?: TokenPlan.FREE

            SectionLabel(
                text = "Tu Plan y Tokens",
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
            )

            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                cornerRadius = 16.dp
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    // Plan Header (Badge + Emoji)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(plan.emoji, fontSize = 24.sp)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = plan.displayName,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = SonicPrimary
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(50),
                            color = SonicPrimary.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = if (plan == TokenPlan.FREE) "Gratuito" else "$${plan.priceMonthly}/mes",
                                style = MaterialTheme.typography.labelLarge,
                                color = SonicPrimary,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Text(
                        text = plan.tagline,
                        style = MaterialTheme.typography.bodyMedium,
                        color = SonicOnSurfaceVariant
                    )

                    Spacer(Modifier.height(16.dp))
                    HorizontalDivider(color = GlassWhite10)
                    Spacer(Modifier.height(16.dp))

                    // Token Balance
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Tokens Disponibles",
                                style = MaterialTheme.typography.bodyMedium,
                                color = SonicOnSurfaceVariant
                            )
                            Text(
                                text = if (plan == TokenPlan.FREE) "0 tokens" else "${tokenStatus?.tokenBalance ?: 0} / ${plan.tokensMonthly}",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = SonicOnSurface
                            )
                        }

                        // Glow indicator
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(SonicPrimary.copy(alpha = 0.1f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.OfflineBolt,
                                contentDescription = null,
                                tint = SonicPrimary,
                                modifier = Modifier.size(28.dp)
                            )
                        }
                    }

                    // For Free users, show free separation status
                    if (plan == TokenPlan.FREE) {
                        Spacer(Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (tokenStatus?.freeSeparationUsed == true) SonicError.copy(alpha = 0.12f) else SonicTertiary.copy(alpha = 0.12f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = if (tokenStatus?.freeSeparationUsed == true) Icons.Default.Info else Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = if (tokenStatus?.freeSeparationUsed == true) SonicError else SonicTertiary,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = if (tokenStatus?.freeSeparationUsed == true) "Separación gratuita ya utilizada. Límite de 40s activo." else "Tienes 1 separación de audio gratuita disponible.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (tokenStatus?.freeSeparationUsed == true) SonicError else SonicTertiary
                                )
                            }
                        }
                    } else {
                        // For paying users, show approximate equivalent songs
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Equivale aproximadamente a ${plan.songsApprox} (~${plan.minutesMonthly} min)",
                            style = MaterialTheme.typography.bodySmall,
                            color = SonicOutline
                        )

                        val renewalDate = getRenewalDateText(state.planUpdatedAt, state.billingPeriod)
                        if (renewalDate.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Próxima renovación: $renewalDate",
                                style = MaterialTheme.typography.bodySmall,
                                color = SonicTertiary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    // Upgrade CTA Button (Only if not on ULTRA)
                    if (plan != TokenPlan.ULTRA) {
                        Spacer(Modifier.height(20.dp))
                        SonicPrimaryButton(
                            text = if (plan == TokenPlan.FREE) "⚡ Obtener Premium" else "🚀 Mejorar Plan",
                            onClick = onNavigateToPaywall,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            if (state.transactions.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                SectionLabel(
                    text = "Historial de Tokens",
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                )

                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    cornerRadius = 16.dp
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        state.transactions.forEach { tx ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = tx.description,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = SonicOnSurface
                                    )
                                    val sdf = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())
                                    Text(
                                        text = sdf.format(Date(tx.timestamp)),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = SonicOutline
                                    )
                                }

                                val amountText = if (tx.amount > 0) "+${tx.amount}" else "${tx.amount}"
                                val amountColor = if (tx.amount > 0) SonicTertiary else SonicError

                                Text(
                                    text = amountText,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = amountColor,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            if (tx != state.transactions.last()) {
                                HorizontalDivider(color = GlassWhite10, modifier = Modifier.padding(vertical = 4.dp))
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // ── Log Out Button ────────────────────────────────────────────────
            Button(
                onClick = { authViewModel.signOut() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = SonicSurfaceContainerHigh,
                    contentColor = SonicError
                ),
                border = androidx.compose.foundation.BorderStroke(1.dp, SonicError.copy(alpha = 0.3f))
            ) {
                Icon(
                    imageVector = Icons.Default.Logout,
                    contentDescription = "Log Out",
                    tint = SonicError,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Cerrar Sesión",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

fun getRenewalDateText(planUpdatedAtIso: String?, billingPeriod: String?): String {
    if (planUpdatedAtIso.isNullOrEmpty()) return ""
    return try {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val date = format.parse(planUpdatedAtIso) ?: return ""
        val cal = Calendar.getInstance().apply {
            time = date
        }

        if (billingPeriod == "yearly") {
            cal.add(Calendar.YEAR, 1)
        } else {
            cal.add(Calendar.MONTH, 1)
        }

        val displayFormat = SimpleDateFormat("dd 'de' MMMM, yyyy", Locale("es", "ES"))
        displayFormat.format(cal.time)
    } catch (e: Exception) {
        try {
            val formatFallback = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val date = formatFallback.parse(planUpdatedAtIso) ?: return ""
            val cal = Calendar.getInstance().apply {
                time = date
            }
            if (billingPeriod == "yearly") {
                cal.add(Calendar.YEAR, 1)
            } else {
                cal.add(Calendar.MONTH, 1)
            }
            val displayFormat = SimpleDateFormat("dd 'de' MMMM, yyyy", Locale("es", "ES"))
            displayFormat.format(cal.time)
        } catch (ex: Exception) {
            ""
        }
    }
}
