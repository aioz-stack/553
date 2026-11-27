package ph.pusoy13.game.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Screens of the app (the /mobile routes). */
sealed class Route {
    data object Splash : Route()
    data object Onboarding : Route()
    data object Login : Route()
    data object Register : Route()
    /** Home; `goldOut` opens the Out of Gold popup, `picker` the Single Player difficulty picker. */
    data class Home(val goldOut: Boolean = false, val picker: Boolean = false) : Route()
    data object Lobby : Route()
    data class Room(val id: Int) : Route()
    data class Play(val tableId: Int) : Route()
    data class Practice(val tier: String, val bet: Int?) : Route()
    data object Wallet : Route()
    data object History : Route()
    data object Notifications : Route()
}

/** A screen stack: `go` pushes, `replace` swaps the top, `reset` starts over. */
object Nav {
    val stack = mutableStateListOf<Route>(Route.Splash)
    val top: Route get() = stack.last()

    fun go(r: Route) {
        stack.add(r)
    }

    fun replace(r: Route) {
        if (stack.isEmpty()) stack.add(r) else stack[stack.lastIndex] = r
    }

    fun reset(r: Route) {
        stack.clear()
        stack.add(r)
    }

    /** Back: false when there is nowhere to go (the activity then closes). */
    fun back(): Boolean {
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }
}

data class Balances(val chips: Double?, val gold: Double?, val keys: Double?)

/**
 * App-wide state: the signed-in player, their three wallets (Chips, Gold, Keys — never combined),
 * maintenance and "account connected elsewhere" notices, app resume / network signals.
 */
object Session {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    val user = MutableStateFlow<User?>(null)
    val ready = MutableStateFlow(false)
    val balances = MutableStateFlow(Balances(null, null, null))
    val gold = MutableStateFlow<GoldWallet?>(null)
    val maintenance = MutableStateFlow<Maintenance?>(null)
    val disconnected = MutableStateFlow<Pair<String, String>?>(null)
    val online = MutableStateFlow(true)
    val motion = mutableStateOf("high")

    private val _resumed = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    /** The app came back to the foreground or the network returned: re-check the server. */
    val resumed: SharedFlow<Unit> = _resumed
    private val _walletChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val walletChanged: SharedFlow<Unit> = _walletChanged

    private var walletHandle: Echo.Handle? = null
    private var maintenanceHandle: Echo.Handle? = null
    private var maintenanceJob: Job? = null

    fun init(context: Context) {
        Store.init(context)
        Sound.init()
        motion.value = Store.get("pusoy.motion") ?: "high"
        Api.loadToken()
        Api.onUnauthorized = { scope.launch { signedOut() } }
        Api.onDisconnected = { title, message -> scope.launch { disconnected.value = title to message } }
        Api.onMaintenance = { m -> scope.launch { maintenance.value = m?.let(Maintenance::of) ?: Maintenance("full", "Maintenance", true) } }
        watchNetwork(context)
        startMaintenanceWatch()
        scope.launch {
            refresh()
            ready.value = true
        }
    }

    fun appResumed() {
        Echo.wake()
        _resumed.tryEmit(Unit)
        reloadWallets()
        if (Sound.musicOn && user.value != null) Sound.Music.start()
    }

    fun appPaused() {
        Sound.Music.stop()
    }

    suspend fun refresh() {
        if (Api.token == null) {
            user.value = null
            return
        }
        try {
            setUser(User.of(Api.get("/auth/me").data()))
        } catch (e: ApiException) {
            if (e.status == 401) user.value = null
        }
    }

    private fun setUser(u: User?) {
        val before = user.value?.id
        user.value = u
        u?.prefs?.let(::applyPrefs)
        if (u != null && u.id != before) {
            walletHandle?.remove()
            walletHandle = Echo.listen(Echo.private("user.${u.id}"), "wallet.updated") { _, d ->
                val c = d?.optString("currency") ?: return@listen
                val b = d.optString("balance").toDoubleOrNull() ?: return@listen
                balances.value = when (c) {
                    "CH" -> balances.value.copy(chips = b)
                    "KY" -> balances.value.copy(keys = b)
                    "GD" -> balances.value.copy(gold = b).also { reloadGold() }
                    else -> balances.value
                }
            }
            reloadWallets()
            if (Sound.musicOn) Sound.Music.start()
        }
    }

