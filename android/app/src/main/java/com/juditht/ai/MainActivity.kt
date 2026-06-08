package com.juditht.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.rememberNavController
import com.juditht.ai.ui.auth.AuthViewModel
import com.juditht.ai.ui.navigation.Screen
import com.juditht.ai.ui.navigation.SonicNavGraph
import com.juditht.ai.ui.theme.SonicSplitTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @javax.inject.Inject
    lateinit var jobWatcher: com.juditht.ai.data.repository.SeparationJobWatcher

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }

        jobWatcher.startWatching()

        setContent {
            SonicSplitTheme {
                val navController  = rememberNavController()

                LaunchedEffect(intent) {
                    val taskId = intent?.getStringExtra("taskId")
                    if (!taskId.isNullOrEmpty()) {
                        navController.navigate(Screen.Results.createRoute(taskId))
                    }
                }

                val authViewModel: AuthViewModel = hiltViewModel()
                val authState by authViewModel.state.collectAsStateWithLifecycle()

                val startDestination = if (authState.currentUser != null) {
                    Screen.Library.route
                } else {
                    Screen.Login.route
                }

                if (authState.isNewPremium) {
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = { /* Force them to click OK */ },
                        title = {
                            androidx.compose.material3.Text(
                                "¡Felicidades!", 
                                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                                color = com.juditht.ai.ui.theme.SonicPrimary
                            )
                        },
                        text = {
                            androidx.compose.material3.Text("Tu cuenta ha sido actualizada. ¡Ahora eres Premium y tienes acceso a todas las funcionalidades exclusivas!")
                        },
                        confirmButton = {
                            androidx.compose.material3.TextButton(
                                onClick = {
                                    authViewModel.clearNewPremiumStatus()
                                    // Force reload by navigating to profile if not already there, 
                                    // or just relying on standard compose recomposition.
                                    navController.navigate(Screen.Profile.route) {
                                        popUpTo(Screen.Library.route) { inclusive = false }
                                    }
                                }
                            ) {
                                androidx.compose.material3.Text("Aceptar", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                            }
                        },
                        containerColor = com.juditht.ai.ui.theme.SonicSurfaceContainer,
                        titleContentColor = com.juditht.ai.ui.theme.SonicOnSurface,
                        textContentColor = com.juditht.ai.ui.theme.SonicOnSurfaceVariant
                    )
                }

                SonicNavGraph(
                    navController    = navController,
                    startDestination = startDestination
                )
            }
        }
    }
}
