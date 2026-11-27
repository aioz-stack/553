package ph.pusoy13.game.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.ApiException
import ph.pusoy13.game.core.Echo
import ph.pusoy13.game.core.LobbyDetail
import ph.pusoy13.game.core.LobbyList
import ph.pusoy13.game.core.LobbySummary
import ph.pusoy13.game.core.LobbyTier
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.entryProblem
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.keysLabel
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.Card
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.Field
import ph.pusoy13.game.ui.GoldBrush
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.KeyIcon
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.RoundIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.ToastHost
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.WalletPill
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.rememberToast
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

/**
 * Live lobby list: `lobby.updated` on the public `lobbies` channel (Reverb) plus polling (every
 * 5 s without a socket, 20 s with one), so the list stays right either way.
 */
@Composable
fun LobbyUpdates(onChange: () -> Unit) {
    val connected by Echo.connected.collectAsState()
    val scope = rememberCoroutineScope()
    DisposableEffect(Unit) {
        var job: Job? = null
        val h = Echo.listen("lobbies", "lobby.updated") { _, _ ->
            job?.cancel()
            job = scope.launch { delay(250); onChange() }
        }
        onDispose { h.remove() }
    }
    LaunchedEffect(connected) {
        while (true) {
            delay(if (connected) 20_000 else 5_000)
            onChange()
        }
    }
    LaunchedEffect(Unit) { Session.resumed.collect { onChange() } }
}

/**
 * Multiplayer Lobby — the 553 Lobby. Open Chips lobbies (All / Public / Private, search by name or
 * Lobby ID, pages), Quick Join, Create Lobby, and Join (with the password for a private lobby).
 * All rules, balances and seats are decided by the server.
 */
