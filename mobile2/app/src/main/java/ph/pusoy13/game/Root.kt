package ph.pusoy13.game

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.screens.HistoryScreen
import ph.pusoy13.game.screens.HomeScreen
import ph.pusoy13.game.screens.LobbyScreen
import ph.pusoy13.game.screens.LoginScreen
import ph.pusoy13.game.screens.NotificationsScreen
import ph.pusoy13.game.screens.OnboardingScreen
import ph.pusoy13.game.screens.PlayScreen
import ph.pusoy13.game.screens.PracticeScreen
import ph.pusoy13.game.screens.RegisterScreen
import ph.pusoy13.game.screens.RoomScreen
import ph.pusoy13.game.screens.SplashScreen
import ph.pusoy13.game.screens.WalletScreen
import ph.pusoy13.game.ui.AssetImage
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.MotionClock
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.u

/** The app: the current screen, with the maintenance screen and the "signed in elsewhere" popup over it. */
@Composable
fun PusoyRoot() {
    val maintenance by Session.maintenance.collectAsState()
    val disconnected by Session.disconnected.collectAsState()
    MotionClock {
        Box(Modifier.fillMaxSize().background(C.Night).imePadding()) {
            val route = Nav.top
            key(route) {
                when (route) {
                    Route.Splash -> SplashScreen()
                    Route.Onboarding -> OnboardingScreen()
                    Route.Login -> LoginScreen()
                    Route.Register -> RegisterScreen()
                    is Route.Home -> HomeScreen(route)
                    Route.Lobby -> LobbyScreen()
                    is Route.Room -> RoomScreen(route.id)
                    is Route.Play -> PlayScreen(route.tableId)
                    is Route.Practice -> PracticeScreen(route)
                    Route.Wallet -> WalletScreen()
                    Route.History -> HistoryScreen()
                    Route.Notifications -> NotificationsScreen()
                }
            }
            // Admin Panel maintenance (Full / Mobile Game): the maintenance screen replaces the game.
            if (maintenance?.gameBlocked == true) MaintenanceScreen(maintenance!!.label)
            disconnected?.let { (title, message) -> Disconnected(title, message) }
        }
    }
}

@Composable
private fun MaintenanceScreen(label: String) {
    Stage(background = { AssetImage("maintenance.webp", Modifier.fillMaxSize(), cover = true) }) {
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 40.u).background(Color(0xB3000000)).padding(horizontal = 40.u, vertical = 18.u), horizontalAlignment = Alignment.CenterHorizontally) {
            Txt(label.ifBlank { "Under maintenance" }, 40, color = C.Gold, align = TextAlign.Center)
            Txt("The game is being updated. Please come back shortly.", 24, align = TextAlign.Center)
        }
    }
}

/** One active login per player: every session of this account was signed out. */
@Composable
private fun Disconnected(title: String, message: String) {
    val scope = rememberCoroutineScope()
    Stage {
        Modal(title, null, width = 820) {
            Txt(message.ifBlank { "Your account was signed in on another device." }, 26, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Box(Modifier.height(24.u))
            CandyButton("OK", Modifier.size(300.u, 80.u)) {
                Session.disconnected.value = null
                scope.launch { Session.logout() }
            }
        }
    }
}
