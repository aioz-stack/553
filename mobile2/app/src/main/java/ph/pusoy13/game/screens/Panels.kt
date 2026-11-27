package ph.pusoy13.game.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.FriendsData
import ph.pusoy13.game.core.GoldWallet
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.PracticeTier
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.ShopPack
import ph.pusoy13.game.core.ShopState
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.dataList
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.idempotencyKey
import ph.pusoy13.game.core.instant
import ph.pusoy13.game.core.text
import ph.pusoy13.game.core.whenText
import ph.pusoy13.game.ui.AVATAR_IDS
import ph.pusoy13.game.ui.AVATAR_NAMES
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.Divider
import ph.pusoy13.game.ui.Field
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.GoldIcon
import ph.pusoy13.game.ui.KeyIcon
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.Toggle
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.avatarFor
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

// ------------------------------------------------------------------ Settings

/** Settings: audio (BGM, sound effects), motion quality, change password, account pages. */
@Composable
fun SettingsPanel(onClose: () -> Unit) {
    var bgm by remember { mutableStateOf(ph.pusoy13.game.core.Sound.musicOn) }
    var sfx by remember { mutableStateOf(Sound.sfxOn) }
    val motion = Session.motion.value
    val current = remember { mutableStateOf("") }
    val next = remember { mutableStateOf("") }
    val confirm = remember { mutableStateOf("") }
    var note by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Modal("Settings", onClose, width = 1060) {
        Section("AUDIO SETTINGS")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                Txt("Background Music", 28)
                Toggle(bgm, "Background music") { bgm = !bgm; Session.savePrefs(bgm = bgm) }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                Txt("Sound Effects", 28)
                Toggle(sfx, "Sound effects") { sfx = !sfx; Session.savePrefs(sfx = sfx) }
            }
        }
        Section("MOTION EFFECTS")
        Txt("Graphics and animation quality for a smoother gaming experience.", 21, color = C.White.copy(alpha = 0.75f), align = TextAlign.Center)
        Row(Modifier.fillMaxWidth().padding(top = 10.u), horizontalArrangement = Arrangement.spacedBy(16.u)) {
            listOf("low" to "Low", "medium" to "Medium", "high" to "High").forEach { (v, label) ->
                CandyButton(label, Modifier.weight(1f).height(70.u), if (motion == v) Tone.Gold else Tone.Dark, size = 28) { Session.savePrefs(motionLevel = v) }
            }
        }
        Section("CHANGE PASSWORD")
        Field("Current Password", current, Modifier.fillMaxWidth(), password = true, size = 24)
        Row(horizontalArrangement = Arrangement.spacedBy(16.u), modifier = Modifier.padding(top = 8.u)) {
            Field("New Password", next, Modifier.weight(1f), password = true, size = 24)
            Field("Confirm New Password", confirm, Modifier.weight(1f), password = true, size = 24)
        }
        note?.let { (ok, t) -> Txt(t, 22, color = if (ok) C.Mint else C.Pink, align = TextAlign.Center, modifier = Modifier.padding(top = 8.u)) }
        CandyButton(if (busy) "Saving…" else "Update Password", Modifier.padding(top = 12.u).size(400.u, 74.u), size = 30, enabled = !busy && current.value.isNotEmpty() && next.value.isNotEmpty()) {
            busy = true
            scope.launch {
                note = try {
                    Api.put("/profile/password", Api.body("current_password" to current.value, "password" to next.value, "password_confirmation" to confirm.value))
                    current.value = ""; next.value = ""; confirm.value = ""
                    true to "Password updated."
                } catch (e: Exception) {
                    false to errorText(e)
                }
                busy = false
            }
        }
        Section("ACCOUNT")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.u)) {
            CandyButton("Wallet", Modifier.weight(1f).height(70.u), Tone.Blue, size = 26) { onClose(); Nav.go(Route.Wallet) }
            CandyButton("Game History", Modifier.weight(1f).height(70.u), Tone.Blue, size = 26) { onClose(); Nav.go(Route.History) }
            CandyButton("Notifications", Modifier.weight(1f).height(70.u), Tone.Blue, size = 26) { onClose(); Nav.go(Route.Notifications) }
        }
    }
}

@Composable
private fun Section(title: String) {
    Box(Modifier.padding(top = 22.u, bottom = 10.u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFF9B25A), Color(0xFFB14D12)))).padding(horizontal = 30.u, vertical = 6.u)) {
        Txt(title, 26)
    }
}

