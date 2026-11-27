package ph.pusoy13.game

import android.app.Application
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.ui.ArtStore

class PusoyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ArtStore.init(this)
        Session.init(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) = Session.appResumed()
            override fun onStop(owner: LifecycleOwner) = Session.appPaused()
        })
    }
}

/**
 * The only activity: landscape, full screen (immersive), drawing the Compose app. Android's back
 * button goes back one screen; screens that must confirm first (the game tables) intercept it.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        immersive()
        setContent {
            // Composed first, so a screen's own BackHandler (composed later) takes priority.
            BackHandler(enabled = Nav.stack.size > 1) { Nav.back() }
            PusoyRoot()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    private fun immersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