@Composable
fun LobbyScreen() {
    val user by Session.user.collectAsState()
    val balances by Session.balances.collectAsState()
    var tab by remember { mutableStateOf("all") }
    val search = remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var list by remember { mutableStateOf<LobbyList?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var joinFor by remember { mutableStateOf<LobbySummary?>(null) }
    var leaveAsk by remember { mutableStateOf<LobbyDetail?>(null) }
    val toast = rememberToast()
    val scope = rememberCoroutineScope()

    ResumeMatch()
    val load: () -> Unit = {
        scope.launch {
            try {
                val r = LobbyList.of(Api.get("/lobbies", mapOf("tab" to tab, "search" to query.ifBlank { null }, "page" to page)))
                list = r
                if (r.page != page) page = r.page
            } catch (e: Exception) {
                toast.show(false, errorText(e))
            }
            loading = false
        }
    }
    LaunchedEffect(tab, query, page, user?.id) { if (user != null) load() }
    LobbyUpdates(load)
    LaunchedEffect(search.value) {
        delay(350)
        if (search.value.trim() != query) {
            query = search.value.trim()
            page = 1
        }
    }

    val enter: (LobbyDetail) -> Unit = { l ->
        Session.walletChanged()
        Nav.go(Route.Room(l.summary.id))
    }
    val quickJoin: () -> Unit = {
        if (!busy) {
            busy = true
            scope.launch {
                try {
                    val l = LobbyDetail.of(Api.post("/lobbies/quick-join").data())
                    Sound.play("chip")
                    enter(l)
                } catch (e: Exception) {
                    Sound.play("lose")
                    toast.show(false, errorText(e))
                }
                busy = false
            }
        }
    }
    val myLobby = list?.myLobbyId
    val leaveLobby: () -> Unit = {
        if (myLobby == null) Nav.reset(Route.Home())
        else scope.launch {
            val d = runCatching { LobbyDetail.of(Api.get("/lobbies/$myLobby").data()) }.getOrNull()
            if (d != null && d.isSeated && d.tableId != null && d.tableStatus != "IN_GAME") leaveAsk = d else Nav.reset(Route.Home())
        }
    }

    Stage(background = { Scene("lantern") }) {
        // ---- top bar ----
        Row(Modifier.at(20, 14), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Box(Modifier.tap(label = "Change avatar") { panel = "avatar" }.clip(RoundedCornerShape(999.u)).background(GoldBrush).padding(5.u)) { Avatar(user?.avatar, user?.id, 110) }
            Column {
                Txt(user?.shownName ?: "", 36, maxLines = 1, stroke = Color(0x99000000))
                Txt("ID: ${user?.id ?: "…"}", 24, color = C.Gold)
                user?.level?.let { Pill("Lv. ${it.level}", bg = Color(0xFF138A24), size = 20) }
            }
        }
        WalletPill({ ChipIcon(56) }, balances.chips?.let(::fmtWhole) ?: "…", Modifier.at(560, 22, 480, 78))
        WalletPill({ KeyIcon(52) }, balances.keys?.let(::fmtWhole) ?: "…", Modifier.at(1060, 22, 290, 78), listOf(Color(0xFF5A1A9A), Color(0xFF24074A)))
        var sfx by remember { mutableStateOf(Sound.sfxOn) }
        RoundIcon(if (sfx) "Sound on" else "Sound off", Modifier.at(1384, 14), 92, onClick = { sfx = !sfx; Session.savePrefs(sfx = sfx) }) { Txt(if (sfx) "🔊" else "🔇", 40) }
        RoundIcon("Settings", Modifier.at(1490, 14), 92, onClick = { panel = "settings" }) { Txt("⚙", 48, color = C.Gold) }

        // ---- left side ----
        Row(
            Modifier.at(18, 146).tap(enabled = !busy, onClick = leaveLobby).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF8A1A1F), Color(0xFF3A0406)))).border(4.u, C.GoldEdge, RoundedCornerShape(999.u)).padding(horizontal = 18.u, vertical = 12.u),
            verticalAlignment = Alignment.CenterVertically,
        ) { Txt("🚪  Leave Multiplayer Lobby  →", 22) }
        GoldFrame(Modifier.at(18, 230, 150, 230), radius = 30, rim = 5, fill = Brush.verticalGradient(listOf(Color(0xFF6A1220), Color(0xFF2E0408)))) {
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceEvenly, horizontalAlignment = Alignment.CenterHorizontally) {
                Column(Modifier.tap { panel = "friends" }, horizontalAlignment = Alignment.CenterHorizontally) { Txt("👥", 50); Txt("Friends", 22) }
                Column(Modifier.tap { panel = "shop" }, horizontalAlignment = Alignment.CenterHorizontally) { Txt("🏪", 50); Txt("Shop", 22) }
            }
        }

        // ---- crest + main buttons ----
        Box(Modifier.at(640, 100, 320, 160), contentAlignment = Alignment.Center) {
            listOf("5S" to -16f, "5H" to 0f, "3D" to 16f).forEachIndexed { i, (c, r) ->
                Box(Modifier.padding(start = (i * 140).u).align(Alignment.CenterStart).rotate(r)) { Card(c, 80) }
            }
        }
        ph.pusoy13.game.ui.Art("mini-crest", Modifier.at(680, 200, 240, 140))
        CandyButton("Quick Join", Modifier.at(250, 262, 360, 100), size = 48, enabled = !busy && user != null, onClick = quickJoin)
        CandyButton("Create Lobby", Modifier.at(1040, 262, 380, 100), Tone.Purple, size = 46, enabled = user != null) { panel = "create" }

        // ---- tabs + search ----
        val counts = list?.counts ?: emptyMap()
        Row(Modifier.at(200, 384), horizontalArrangement = Arrangement.spacedBy(14.u)) {
            listOf("all" to "All", "public" to "Public Lobby", "private" to "🔒 Private Lobby").forEach { (t, label) ->
                CandyButton("$label (${counts[t] ?: 0})", Modifier.size(if (t == "all") 170.u else 290.u, 62.u), if (tab == t) Tone.Gold else Tone.Dark, size = 24) {
                    tab = t
                    page = 1
                }
            }
        }
        Field(null, search, Modifier.at(1060, 380, 400, 70), placeholder = "Search lobby ID or name…", size = 22)
        RoundIcon("Refresh", Modifier.at(1478, 384), 62, onClick = { loading = true; load() }) { Txt("⟳", 34, color = C.Gold) }

        // ---- lobby table ----
        val weights = listOf(2.6f, 1.5f, 1.1f, 1.25f, 0.8f, 0.95f, 1.15f, 1.25f)
        GoldFrame(Modifier.at(190, 462, 1390, 338), radius = 34, rim = 6, fill = Brush.verticalGradient(listOf(Color(0xF25A0C18), Color(0xF22A0410)))) {
            Column(Modifier.fillMaxSize().padding(horizontal = 16.u, vertical = 8.u)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 4.u)) {
                    listOf("Lobby Name", "Game Type", "Bet", "Min. Entry", "Prep", "Players", "Mode", "Status").forEachIndexed { i, h ->
                        Txt(h, 22, color = C.Cream, align = if (i == 0) TextAlign.Start else TextAlign.Center, modifier = Modifier.weight(weights[i]).padding(start = if (i == 0) 12.u else 0.u))
                    }
                }
                Box(Modifier.fillMaxWidth().height(2.u).background(C.GoldEdge.copy(alpha = 0.4f)))
                val rows = list?.rows ?: emptyList()
                when {
                    loading && list == null -> Centered("Loading lobbies…")
                    rows.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Txt(if (query.isNotBlank()) "No lobby matches “$query”." else "No open lobbies yet.", 30)
                        CandyButton("Create one!", Modifier.padding(top = 12.u).size(340.u, 70.u), Tone.Purple, size = 30) { panel = "create" }
                    }
                    else -> rows.forEach { l ->
                        Row(Modifier.fillMaxWidth().height(56.u), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(weights[0]).padding(start = 12.u)) {
                                Txt(l.name, 24, maxLines = 1)
                                Txt("ID ${l.lobbyId}", 16, color = C.Cream.copy(alpha = 0.8f))
                            }
                            Cell(weights[1]) { Pill(l.gameModeLabel, bg = if (l.gameMode == "banker") Color(0xFF8A5A0A) else Color(0xFFA3122A), size = 18) }
                            Cell(weights[2]) { Txt(l.betChips.joinToString("/") { fmt(it) }, 22) }
                            Cell(weights[3]) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Txt(fmt(l.minEntry), 22)
                                    if (l.keyFee > 0) Txt(keysLabel(l.keyFee), 15, color = C.Gold)
                                }
                            }
                            Cell(weights[4]) { Txt("${l.preparationSeconds}s", 22) }
                            Cell(weights[5]) { Txt("${l.players}/${l.maxPlayers}", 22) }
                            Cell(weights[6]) { Pill(if (l.type == "private") "🔒 Private" else "Public", bg = if (l.type == "private") Color(0xFF5A1A9A) else Color(0xFF13643A), size = 18) }
                            Cell(weights[7]) {
                                when {
                                    l.isMine -> CandyButton("▶ Return", Modifier.size(170.u, 48.u), Tone.Green, size = 22) { Nav.go(Route.Room(l.id)) }
                                    !l.canJoin -> Pill(if (l.status == "in_game") "In Game" else if (l.status == "full") "Full" else "Closed", size = 20)
                                    else -> CandyButton("▶ Join", Modifier.size(170.u, 48.u), size = 24, enabled = !busy) { joinFor = l }
                                }
                            }
                        }
                        Box(Modifier.fillMaxWidth().height(1.u).background(Color(0x1AFFFFFF)))
                    }
                }
            }
        }

        // ---- pagination ----
        val pages = list?.pages ?: 1
        if (pages > 1) {
            Row(Modifier.at(540, 816), horizontalArrangement = Arrangement.spacedBy(14.u), verticalAlignment = Alignment.CenterVertically) {
                CandyButton("«", Modifier.size(86.u, 62.u), Tone.Dark, size = 34, enabled = page > 1) { page = 1 }
                CandyButton("‹", Modifier.size(86.u, 62.u), Tone.Dark, size = 34, enabled = page > 1) { page-- }
                Pill("Page $page of $pages", size = 28)
                CandyButton("›", Modifier.size(86.u, 62.u), Tone.Red, size = 34, enabled = page < pages) { page++ }
                CandyButton("»", Modifier.size(86.u, 62.u), Tone.Red, size = 34, enabled = page < pages) { page = pages }
            }
        }

        if (myLobby != null && list?.rows?.none { it.id == myLobby } == true) {
            CandyButton("You are in a lobby — tap to return", Modifier.at(24, 820, 520, 60), Tone.Green, size = 22) { Nav.go(Route.Room(myLobby)) }
        }
        list?.otherTableId?.let { t ->
            CandyButton("You have a seat at another table — tap to go there", Modifier.at(24, 820, 620, 60), size = 20) { Nav.go(Route.Play(t)) }
        }

        // ---- popups ----
        when (panel) {
            "create" -> CreateLobbyModal(null, balances.chips, balances.keys, list?.tiers ?: LobbyTier.DEFAULT, { panel = null }) { panel = null; enter(it) }
            "settings" -> SettingsPanel { panel = null }
            "shop" -> ShopPanel { panel = null }
            "avatar" -> AvatarPicker { panel = null }
            "friends" -> Modal("Friends", { panel = null }, width = 640) { FriendsPanel(Modifier.fillMaxWidth().height(600.u)) }
        }
        joinFor?.let { l ->
            JoinLobbyModal(l, balances.chips, balances.keys, { joinFor = null }) { password ->
                try {
                    val d = LobbyDetail.of(Api.post("/lobbies/${l.id}/join", if (password != null) Api.body("password" to password) else null).data())
                    Sound.play("chip")
                    joinFor = null
                    enter(d)
                    null
                } catch (e: Exception) {
                    Sound.play("lose")
                    load()
                    errorText(e)
                }
            }
        }
        leaveAsk?.let { d ->
            val others = d.seats.count { it.userId != null && !it.isYou }
            val effect = when {
                others == 0 -> "You are the only player, so the lobby will close."
                d.isOwner -> "Ownership passes to the next player, and the other ${if (others == 1) "player is" else "$others players are"} told right away."
                else -> "The other ${if (others == 1) "player is" else "$others players are"} told right away."
            }
            Modal("Leave Lobby?", { leaveAsk = null }, width = 760) {
                Txt("${d.summary.name} · ID ${d.summary.lobbyId}", 28, color = C.Cream, align = TextAlign.Center)
                Txt("Leaving the Multiplayer Lobby also removes you from this lobby. $effect", 24, align = TextAlign.Center, modifier = Modifier.padding(top = 10.u))
                Row(Modifier.padding(top = 24.u), horizontalArrangement = Arrangement.spacedBy(24.u)) {
                    CandyButton("Stay", Modifier.size(240.u, 78.u), Tone.Dark, size = 30) { leaveAsk = null }
                    CandyButton(if (busy) "Leaving…" else "Leave Lobby", Modifier.size(300.u, 78.u), size = 30, enabled = !busy) {
                        busy = true
                        scope.launch {
                            try {
                                Api.post("/tables/${d.tableId}/leave")
                                Session.walletChanged()
                                leaveAsk = null
                                Nav.reset(Route.Home())
                            } catch (e: Exception) {
                                toast.show(false, errorText(e))
                                leaveAsk = null
                                load()
                            }
                            busy = false
                        }
                    }
                }
            }
        }
        ToastHost(toast, 150)
    }
}