// ------------------------------------------------------------------ Shop

/**
 * Shop: buy Keys with Chips (fixed packages). The server decides everything (GET /shop,
 * POST /shop/key-exchanges): it checks the Chips, credits the Keys, refuses duplicates (the
 * idempotency key) and logs it. Every exchange needs an explicit "final and non-refundable" OK.
 */
@Composable
fun ShopPanel(onClose: () -> Unit) {
    var state by remember { mutableStateOf<ShopState?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<ShopPack?>(null) }
    var agreed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var requestKey by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val load: () -> Unit = { scope.launch { try { state = ShopState.of(Api.get("/shop").data()); loadError = null } catch (e: Exception) { loadError = errorText(e) } } }
    LaunchedEffect(Unit) { load() }

    Modal("Shop", { if (!busy) onClose() }, width = 1280) {
        val s = state
        if (s == null) {
            Txt(loadError ?: "Loading the Shop…", 28, align = TextAlign.Center)
            return@Modal
        }
        Row(horizontalArrangement = Arrangement.spacedBy(30.u), verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) { ChipIcon(44); Txt("${fmtWhole(s.chips)} Chips", 30) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) { KeyIcon(44); Txt("${fmtWhole(s.keys)} Keys", 30) }
            Pill("${s.chipsPerKey} Chips = 1 Key", size = 22, color = C.Gold)
        }
        Row(Modifier.fillMaxWidth().padding(top = 20.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
            s.packages.forEach { p ->
                GoldFrame(Modifier.weight(1f).height(300.u).tap(enabled = !busy) {
                    if (s.chips < p.chips) {
                        Sound.play("lose")
                        note = false to "Not enough Chips — this package costs ${fmt(p.chips)} Chips and you have ${fmtWhole(s.chips)}."
                    } else {
                        requestKey = idempotencyKey()
                        agreed = false
                        confirm = p
                    }
                }, radius = 30, rim = 6, fill = Brush.verticalGradient(listOf(Color(0xFF4A0D10), Color(0xFF120203)))) {
                    Column(Modifier.fillMaxSize().padding(14.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceEvenly) {
                        KeyIcon(110)
                        Txt("${p.keys} ${if (p.keys == 1) "KEY" else "KEYS"}", 38, color = C.Gold)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.u)) { ChipIcon(34); Txt(fmt(p.chips), 30) }
                    }
                }
            }
        }
        note?.let { (ok, t) -> Txt(t, 24, color = if (ok) C.Mint else C.Pink, align = TextAlign.Center, modifier = Modifier.padding(top = 14.u)) }
        if (s.history.isNotEmpty()) {
            Txt("Recent exchanges", 26, color = C.Cream, modifier = Modifier.padding(top = 18.u))
            s.history.take(5).forEach { h ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.u), horizontalArrangement = Arrangement.SpaceBetween) {
                    Txt(whenText(h.text("created_at")), 20, color = C.White.copy(alpha = 0.7f))
                    Txt("${fmt(h.text("chips").toDoubleOrNull())} Chips → ${fmt(h.text("keys").toDoubleOrNull())} Keys", 20)
                }
            }
        }
    }

    confirm?.let { p ->
        Modal("Confirm Exchange", { if (!busy) confirm = null }, width = 820) {
            Txt("Exchange ${fmt(p.chips)} Chips for ${p.keys} ${if (p.keys == 1) "Key" else "Keys"}?", 30, align = TextAlign.Center)
            Row(Modifier.padding(top = 18.u).tap(sound = null) { agreed = !agreed }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.u)) {
                Box(Modifier.size(44.u).clip(RoundedCornerShape(10.u)).background(if (agreed) C.Green else Color(0x33FFFFFF)).border(3.u, Color.White, RoundedCornerShape(10.u)), contentAlignment = Alignment.Center) { if (agreed) Txt("✓", 30) }
                Txt("I understand this exchange is final and non-refundable.", 22)
            }
            Row(Modifier.padding(top = 22.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
                CandyButton("Cancel", Modifier.size(240.u, 76.u), Tone.Dark, size = 28) { confirm = null }
                CandyButton(if (busy) "Exchanging…" else "Confirm", Modifier.size(300.u, 76.u), size = 30, enabled = agreed && !busy) {
                    busy = true
                    scope.launch {
                        try {
                            val r = Api.post("/shop/key-exchanges", Api.body("package" to p.id, "idempotency_key" to requestKey, "confirmed" to true))
                            Sound.play("win")
                            note = true to r.text("message", "Success! ${fmt(p.chips)} Chips exchanged for ${p.keys} keys.")
                            Session.walletChanged()
                        } catch (e: Exception) {
                            Sound.play("lose")
                            note = false to errorText(e)
                        }
                        confirm = null
                        busy = false
                        load()
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Avatar + nickname

@Composable
fun AvatarPicker(onClose: () -> Unit) {
    val user by Session.user.collectAsState()
    val current = avatarFor(user?.avatar, user?.id)
    var sel by remember { mutableStateOf(current) }
    var tab by remember { mutableStateOf("all") }
    val nick = remember { mutableStateOf(user?.shownName ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ids = if (tab == "all") AVATAR_IDS else AVATAR_IDS.filter { it.startsWith(tab) }
    val nickChanged = nick.value.trim() != (user?.shownName ?: "")

    Modal("Choose Your Avatar", onClose, width = 1300) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(30.u)) {
            Column(Modifier.width(360.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.u)) {
                Avatar(sel, user?.id, 220, square = true)
                Txt(AVATAR_NAMES[sel] ?: sel, 28, color = C.Gold)
                Field("Nickname", nick, Modifier.fillMaxWidth(), size = 24)
                error?.let { Txt(it, 20, color = C.Pink, align = TextAlign.Center) }
                CandyButton(if (busy) "Saving…" else "Confirm", Modifier.fillMaxWidth().height(80.u), size = 34, enabled = !busy) {
                    if (sel == current && !nickChanged) {
                        onClose()
                    } else {
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                if (nickChanged) Api.put("/profile/nickname", Api.body("nickname" to nick.value.trim()))
                                if (sel != current) Api.put("/profile/avatar", Api.body("avatar" to sel))
                                Session.refresh()
                                Sound.play("win")
                                onClose()
                            } catch (e: Exception) {
                                error = errorText(e)
                                Sound.play("lose")
                            }
                            busy = false
                        }
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.u)) {
                    listOf("all" to "All", "boy" to "Boys", "girl" to "Girls", "animal" to "Animals").forEach { (k, l) ->
                        CandyButton(l, Modifier.size(170.u, 60.u), if (tab == k) Tone.Gold else Tone.Dark, size = 24) { tab = k }
                    }
                }
                Column(Modifier.padding(top = 14.u).height(520.u).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.u)) {
                    ids.chunked(5).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.u)) {
                            row.forEach { id ->
                                Box(Modifier.size(140.u).tap { sel = id }.border(if (id == sel) 6.u else 2.u, if (id == sel) C.Gold else Color(0x55FFFFFF), RoundedCornerShape(22.u))) {
                                    Avatar(id, null, 140, square = true)
                                    if (id == current) Pill("Current", Modifier.align(Alignment.TopStart).padding(4.u), bg = C.Green, size = 14)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Friends

/** Friends list: add by username, accept / decline requests, invite online friends to your lobby. */
@Composable
fun FriendsPanel(modifier: Modifier) {
    var data by remember { mutableStateOf<FriendsData?>(null) }
    val username = remember { mutableStateOf("") }
    val query = remember { mutableStateOf("") }
    var note by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var adding by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val reload: () -> Unit = { scope.launch { runCatching { data = FriendsData.of(Api.get("/friends").data()) } } }
    LaunchedEffect(Unit) {
        while (true) {
            reload()
            delay(20_000)
        }
    }
    val run: (suspend () -> org.json.JSONObject) -> Unit = { fn ->
        scope.launch {
            note = try {
                val r = fn()
                true to r.text("message", "Done.")
            } catch (e: Exception) {
                false to errorText(e)
            }
            reload()
        }
    }
    val match = { name: String, user: String -> query.value.isBlank() || "$name $user".lowercase().contains(query.value.trim().lowercase()) }

    Box(modifier.clip(RoundedCornerShape(28.u)).background(Brush.verticalGradient(listOf(Color(0xF23A2142), Color(0xF21E1026)))).padding(14.u)) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.u)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Txt("Friends", 34, color = C.Gold)
                Pill("${data?.onlineCount ?: 0} online", bg = Color(0xFF13A344), size = 18)
                Box(Modifier.size(56.u).tap(label = "Add friend") { adding = !adding }.clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))), contentAlignment = Alignment.Center) { Txt("+", 36, color = C.Brown) }
            }
            if (adding) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                    Field(null, username, Modifier.weight(1f), placeholder = "Friend's username", size = 20)
                    CandyButton("Add", Modifier.size(100.u, 52.u), Tone.Green, size = 22, enabled = username.value.isNotBlank()) {
                        val name = username.value.trim()
                        run { Api.post("/friends", Api.body("username" to name)).also { username.value = ""; adding = false } }
                    }
                }
            }
            Field(null, query, Modifier.fillMaxWidth(), placeholder = "Search friends", size = 20)
            note?.let { (ok, t) -> Txt(t, 17, color = if (ok) C.Mint else C.Pink) }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.u)) {
                val d = data
                if (d == null) {
                    Txt("Loading friends…", 22, color = C.White.copy(alpha = 0.6f))
                } else {
                    d.incoming.filter { match(it.name, it.username) }.forEach { r ->
                        FriendRow(r.name, r.avatar, r.userId, "wants to be friends", true) {
                            Box(Modifier.size(52.u).tap(label = "Accept ${r.name}") { run { Api.post("/friends/${r.id}/accept") } }.clip(CircleShape).background(C.Green), contentAlignment = Alignment.Center) { Txt("✓", 28) }
                            Box(Modifier.size(52.u).tap(label = "Decline ${r.name}") { run { Api.delete("/friends/${r.id}") } }.clip(CircleShape).background(Color(0x33FFFFFF)), contentAlignment = Alignment.Center) { Txt("✕", 24) }
                        }
                    }
                    val friends = d.friends.filter { match(it.name, it.username) }
                    if (friends.isEmpty() && d.incoming.isEmpty()) Txt("No friends yet — add one with +.", 20, color = C.White.copy(alpha = 0.6f))
                    friends.forEach { f ->
                        val status = when {
                            f.inGame -> "Playing${f.roomName?.let { " · $it" } ?: ""}"
                            f.online -> "Online"
                            f.lastSeenAt != null -> "Last seen ${ago(f.lastSeenAt)}"
                            else -> "Never online"
                        }
                        FriendRow(f.name, f.avatar, f.userId, "Lv. ${f.level} · $status", f.online) {
                            if (f.online && !f.inGame) {
                                CandyButton("Invite", Modifier.size(110.u, 50.u), Tone.Purple, size = 20) { run { Api.post("/friends/${f.userId}/invite") } }
                            }
                        }
                    }
                    d.outgoing.filter { match(it.name, it.username) }.forEach { o ->
                        FriendRow(o.name, o.avatar, o.userId, "Request sent", false) {
                            Box(Modifier.size(52.u).tap(label = "Cancel request") { run { Api.delete("/friends/${o.id}") } }.clip(CircleShape).background(Color(0x33FFFFFF)), contentAlignment = Alignment.Center) { Txt("✕", 24) }
                        }
                    }
                }
            }
        }
    }
}