    private fun applyPrefs(p: GamePrefs) {
        if (p.bgm != Sound.musicOn) Sound.setMusic(p.bgm)
        if (p.sfx != Sound.sfxOn) Sound.setSfx(p.sfx)
        if (p.motionChosen && p.motion in listOf("low", "medium", "high")) setMotion(p.motion)
    }

    fun setMotion(level: String) {
        motion.value = level
        Store.set("pusoy.motion", level)
    }

    /** Change some settings: applied at once, then saved with the account (best effort offline). */
    fun savePrefs(bgm: Boolean? = null, sfx: Boolean? = null, motionLevel: String? = null) {
        bgm?.let(Sound::setMusic)
        sfx?.let(Sound::setSfx)
        motionLevel?.let(::setMotion)
        scope.launch {
            runCatching {
                Api.put("/profile/preferences", Api.body(*listOfNotNull(bgm?.let { "bgm" to it }, sfx?.let { "sfx" to it }, motionLevel?.let { "motion" to it }).toTypedArray()))
            }
        }
    }

    suspend fun login(username: String, password: String) {
        val d = Api.post("/auth/login", Api.body("username" to username, "password" to password, "device_name" to "Pusoy 13 android", "platform" to "android")).data()
        Api.setToken(d.text("token"))
        disconnected.value = null
        setUser(User.of(d.obj("user")!!))
    }

    /** Registers a PENDING account (no sign-in until an administrator approves it); returns the server message. */
    suspend fun register(form: Map<String, String>): String {
        val r = Api.post("/auth/register", Api.body(*(form + mapOf("device_name" to "Pusoy 13 android", "platform" to "android")).map { it.key to it.value }.toTypedArray()))
        return r.text("message", "Registration received.")
    }

    suspend fun logout() {
        runCatching { Api.post("/auth/logout") }
        signedOut()
    }

    private fun signedOut() {
        Api.setToken(null)
        walletHandle?.remove()
        walletHandle = null
        Echo.reset()
        user.value = null
        balances.value = Balances(null, null, null)
        gold.value = null
        Sound.Music.stop()
        startMaintenanceWatch()
        Nav.reset(Route.Login)
    }

    /** Tell every balance display to reload (Gold or Chips changed). */
    fun walletChanged() {
        reloadWallets()
        _walletChanged.tryEmit(Unit)
    }

    fun reloadWallets() {
        if (user.value == null) return
        scope.launch {
            runCatching {
                val ws = Api.get("/wallet").dataList().map(Wallet::of).filter { it.type == "player" }
                balances.value = Balances(ws.find { it.currency == "CH" }?.balance, ws.find { it.currency == "GD" }?.balance, ws.find { it.currency == "KY" }?.balance)
            }
        }
        reloadGold()
    }

    fun reloadGold() {
        if (user.value == null) return
        scope.launch { runCatching { gold.value = GoldWallet.of(Api.get("/practice/gold").data()) } }
    }

    /** Admin Panel maintenance: GET /status now and every 30 s, plus the public `maintenance` channel. */
    private fun startMaintenanceWatch() {
        maintenanceHandle?.remove()
        maintenanceHandle = Echo.listen("maintenance", "*") { _, _ -> scope.launch { checkMaintenance() } }
        maintenanceJob?.cancel()
        maintenanceJob = scope.launch {
            while (isActive) {
                checkMaintenance()
                delay(30_000)
            }
        }
    }

    suspend fun checkMaintenance() {
        runCatching { maintenance.value = Maintenance.of(Api.get("/status").data()) }
    }

    private fun watchNetwork(context: Context) {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return
        online.value = cm.activeNetwork != null
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val was = online.value
                online.value = true
                if (!was) scope.launch { appResumed() }
            }

            override fun onLost(network: Network) {
                scope.launch { online.value = cm.activeNetwork != null }
            }
        }
        if (Build.VERSION.SDK_INT >= 24) runCatching { cm.registerDefaultNetworkCallback(cb) }
    }
}
