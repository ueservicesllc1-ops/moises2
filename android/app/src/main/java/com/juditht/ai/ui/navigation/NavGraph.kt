package com.juditht.ai.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.juditht.ai.ui.auth.LoginScreen
import com.juditht.ai.ui.library.LibraryScreen
import com.juditht.ai.ui.results.ResultsScreen
import com.juditht.ai.ui.upload.UploadScreen

sealed class Screen(val route: String) {
    object Login   : Screen("login")
    object Library : Screen("library")
    object Upload  : Screen("upload")
    object Results : Screen("results/{taskId}") {
        fun createRoute(taskId: String) = "results/$taskId"
    }
    object Paywall : Screen("paywall?reason={reason}") {
        fun createRoute(reason: String?) = if (reason != null) "paywall?reason=$reason" else "paywall"
    }
    object Profile : Screen("profile")
}

@Composable
fun SonicNavGraph(
    navController: NavHostController,
    startDestination: String
) {
    NavHost(navController = navController, startDestination = startDestination) {

        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Library.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Library.route) {
            LibraryScreen(
                onUploadClick = { navController.navigate(Screen.Upload.route) },
                onProfileClick = { navController.navigate(Screen.Profile.route) },
                onJobClick = { taskId ->
                    navController.navigate(Screen.Results.createRoute(taskId))
                }
            )
        }

        composable(Screen.Upload.route) {
            UploadScreen(
                onBack = { navController.popBackStack() },
                onLibraryClick = { 
                    navController.navigate(Screen.Library.route) {
                        popUpTo(Screen.Library.route) { inclusive = false }
                    }
                },
                onProfileClick = { navController.navigate(Screen.Profile.route) },
                onJobStarted = { taskId ->
                    navController.navigate(Screen.Results.createRoute(taskId)) {
                        popUpTo(Screen.Upload.route) { inclusive = true }
                    }
                },
                onNavigateToPaywall = { reason ->
                    navController.navigate(Screen.Paywall.createRoute(reason))
                }
            )
        }

        composable(
            route = Screen.Results.route,
            arguments = listOf(navArgument("taskId") { type = NavType.StringType })
        ) { backStackEntry ->
            val taskId = backStackEntry.arguments?.getString("taskId") ?: ""
            ResultsScreen(
                taskId = taskId,
                onBack = { navController.popBackStack() },
                onNavigateToPaywall = {
                    navController.navigate(Screen.Paywall.createRoute("free_exhausted"))
                }
            )
        }

        composable(
            route = Screen.Paywall.route,
            arguments = listOf(navArgument("reason") { 
                type = NavType.StringType
                nullable = true
                defaultValue = null
            })
        ) { backStackEntry ->
            val reason = backStackEntry.arguments?.getString("reason")
            com.juditht.ai.ui.paywall.PaywallScreen(
                reason = reason,
                onBack = { navController.popBackStack() }
            )
        }
        composable(Screen.Profile.route) {
            com.juditht.ai.ui.profile.ProfileScreen(
                onLibraryClick = {
                    navController.navigate(Screen.Library.route) {
                        popUpTo(Screen.Library.route) { inclusive = false }
                    }
                },
                onUploadClick = {
                    navController.navigate(Screen.Upload.route)
                },
                onNavigateToPaywall = {
                    navController.navigate(Screen.Paywall.createRoute("upgrade"))
                },
                onLoggedOut = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