private fun ago(iso: String): String {
    val ms = instant(iso) ?: return "—"
    val mins = (System.currentTimeMillis() - ms) / 60_000
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "${mins}m ago"
        mins < 1440 -> "${mins / 60}h ago"
        else -> "${mins / 1440}d ago"
    }
}

@Composable
private fun FriendRow(name: String, avatar: String?, userId: Int, sub: String, online: Boolean, actions: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.u)).background(Color(0x40000000)).padding(8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.u)) {
        Box {
            Avatar(avatar, userId, 64)
            Box(Modifier.align(Alignment.BottomEnd).size(18.u).clip(CircleShape).background(if (online) Color(0xFF4EE36B) else Color(0xFF777777)).border(2.u, Color.White, CircleShape))
        }
        Column(Modifier.weight(1f)) {
            Txt(name, 22, maxLines = 1)
            Txt(sub, 16, color = C.White.copy(alpha = 0.65f), maxLines = 1)
        }
        actions()
    }
}

// ------------------------------------------------------------------ Out of Gold

/** Single Player Out of Gold: the free Gold claim (one request id per popup; the server checks it). */
@Composable
fun OutOfGoldPopup(initial: GoldWallet, onClose: () -> Unit, onPlay: () -> Unit) {
    var wallet by remember { mutableStateOf(initial) }
    var claimed by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val requestId = remember { idempotencyKey().replace(Regex("[^A-Za-z0-9-]"), "") }
    val scope = rememberCoroutineScope()
    Modal("Out of Gold", onClose, width = 860) {
        GoldIcon(150)
        Txt(if (claimed) "Free Gold claimed!" else "You ran out of Gold for Single Player.", 30, align = TextAlign.Center)
        Txt(if (claimed) "Good luck at the table." else "Claim ${fmt(wallet.claimAmount)} free Gold to keep playing.", 24, color = C.White.copy(alpha = 0.8f), align = TextAlign.Center)
        Pill("Gold: ${fmtWhole(wallet.total)}", Modifier.padding(top = 12.u), color = C.Gold, size = 28)
        error?.let { Txt(it, 22, color = C.Pink, align = TextAlign.Center) }
        Row(Modifier.padding(top = 20.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
            if (claimed || !wallet.canClaim) {
                CandyButton("Close", Modifier.size(240.u, 80.u), Tone.Dark, size = 30, onClick = onClose)
                if (claimed) CandyButton("Play", Modifier.size(260.u, 80.u), Tone.Green, size = 34, onClick = onPlay)
            } else {
                CandyButton(if (busy) "Claiming…" else "Claim Free Gold", Modifier.size(420.u, 84.u), size = 32, enabled = !busy) {
                    busy = true
                    scope.launch {
                        try {
                            wallet = GoldWallet.of(Api.post("/practice/gold/claim", Api.body("request_id" to requestId)).data())
                            claimed = true
                            Sound.play("win")
                            Session.walletChanged()
                        } catch (e: Exception) {
                            error = errorText(e)
                            Sound.play("lose")
                        }
                        busy = false
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Single Player picker

private val TIER_COLORS = mapOf(
    "beginner" to listOf(Color(0xFF5EF08A), Color(0xFF0F7A34)),
    "intermediate" to listOf(Color(0xFF6FD4FF), Color(0xFF1560D0)),
    "advanced" to listOf(Color(0xFFC477FF), Color(0xFF5A14B8)),
    "mastery" to listOf(Color(0xFFFF6B5C), Color(0xFF9C0A12)),
)

/** Single Player — Select Difficulty Level: each tier's minimum Gold and bets (the server checks again). */
@Composable
fun SinglePlayerPicker(onClose: () -> Unit, onContinue: (String, Int?) -> Unit) {
    var tiers by remember { mutableStateOf<List<PracticeTier>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val gold by Session.gold.collectAsState()
    LaunchedEffect(Unit) {
        try {
            tiers = Api.get("/practice/tiers").dataList().map(PracticeTier::of)
        } catch (e: Exception) {
            error = errorText(e)
        }
    }
    Modal("Select Difficulty Level", onClose, width = 1480) {
        gold?.let { Pill("Your Gold: ${fmtWhole(it.total)}", color = C.Gold, size = 26) }
        val list = tiers
        if (list == null) {
            Txt(error ?: "Loading…", 28, modifier = Modifier.padding(30.u))
            return@Modal
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.u), horizontalArrangement = Arrangement.spacedBy(18.u)) {
            list.forEach { t ->
                val colors = TIER_COLORS[t.key] ?: TIER_COLORS.getValue("beginner")
                GoldFrame(Modifier.weight(1f).height(520.u).alpha(if (t.eligible) 1f else 0.55f), radius = 34, rim = 7, fill = Brush.verticalGradient(colors)) {
                    Column(Modifier.fillMaxSize().padding(14.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.u)) {
                        Txt((if (t.crown) "👑 " else "") + "★".repeat(t.stars.coerceIn(0, 5)), 32, color = C.Gold)
                        Txt(t.name, 38, stroke = Color(0x99000000), align = TextAlign.Center)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.u)) { GoldIcon(36); Txt("Min ${fmt(t.minGold)}", 24) }
                        Divider()
                        Txt("Choose your bet", 20, color = C.White.copy(alpha = 0.85f))
                        t.bets.forEach { b ->
                            CandyButton("Bet ${fmt(b)}", Modifier.fillMaxWidth().height(66.u), if (t.eligible) Tone.Gold else Tone.Dark, size = 28) {
                                if (t.eligible) onContinue(t.key, b) else Sound.play("lose")
                            }
                        }
                        if (!t.eligible) Txt("Not enough Gold", 22, color = C.Pink)
                    }
                }
            }
        }
    }
}