@Composable
private fun RowScope.Cell(weight: Float, content: @Composable () -> Unit) = Box(Modifier.weight(weight), contentAlignment = Alignment.Center) { content() }

/** What it takes to join: Minimum Entry, in-game bets, Keys fee — against your own Chips and Keys. */
@Composable
fun EntryTerms(minEntry: Double, bets: List<Double>, keyFee: Int, chips: Double?, keys: Double?) {
    val chipsOk = chips == null || chips >= minEntry
    val keysOk = keys == null || keys >= keyFee
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.u)).background(Color(0xCC1D0306)).border(3.u, Color(0x99D9A441), RoundedCornerShape(22.u)).padding(horizontal = 24.u, vertical = 12.u)) {
        TermRow("Minimum Entry", "${fmt(minEntry)} Chips", chipsOk)
        TermRow("In-game bets", "${bets.joinToString(" / ") { fmt(it) }} Chips", true)
        if (chips != null) TermRow("Your Chips", fmtWhole(chips), chipsOk)
        if (keyFee > 0) TermRow("Key Entry Fee", keysLabel(keyFee), keysOk)
        if (keys != null && keyFee > 0) TermRow("Your Keys", fmt(keys), keysOk)
        Txt(
            "You choose your bet in the game, each round (hold 2× your bet)." + if (keyFee > 0) " ${keysLabel(keyFee)} ${if (keyFee == 1) "is" else "are"} deducted once, when the game starts." else "",
            18, color = C.White.copy(alpha = 0.6f), align = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.u),
        )
    }
}

