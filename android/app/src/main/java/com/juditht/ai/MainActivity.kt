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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SonicSplitTheme {
                val navController  = rememberNavController()
                val authViewModel: AuthViewModel = hiltViewModel()
                val authState by authViewModel.state.collectAsStateWithLifecycle()

                val startDestination = if (authState.currentUser != null) {
                    Screen.Library.route
                } else {
                    Screen.Login.route
                }

                SonicNavGraph(
                    navController    = navController,
                    startDestination = startDestination
                )
            }
        }
    }
}
