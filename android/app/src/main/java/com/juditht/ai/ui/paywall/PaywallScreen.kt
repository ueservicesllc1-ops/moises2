package com.juditht.ai.ui.paywall

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.juditht.ai.ui.auth.AuthViewModel
import com.juditht.ai.ui.components.GlassCard
import com.juditht.ai.ui.components.SonicPrimaryButton
import com.juditht.ai.ui.components.SonicTopBar
import com.juditht.ai.ui.theme.*

data class PlanCardInfo(
    val id: String,
    val name: String,
    val priceMonthly: Double,
    val priceYearly: Double,
    val tokens: String,
    val time: String,
    val color: Color,
    val popular: Boolean = false,
    val features: List<String>
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    reason: String?,
    onBack: () -> Unit,
    viewModel: PaywallViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    // Manejar redirección a Stripe Checkout
    LaunchedEffect(state.checkoutUrl) {
        state.checkoutUrl?.let { url ->
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            context.startActivity(intent)
            viewModel.clearCheckoutUrl()
        }
    }

    val plans = remember {
        listOf(
            PlanCardInfo(
                id = "lite",
                name = "Lite",
                priceMonthly = 1.99,
                priceYearly = 19.90,
                tokens = "1,000",
                time = "~30 min",
                color = Color(0xFF3B82F6),
                features = listOf(
                    "1,000 tokens mensuales",
                    "Separación de ~30 min",
                    "Aproximadamente 6-8 canciones",
                    "Acceso completo a stems sin límites",
                    "Procesamiento rápido de colas"
                )
            ),
            PlanCardInfo(
                id = "pro",
                name = "Pro",
                priceMonthly = 4.99,
                priceYearly = 49.90,
                tokens = "6,000",
                time = "~3 horas",
                color = Color(0xFFA855F7),
                popular = true,
                features = listOf(
                    "6,000 tokens mensuales",
                    "Separación de ~3 horas",
                    "Aproximadamente 40-50 canciones",
                    "Prioridad de procesamiento Pro",
                    "Motor neuronal HiFi (24-bit MDX-Net)"
                )
            ),
            PlanCardInfo(
                id = "ultra",
                name = "Ultra",
                priceMonthly = 9.99,
                priceYearly = 99.90,
                tokens = "20,000",
                time = "~10 horas",
                color = Color(0xFFF59E0B),
                features = listOf(
                    "20,000 tokens mensuales",
                    "Separación de ~10 horas",
                    "Colas de máxima prioridad",
                    "Todas las funciones Premium ilimitadas",
                    "Soporte prioritario 24/7"
                )
            )
        )
    }

    Scaffold(
        containerColor = SonicBackground,
        topBar = {
            SonicTopBar(title = "Judit", onBack = onBack)
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Spacer(Modifier.height(10.dp))

            // Warning Banner for free limit reached
            if (reason == "free_exhausted") {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = SonicError.copy(alpha = 0.15f),
                    border = BorderStroke(1.dp, SonicError.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            tint = SonicError,
                            modifier = Modifier.size(24.dp)
                        )
                        Column {
                            Text(
                                "Separación Gratis Agotada",
                                style = MaterialTheme.typography.titleMedium,
                                color = SonicError,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "Actualiza a un plan Premium para seguir separando más canciones.",
                                style = MaterialTheme.typography.bodySmall,
                                color = SonicOnSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Title section
            Text(
                text = "Lleva tu música al siguiente nivel",
                style = MaterialTheme.typography.headlineMedium,
                color = SonicOnSurface,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Text(
                text = "Elige el plan ideal para tu ritmo de producción musical. Cancela en cualquier momento.",
                style = MaterialTheme.typography.bodyMedium,
                color = SonicOnSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 20.dp)
            )

            // Billing Period Toggle
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(25.dp))
                    .background(GlassWhite03)
                    .border(1.dp, GlassWhite10, RoundedCornerShape(25.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                listOf("monthly" to "Mensual", "yearly" to "Anual (-15%)").forEach { (period, label) ->
                    val active = state.billingPeriod == period
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (active) SonicPrimaryContainer else Color.Transparent)
                            .clickable { viewModel.setBillingPeriod(period) }
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (active) SonicOnPrimaryContainer else SonicOnSurfaceVariant,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Cards Grid (Column Layout for Mobile)
            plans.forEach { plan ->
                val price = if (state.billingPeriod == "monthly") plan.priceMonthly else plan.priceYearly
                val priceLabel = if (state.billingPeriod == "monthly") "/mes" else "/año"
                val isPopular = plan.popular

                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            width = if (isPopular) 1.5.dp else 0.dp,
                            brush = if (isPopular) Brush.linearGradient(listOf(SonicPrimary, SonicTertiary)) else SolidColor(Color.Transparent),
                            shape = RoundedCornerShape(16.dp)
                        )
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Title + Badge
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = plan.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = SonicOnSurface,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${plan.tokens} tokens",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = plan.color,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            if (isPopular) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(SonicPrimary.copy(alpha = 0.2f))
                                        .border(1.dp, SonicPrimary, RoundedCornerShape(8.dp))
                                        .padding(horizontal = 10.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        "RECOMENDADO",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = SonicPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        // Price
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                text = "$${String.format("%.2f", price)}",
                                style = MaterialTheme.typography.displaySmall.copy(fontSize = 32.sp),
                                color = SonicOnSurface,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Text(
                                text = priceLabel,
                                style = MaterialTheme.typography.bodyMedium,
                                color = SonicOnSurfaceVariant,
                                modifier = Modifier.padding(bottom = 4.dp, start = 4.dp)
                            )
                            Spacer(Modifier.weight(1f))
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = plan.color.copy(alpha = 0.15f),
                                border = BorderStroke(1.dp, plan.color.copy(alpha = 0.3f))
                            ) {
                                Text(
                                    text = plan.time,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = plan.color,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Divider(color = GlassWhite10)

                        // Features list
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            plan.features.forEach { feature ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text("✓", color = SonicTertiary, fontWeight = FontWeight.Bold)
                                    Text(
                                        text = feature,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = SonicOnSurface
                                    )
                                }
                            }
                        }

                        // Button
                        val user = authState.currentUser
                        SonicPrimaryButton(
                            text = if (state.isCreatingSession) "Procesando..." else "Adquirir Plan ${plan.name}",
                            isLoading = state.isCreatingSession,
                            onClick = {
                                if (user != null) {
                                    viewModel.initiateCheckout(plan.id, user.uid, user.email ?: "")
                                } else {
                                    // User not logged in, error out or back to login
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            if (state.error != null) {
                Text(
                    text = state.error!!,
                    color = SonicError,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}