@Composable
private fun TermRow(label: String, value: String, ok: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.u), horizontalArrangement = Arrangement.SpaceBetween) {
        Txt(label, 21, color = C.White.copy(alpha = 0.7f))
        Txt(value, 24, color = if (ok) C.Cream else C.Pink)
    }
}

/** Join confirmation (entry terms + password for a private lobby); returns an error text or null. */
@Composable
fun JoinLobbyModal(lobby: LobbySummary, chips: Double?, keys: Double?, onClose: () -> Unit, onJoin: suspend (String?) -> String?) {
    val pw = remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val private = lobby.type == "private"
    val problem = entryProblem(lobby.minEntry, lobby.betChips, lobby.keyFee, chips, keys)
    Modal("Join Lobby", onClose, width = 820) {
        Txt("${lobby.name} · ID ${lobby.lobbyId}", 30, color = C.Cream, align = TextAlign.Center)
        Txt("${lobby.gameModeLabel} · ${lobby.players}/${lobby.maxPlayers} players · Prep ${lobby.preparationSeconds}s", 22, color = C.White.copy(alpha = 0.75f), modifier = Modifier.padding(bottom = 12.u))
        EntryTerms(lobby.minEntry, lobby.betChips, lobby.keyFee, chips, keys)
        if (private) Field("Lobby password", pw, Modifier.fillMaxWidth().padding(top = 14.u), password = true, size = 26)
        (error ?: problem)?.let { Txt(it, 22, color = C.Pink, align = TextAlign.Center, modifier = Modifier.padding(top = 10.u)) }
        Row(Modifier.padding(top = 20.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
            CandyButton("Cancel", Modifier.size(240.u, 78.u), Tone.Dark, size = 30, onClick = onClose)
            CandyButton(if (busy) "Joining…" else "Confirm Join", Modifier.size(320.u, 78.u), size = 30, enabled = !busy && problem == null && (!private || pw.value.isNotEmpty())) {
                busy = true
                scope.launch {
                    error = onJoin(if (private) pw.value else null)
                    busy = false
                }
            }
        }
    }
}

private const val NAME_MAX = 30
private val PREPARATION_SECONDS = listOf(30, 45, 60, 75)

/**
 * Create Lobby (or, with `edit`, the owner changes name / password / time): name, optional
 * password (empty = Public, set = Private), entry tier and preparation time. Round Bank only.
 */
@Composable
fun CreateLobbyModal(edit: LobbyDetail?, chips: Double?, keys: Double?, tiers: List<LobbyTier>, onClose: () -> Unit, onSaved: (LobbyDetail) -> Unit) {
    val name = remember { mutableStateOf(edit?.summary?.name ?: "") }
    val password = remember { mutableStateOf("") }
    var clearPw by remember { mutableStateOf(false) }
    var minEntry by remember { mutableIntStateOf(edit?.summary?.minEntry?.toInt() ?: tiers.firstOrNull()?.minEntry ?: 100) }
    var prep by remember { mutableIntStateOf(edit?.summary?.preparationSeconds ?: 45) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val type = if (password.value.isNotEmpty()) "private" else if (edit?.summary?.type == "private" && !clearPw) "private" else "public"
    val tier = tiers.find { it.minEntry == minEntry } ?: tiers.first()

    Modal(if (edit != null) "Edit Lobby" else "Create Lobby", onClose, width = 1100) {
        Field("Lobby Name (${name.value.trim().length}/$NAME_MAX)", name, Modifier.fillMaxWidth(), placeholder = "e.g. 553 Rookie Room", error = errors["name"], size = 26)
        Row(Modifier.fillMaxWidth().padding(top = 10.u), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Field(
                "Password — " + if (edit?.summary?.type == "private") (if (clearPw) "will be removed: anyone can join" else "leave empty to keep the current one") else "optional, empty = public",
                password, Modifier.weight(1f), placeholder = if (edit?.summary?.type == "private") "Keep current password" else "No password", password = true, error = errors["password"], size = 24,
            )
            Pill(if (type == "private") "🔒 Private" else "Public", bg = if (type == "private") Color(0xFF5A1A9A) else Color(0xFF13643A), size = 22)
            if (edit?.summary?.type == "private" && password.value.isEmpty()) {
                CandyButton(if (clearPw) "Keep" else "Remove", Modifier.size(170.u, 60.u), Tone.Dark, size = 22) { clearPw = !clearPw }
            }
        }
        if (edit == null) {
            Txt("Entry tier", 24, color = C.Cream, modifier = Modifier.padding(top = 14.u).fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.u)) {
                tiers.forEach { t ->
                    val on = t.minEntry == minEntry
                    Column(
                        Modifier.weight(1f).tap { minEntry = t.minEntry }.clip(RoundedCornerShape(20.u)).background(if (on) Color(0xFF7A4A00) else Color(0x661D0306)).border(4.u, if (on) C.Gold else Color(0x66D9A441), RoundedCornerShape(20.u)).padding(12.u),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Txt("Min Entry ${fmt(t.minEntry)}", 26, color = if (on) C.Gold else C.White)
                        Txt("Bets ${t.bets.joinToString("/")}", 20)
                        Txt(keysLabel(t.keys), 18, color = C.Gold)
                    }
                }
            }
        }
        Txt("Preparation time", 24, color = C.Cream, modifier = Modifier.padding(top = 14.u).fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.u)) {
            PREPARATION_SECONDS.forEach { s -> CandyButton("${s}s", Modifier.weight(1f).height(62.u), if (prep == s) Tone.Gold else Tone.Dark, size = 26) { prep = s } }
        }
        if (edit == null) {
            Box(Modifier.padding(top = 14.u)) { EntryTerms(tier.minEntry.toDouble(), tier.bets.map { it.toDouble() }, tier.keys, chips, keys) }
        }
        errors["form"]?.let { Txt(it, 22, color = C.Pink, align = TextAlign.Center, modifier = Modifier.padding(top = 8.u)) }
        Row(Modifier.padding(top = 18.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
            CandyButton("Cancel", Modifier.size(240.u, 78.u), Tone.Dark, size = 30, onClick = onClose)
            CandyButton(if (busy) "Saving…" else if (edit != null) "Save" else "Create", Modifier.size(300.u, 78.u), Tone.Purple, size = 32, enabled = !busy) {
                val n = name.value.trim()
                val p = password.value
                val problems = buildMap {
                    if (n.isEmpty()) put("name", "Enter a lobby name.") else if (n.length < 2) put("name", "The lobby name needs at least 2 characters.") else if (n.length > NAME_MAX) put("name", "The lobby name can be at most $NAME_MAX characters.")
                    if (p.isNotEmpty() && p.length < 4) put("password", "A lobby password needs at least 4 characters.") else if (p.length > 32) put("password", "A lobby password can be at most 32 characters.")
                }
                errors = problems
                if (problems.isEmpty()) {
                    busy = true
                    scope.launch {
                        try {
                            val r = if (edit != null) {
                                val body = Api.body("name" to n, "preparation_seconds" to prep)
                                if (p.isNotEmpty()) body.put("password", p) else if (clearPw) body.put("password", org.json.JSONObject.NULL)
                                Api.patch("/lobbies/${edit.summary.id}", body)
                            } else {
                                Api.post("/lobbies", Api.body("name" to n, "password" to p.ifEmpty { null }, "game_mode" to "round_bank", "min_entry" to minEntry, "preparation_seconds" to prep))
                            }
                            Sound.play("chip")
                            onSaved(LobbyDetail.of(r.data()))
                        } catch (e: Exception) {
                            Sound.play("lose")
                            val f = (e as? ApiException)?.errors ?: emptyMap()
                            errors = mapOf("name" to f["name"]?.firstOrNull(), "password" to f["password"]?.firstOrNull(), "form" to if (f.containsKey("name") || f.containsKey("password")) null else errorText(e)).filterValues { it != null }.mapValues { it.value!! }
                        }
                        busy = false
                    }
                }
            }
        }
    }
}
