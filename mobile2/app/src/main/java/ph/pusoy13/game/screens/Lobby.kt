package ph.pusoy13.game.screens

import androidx.compose.foundation.shape.CircleShape
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.Art
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.offset
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
import ph.pusoy13.game.ui.CompactModal
import ph.pusoy13.game.ui.Body
import ph.pusoy13.game.ui.ts
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
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
 * Multiplayer Lobby — the 553 Lobby (mobile/src/app/lobby/page.tsx, 1600×900 stage): open Chips
 * lobbies (All / Public / Private, search by name or Lobby ID, pages), Quick Join, Create Lobby, and
 * Join (with the password for a private lobby), live over Reverb with polling as a fallback. Every
 * rule, balance and seat is decided by the server.
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
    var sfx by remember { mutableStateOf(Sound.sfxOn) }
    val toast = rememberToast()
    val scope = rememberCoroutineScope()

    ResumeMatch()
    val load: () -> Unit = {
        scope.launch {
            try {
                val r = LobbyList.of(Api.get("/lobbies", mapOf("tab" to tab, "search" to query.ifBlank { null }, "page" to page)))
                list = r
                if (r.page != page) page = r.page
            } catch (e: Exception) { toast.show(false, errorText(e)) }
            loading = false
        }
    }
    LaunchedEffect(tab, query, page, user?.id) { if (user != null) load() }
    LobbyUpdates(load)
    LaunchedEffect(search.value) {
        delay(350)
        if (search.value.trim() != query) { query = search.value.trim(); page = 1 }
    }
    val enter: (LobbyDetail) -> Unit = { l -> Session.walletChanged(); Nav.go(Route.Room(l.summary.id)) }
    val quickJoin: () -> Unit = {
        if (!busy) {
            busy = true
            scope.launch {
                try { val l = LobbyDetail.of(Api.post("/lobbies/quick-join").data()); Sound.play("chip"); enter(l) } catch (e: Exception) { Sound.play("lose"); toast.show(false, errorText(e)) }
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
    val redBrush = Brush.verticalGradient(listOf(Color(0xFF8A1A1F), Color(0xFF3A0406)))

    Stage(background = { Scene("lantern"); Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x4D1A0420), Color.Transparent, Color(0x801A0420))))) }) {
        // ---- top bar ----
        Row(Modifier.at(20, 14), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Box(Modifier.tap(label = "Change avatar") { panel = "avatar" }) {
                Box(Modifier.lip(6, Color(0xFF7A3E00), 999).goldRim(999, 5).padding(5.u).clip(CircleShape).border(2.u, Color(0xB3FFFFFF), CircleShape)) { Avatar(user?.avatar, user?.id, 110) }
                Box(Modifier.align(Alignment.BottomEnd).offset(x = 4.u, y = 4.u).size(38.u).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))).border(3.u, Color.White, CircleShape), contentAlignment = Alignment.Center) { Txt("✎", 18, color = C.Brown, font = ph.pusoy13.game.ui.Body) }
            }
            Column {
                Txt(user?.shownName ?: "", 36, maxLines = 1, stroke = Color(0x99000000), strokeWidth = 4, modifier = Modifier.widthIn(max = 300.u))
                Txt("ID: ${user?.id ?: "…"}", 24, color = C.Gold)
                user?.level?.let {
                    Box(Modifier.padding(top = 4.u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF3FD04F), Color(0xFF138A24)))).border(2.u, Color(0xFF9CF08A), RoundedCornerShape(999.u)).padding(horizontal = 12.u)) { Txt("Lv. ${it.level}", 20) }
                }
            }
        }
        BalancePill(Modifier.at(560, 22, 480, 78), "icon-chips", 56, balances.chips, listOf(Color(0xFF5A0609), Color(0xFF2A0204)), endPad = 58)
        BalancePill(Modifier.at(1060, 22, 290, 78), "icon-keys", 52, balances.keys, listOf(Color(0xFF5A1A9A), Color(0xFF24074A)), endPad = 20)
        TopIcon(1376, if (sfx) "Sound on — tap to turn off" else "Sound off — tap to turn on", { sfx = !sfx; Session.savePrefs(sfx = sfx) }) { Art(if (sfx) "ic-sound-on" else "ic-sound-off", Modifier.size(46.u), animate = false) }
        TopIcon(1484, "Settings", { panel = "settings" }) { Art("ic-gear-gold", Modifier.size(50.u), animate = false) }

        // ---- left sidebar ----
        Row(
            Modifier.at(18, 146).height(70.u).tap(enabled = !busy, label = "Leave Multiplayer Lobby", onClick = leaveLobby).lip(5, Color(0xFF1A0204), 999).clip(RoundedCornerShape(999.u)).background(redBrush)
                .border(4.u, Color(0xFFFFC531), RoundedCornerShape(999.u)).padding(start = 8.u, end = 20.u),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
        ) {
            Box(Modifier.size(54.u).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))), contentAlignment = Alignment.Center) { Art("ic-door", Modifier.size(38.u), animate = false) }
            Txt("Leave Multiplayer Lobby", 22, stroke = Color(0x99000000), strokeWidth = 3)
            Art("ic-arrow", Modifier.size(24.u), animate = false)
        }
        Box(Modifier.at(18, 230).width(150.u).lip(6, Color(0xFF5A2A00), 30).goldRim(30, 5).padding(5.u)) {
            Column(Modifier.clip(RoundedCornerShape(25.u)).background(Brush.verticalGradient(listOf(Color(0xFF6A1220), Color(0xFF2E0408)))).padding(vertical = 4.u)) {
                SideItem("Friends", { panel = "friends" }) { Art("ic-people-big", Modifier.size(65.u, 50.u), animate = false) }
                Box(Modifier.fillMaxWidth().height(2.u).background(Color(0x4DFFC531)))
                SideItem("Shop", { panel = "shop" }) { Art("ic-store", Modifier.size(60.u), animate = false) }
            }
        }

        // ---- crest + main buttons ----
        Box(Modifier.at(600, 112, 400, 250)) {
            listOf(Triple("5S", -16f, 92), Triple("5H", 0f, 160), Triple("3D", 16f, 228)).forEach { (c, r, x) ->
                Box(Modifier.at(x, 6).graphicsLayer { rotationZ = r }) { Card(c, 80) }
            }
            Art("lobby-crest", Modifier.at(0, 86, 400, 160))
        }
        CandyButtonRow(Modifier.at(250, 262, 360, 100), Tone.Gold, enabled = !busy && user != null, onClick = quickJoin) {
            Art("ic-bolt", Modifier.size(40.u, 50.u), animate = false)
            Txt("Quick Join", 48, color = C.Brown)
        }
        CandyButton("Create Lobby", Modifier.at(1040, 262, 380, 100), Tone.Purple, size = 48, enabled = user != null) { panel = "create" }

        // ---- tabs + search ----
        val counts = list?.counts ?: emptyMap()
        Row(Modifier.at(200, 384), horizontalArrangement = Arrangement.spacedBy(16.u)) {
            listOf("all" to "All", "public" to "Public Lobby", "private" to "Private Lobby").forEach { (t, label) ->
                val on = tab == t
                Row(
                    Modifier.height(62.u).tap(label = label) { tab = t; page = 1 }.lip(5, if (on) Color(0xFF8A4A00) else Color(0xFF1A0204), 18).clip(RoundedCornerShape(18.u))
                        .background(Brush.verticalGradient(if (on) listOf(Color(0xFFFFE46A), Color(0xFFE08A00)) else listOf(Color(0xFF6A1218), Color(0xFF33060A))))
                        .border(4.u, if (on) Color(0xFFFFF3A0) else Color(0xFFD9A441), RoundedCornerShape(18.u)).padding(horizontal = 24.u),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u),
                ) {
                    when (t) {
                        "all" -> Txt("▦", 26, color = if (on) C.Brown else C.Cream)
                        "public" -> Art("ic-people", Modifier.size(31.u, 24.u), animate = false)
                        else -> Art("ic-lock", Modifier.size(26.u), animate = false)
                    }
                    Txt("$label (${counts[t] ?: 0})", 26, color = if (on) C.Brown else C.Cream)
                }
            }
        }
        Row(
            Modifier.at(1080, 384, 380, 62).clip(RoundedCornerShape(999.u)).background(Color(0xE61D0306)).border(4.u, Color(0xFFD9A441), RoundedCornerShape(999.u)).padding(start = 16.u, end = 20.u),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
        ) {
            Art("ic-search-gold", Modifier.size(28.u), animate = false)
            BareInput(search, "Search lobby ID or name…", Modifier.weight(1f), size = 22)
        }
        Box(Modifier.at(1478, 384, 62, 62).tap(label = "Refresh") { loading = true; load() }.clip(CircleShape).background(redBrush).border(4.u, Color(0xFFFFC531), CircleShape), contentAlignment = Alignment.Center) {
            Art("ic-refresh", Modifier.size(32.u), animate = false)
        }

        // ---- lobby table ----
        val weights = listOf(2.6f, 1.5f, 1.1f, 1.25f, 0.8f, 0.95f, 1.15f, 1.25f)
        Box(Modifier.at(190, 462, 1390, 338).lip(8, Color(0xFF5A2A00), 34).goldRim(34, 6).padding(6.u)) {
            Column(Modifier.fillMaxSize().clip(RoundedCornerShape(28.u)).background(Brush.verticalGradient(listOf(Color(0xF25A0C18), Color(0xF22A0410)))).padding(horizontal = 16.u, vertical = 8.u)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 4.u)) {
                    listOf("Lobby Name", "Game Type", "Bet", "Min. Entry", "Prep", "Players", "Mode", "Status").forEachIndexed { i, h ->
                        Txt(h, 22, color = C.Cream, align = if (i == 0) TextAlign.Start else TextAlign.Center, modifier = Modifier.weight(weights[i]).padding(start = if (i == 0) 16.u else 0.u))
                    }
                }
                Box(Modifier.fillMaxWidth().height(2.u).background(Color(0x66FFC531)))
                val rows = list?.rows ?: emptyList()
                when {
                    loading && list == null -> Centered("Loading lobbies…")
                    rows.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Txt(if (query.isNotBlank()) "No lobby matches “$query”." else "No open lobbies yet.", 30)
                        CandyButton("Create one!", Modifier.padding(top = 16.u).size(340.u, 70.u), Tone.Purple, size = 30) { panel = "create" }
                    }
                    else -> rows.forEach { l ->
                        Row(Modifier.fillMaxWidth().height(56.u), verticalAlignment = Alignment.CenterVertically) {
                            Row(Modifier.weight(weights[0]).padding(start = 12.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                                Art("ic-crown-row", Modifier.size(40.u, 30.u), animate = false)
                                Column {
                                    Txt(l.name, 24, maxLines = 1)
                                    Txt("ID ${l.lobbyId}", 16, color = C.Cream.copy(alpha = 0.8f))
                                }
                            }
                            Cell(weights[1]) {
                                Box(
                                    Modifier.clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(if (l.gameMode == "banker") listOf(Color(0xFF8A5A0A), Color(0xFF3A2402)) else listOf(Color(0xFFA3122A), Color(0xFF4A0612))))
                                        .border(3.u, if (l.gameMode == "banker") Color(0xFFFFC531) else Color(0xFFFF8A9A), RoundedCornerShape(999.u)).padding(horizontal = 12.u, vertical = 2.u),
                                ) { Txt(l.gameModeLabel, 19, color = if (l.gameMode == "banker") C.Gold else Color.White, maxLines = 1) }
                            }
                            Cell(weights[2]) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.u)) { ChipIcon(28); Txt(l.betChips.joinToString("/") { fmt(it) }, 24, maxLines = 1) } }
                            Cell(weights[3]) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.u)) { ChipIcon(28); Txt(fmt(l.minEntry), 24) }
                                    if (l.keyFee > 0) Txt(keysLabel(l.keyFee), 16, color = C.Gold)
                                }
                            }
                            Cell(weights[4]) { Txt("${l.preparationSeconds}s", 24) }
                            Cell(weights[5]) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) { Art("ic-people-white", Modifier.size(29.u, 22.u), animate = false); Txt("${l.players}/${l.maxPlayers}", 24) } }
                            Cell(weights[6]) { TypeBadge(l.type, 19) }
                            Cell(weights[7]) {
                                when {
                                    l.isMine -> CandyButton("▶ Return", Modifier.size(170.u, 48.u), Tone.Green, size = 24) { Nav.go(Route.Room(l.id)) }
                                    !l.canJoin -> Box(Modifier.size(170.u, 48.u).clip(RoundedCornerShape(999.u)).background(Color(0x59000000)).border(3.u, Color(0x40FFFFFF), RoundedCornerShape(999.u)), contentAlignment = Alignment.Center) {
                                        Txt(if (l.status == "in_game") "In Game" else if (l.status == "full") "Full" else "Closed", 22, color = Color(0xB3FFFFFF))
                                    }
                                    else -> CandyButton("▶ Join", Modifier.size(170.u, 48.u), size = 26, enabled = !busy) { joinFor = l }
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
            Row(Modifier.at(540, 816), horizontalArrangement = Arrangement.spacedBy(16.u), verticalAlignment = Alignment.CenterVertically) {
                PageButton("«", page > 1, false) { page = 1 }
                PageButton("‹", page > 1, false) { page-- }
                Row(Modifier.height(62.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF1D0306)).border(4.u, Color(0xFFD9A441), RoundedCornerShape(999.u)).padding(horizontal = 32.u), verticalAlignment = Alignment.CenterVertically) {
                    Txt("Page ", 28); Txt("$page", 28, color = C.Gold); Txt(" of $pages", 28)
                }
                PageButton("›", page < pages, true) { page++ }
                PageButton("»", page < pages, true) { page = pages }
            }
        }
        if (myLobby != null && list?.rows?.none { it.id == myLobby } == true) {
            Box(Modifier.at(24, 820).tap { Nav.go(Route.Room(myLobby)) }.clip(RoundedCornerShape(999.u)).background(Color(0xF20F2A1C)).border(4.u, Color(0xFF4EE36B), RoundedCornerShape(999.u)).padding(horizontal = 24.u, vertical = 8.u)) {
                Txt("You are in a lobby — tap to return", 22)
            }
        }
        list?.otherTableId?.let { t ->
            Box(Modifier.at(24, 800).widthIn(max = 480.u).tap { Nav.go(Route.Play(t)) }.clip(RoundedCornerShape(22.u)).background(Color(0xF23A2A02)).border(4.u, Color(0xFFFFD34D), RoundedCornerShape(22.u)).padding(horizontal = 20.u, vertical = 8.u)) {
                Txt("You have a seat at another table — tap to go there (leave it to join a lobby)", 20)
            }
        }

        // ---- popups ----
        when (panel) {
            "create" -> CreateLobbyModal(null, balances.chips, balances.keys, list?.tiers ?: LobbyTier.DEFAULT, { panel = null }) { panel = null; enter(it) }
            "settings" -> SettingsPanel { panel = null }
            "shop" -> ShopPanel { panel = null }
            "avatar" -> AvatarPicker { panel = null }
            "friends" -> Modal("Friends", { panel = null }, width = 620) { FriendsPanel(Modifier.fillMaxWidth().height(560.u)) }
        }
        joinFor?.let { l ->
            JoinLobbyModal(l, balances.chips, balances.keys, { joinFor = null }) { password ->
                try {
                    val d = LobbyDetail.of(Api.post("/lobbies/${l.id}/join", if (password != null) Api.body("password" to password) else null).data())
                    Sound.play("chip"); joinFor = null; enter(d); null
                } catch (e: Exception) { Sound.play("lose"); load(); errorText(e) }
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
                Txt("Leaving the Multiplayer Lobby also removes you from this lobby. $effect", 24, color = Color(0xD9FFFFFF), align = TextAlign.Center, modifier = Modifier.padding(top = 12.u))
                Row(Modifier.padding(top = 28.u), horizontalArrangement = Arrangement.spacedBy(24.u)) {
                    CandyButton("Stay", Modifier.size(240.u, 78.u), Tone.Dark, size = 30) { leaveAsk = null }
                    CandyButton(if (busy) "Leaving…" else "Leave Lobby", Modifier.size(300.u, 78.u), size = 30, enabled = !busy) {
                        busy = true
                        scope.launch {
                            try { Api.post("/tables/${d.tableId}/leave"); Session.walletChanged(); leaveAsk = null; Nav.reset(Route.Home()) } catch (e: Exception) { toast.show(false, errorText(e)); leaveAsk = null; load() }
                            busy = false
                        }
                    }
                }
            }
        }
        ToastHost(toast, 150)
    }
}

/** A balance pill (Chips / Keys) in a gold frame — display only. */
@Composable
private fun BalancePill(modifier: Modifier, icon: String, iconSize: Int, amount: Double?, fill: List<Color>, endPad: Int) {
    Box(modifier.lip(6, Color(0xFF7A3E00), 999).goldRim(999, 5).padding(5.u)) {
        Row(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(fill)).padding(start = 16.u, end = 8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
            Art(icon, Modifier.size(iconSize.u), animate = false)
            Txt(amount?.let(::fmtWhole) ?: "…", 38, modifier = Modifier.weight(1f).padding(end = endPad.u), align = TextAlign.Center, maxLines = 1)
        }
    }
}

/** A round top-bar icon (sound, settings). */
@Composable
private fun TopIcon(x: Int, label: String, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.at(x, 14, 92, 92).tap(label = label, onClick = onClick).lip(6, Color(0xFF1A0204), 999).clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Color(0xFF8A1A1F), Color(0xFF3A0406)))).border(5.u, Color(0xFFFFC531), CircleShape),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun SideItem(label: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().tap(label = label, onClick = onClick).padding(vertical = 8.u), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.height(78.u), contentAlignment = Alignment.Center) { icon() }
        Txt(label, 22, stroke = Color(0x99000000), strokeWidth = 3)
    }
}

@Composable
private fun PageButton(t: String, enabled: Boolean, red: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(86.u, 62.u).alpha(if (enabled) 1f else 0.4f).tap(enabled = enabled, label = t, onClick = onClick).clip(RoundedCornerShape(999.u))
            .background(Brush.verticalGradient(if (red) listOf(Color(0xFFFF6B5C), Color(0xFFB3121A)) else listOf(Color(0xFF6A1218), Color(0xFF33060A))))
            .border(4.u, if (red) Color(0xFFFFC2C2) else Color(0xFFD9A441), RoundedCornerShape(999.u)),
        contentAlignment = Alignment.Center,
    ) { Txt(t, 34, color = if (red) Color.White else C.Cream) }
}

/** Public / Private badge (LobbyUI `TypeBadge`). */
@Composable
fun TypeBadge(type: String, size: Int = 19) {
    val private = type == "private"
    Row(
        Modifier.clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(if (private) listOf(Color(0xFF5A3A0A), Color(0xFF2A1A02)) else listOf(Color(0xFF3A2A9A), Color(0xFF1A1260))))
            .border(3.u, if (private) Color(0xFFFFD34D) else Color(0xFF9AA6FF), RoundedCornerShape(999.u)).padding(horizontal = 16.u, vertical = 4.u),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u),
    ) {
        if (private) Art("ic-lock", Modifier.size((size + 3).u), animate = false) else Art("ic-people-white", Modifier.size((size + 5).u, (size + 1).u), animate = false)
        Txt(if (private) "Private" else "Public", size, color = if (private) C.Gold else Color.White)
    }
}

/** A candy button with custom content (icon + label). */
@Composable
fun CandyButtonRow(modifier: Modifier, tone: Tone, enabled: Boolean = true, onClick: () -> Unit, content: @Composable () -> Unit) {
    Row(
        modifier.alpha(if (enabled) 1f else 0.55f).tap(enabled = enabled, onClick = onClick).lip(tone.lipDy, tone.lip, 999).clip(RoundedCornerShape(999.u))
            .background(Brush.verticalGradient(tone.fill)).gloss(dome = false).border(4.u, tone.edge, RoundedCornerShape(999.u)),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) { content() }
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

private const val ROUND_BANK_RULE = "12 rounds · the owner banks first, then the banker rotates clockwise (a banker needs 6× the maximum bet)."
private val FieldShape @Composable get() = RoundedCornerShape(16.u)

/** A compact labelled row (CreateLobbyModal `Row`): label left, control right, hint / error underneath. */
@Composable
private fun FormRow(label: String, error: String? = null, hint: String? = null, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 10.u)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Txt(label, 23, color = Color(0xFFFFE9B0), modifier = Modifier.width(190.u))
            Box(Modifier.weight(1f)) { content() }
        }
        (error ?: hint)?.let { Txt(it, 17, color = if (error != null) Color(0xFFFF9AA8) else Color(0x99FFFFFF), font = Body, weight = FontWeight.Bold, modifier = Modifier.padding(start = 206.u, top = 2.u)) }
    }
}

/** The popup input frame (LobbyUI `inputClass`, compact). */
@Composable
private fun FieldBox(modifier: Modifier = Modifier, focused: Boolean = false, content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit) {
    Box(
        modifier.fillMaxWidth().height(52.u).clip(FieldShape).background(Color(0xFF1D0306)).border(3.u, if (focused) Color(0xFFFFE14D) else Color(0xFFD9A441), FieldShape).padding(horizontal = 20.u),
        contentAlignment = Alignment.CenterStart, content = content,
    )
}

/** The eye toggle (LobbyUI `EyeButton`). */
@Composable
private fun EyeToggle(shown: Boolean, label: String, modifier: Modifier, onToggle: () -> Unit) {
    androidx.compose.foundation.Canvas(modifier.size(30.u).tap(label = if (shown) "Hide $label" else "Show $label", onClick = onToggle)) {
        val k = size.width / 40f
        val c = Color(0xFFFFE9B0)
        val eye = androidx.compose.ui.graphics.Path().apply { moveTo(4 * k, 20 * k); quadraticTo(20 * k, 6 * k, 36 * k, 20 * k); quadraticTo(20 * k, 34 * k, 4 * k, 20 * k); close() }
        drawPath(eye, c, style = androidx.compose.ui.graphics.drawscope.Stroke(3 * k))
        drawCircle(c, 5 * k, androidx.compose.ui.geometry.Offset(20 * k, 20 * k))
        if (!shown) drawLine(c, androidx.compose.ui.geometry.Offset(8 * k, 34 * k), androidx.compose.ui.geometry.Offset(32 * k, 6 * k), 3.4f * k, androidx.compose.ui.graphics.StrokeCap.Round)
    }
}

/** A dropdown (LobbyUI `Select`): the field with a gold chevron; tapping it lists the options. */
@Composable
private fun <T> LobbySelect(label: String, value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        FieldBox(Modifier.tap(label = label) { open = !open }, focused = open) {
            Txt(options.firstOrNull { it.first == value }?.second ?: "", 22, font = Body, weight = FontWeight.Bold, maxLines = 1)
            androidx.compose.foundation.Canvas(Modifier.align(Alignment.CenterEnd).size(24.u).rotate(if (open) 180f else 0f)) {
                val k = size.width / 20f
                val p = androidx.compose.ui.graphics.Path().apply { moveTo(4 * k, 7 * k); lineTo(10 * k, 13 * k); lineTo(16 * k, 7 * k) }
                drawPath(p, Color(0xFFFFE14D), style = androidx.compose.ui.graphics.drawscope.Stroke(3 * k, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
            }
        }
        if (open) {
            androidx.compose.ui.window.Popup(alignment = Alignment.TopStart, offset = androidx.compose.ui.unit.IntOffset(0, (56f * ph.pusoy13.game.ui.LocalUnit.current).toInt()), onDismissRequest = { open = false }, properties = androidx.compose.ui.window.PopupProperties(focusable = true)) {
                Column(Modifier.width(500.u).clip(FieldShape).background(Color(0xFF2E0306)).border(3.u, Color(0xFFFFE14D), FieldShape).padding(vertical = 6.u)) {
                    options.forEach { (v, text) ->
                        Box(Modifier.fillMaxWidth().tap { onChange(v); open = false }.background(if (v == value) Color(0x40FFD34D) else Color.Transparent).padding(horizontal = 20.u, vertical = 10.u)) {
                            Txt(text, 22, color = if (v == value) Color(0xFFFFE14D) else Color.White, font = Body, weight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Create Lobby popup (components/lobby/CreateLobbyModal.tsx, compact: fits the screen; the fields
 * scroll inside it while the buttons stay visible). Name, optional password (empty = Public, set =
 * Private, shown live), entry tier (Minimum Entry with its own in-game bets and Keys fee) and
 * Preparation Time. Round Bank only; no bet here (bets are chosen in the game). The server checks
 * Chips and Keys, gives the lobby its ID and seats you as owner. With `edit`, the owner changes name /
 * password / time.
 */
@Composable
fun CreateLobbyModal(edit: LobbyDetail?, chips: Double?, keys: Double?, tiers: List<LobbyTier>, onClose: () -> Unit, onSaved: (LobbyDetail) -> Unit) {
    val name = remember { mutableStateOf(edit?.summary?.name ?: "") }
    val password = remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var clearPw by remember { mutableStateOf(false) }
    var minEntry by remember { mutableIntStateOf(edit?.summary?.minEntry?.toInt() ?: tiers.firstOrNull()?.minEntry ?: 100) }
    var prep by remember { mutableIntStateOf(edit?.summary?.preparationSeconds ?: 45) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val wasPrivate = edit?.summary?.type == "private"
    val type = if (password.value.isNotEmpty()) "private" else if (wasPrivate && !clearPw) "private" else "public"
    val tier = tiers.find { it.minEntry == minEntry } ?: tiers.first()
    val problem = if (edit != null) null else entryProblem(tier.minEntry.toDouble(), tier.bets.map { it.toDouble() }, tier.keys, chips, keys)
    if (name.value.length > NAME_MAX + 5) name.value = name.value.take(NAME_MAX + 5)
    if (password.value.length > 40) password.value = password.value.take(40)

    val submit: () -> Unit = submit@{
        if (busy) return@submit
        val n = name.value.trim()
        val p = password.value
        val problems = buildMap {
            if (n.isEmpty()) put("name", "Enter a lobby name.") else if (n.length < 2) put("name", "The lobby name needs at least 2 characters.") else if (n.length > NAME_MAX) put("name", "The lobby name can be at most $NAME_MAX characters.")
            if (p.isNotEmpty() && p.length < 4) put("password", "A lobby password needs at least 4 characters.") else if (p.length > 32) put("password", "A lobby password can be at most 32 characters.")
        }
        if (problems.isNotEmpty()) { errors = problems; Sound.play("lose"); return@submit }
        if (problem != null) { errors = mapOf("form" to problem); Sound.play("lose"); return@submit }
        busy = true
        errors = emptyMap()
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

    CompactModal(
        if (edit != null) "Lobby Settings" else "Create Lobby", onClose, width = 820, maxHeight = 780,
        footer = {
            errors["form"]?.let {
                Box(Modifier.padding(bottom = 8.u).fillMaxWidth().clip(RoundedCornerShape(999.u)).background(Color(0xFF3A0D14)).padding(horizontal = 20.u, vertical = 6.u), contentAlignment = Alignment.Center) {
                    Txt(it, 19, color = Color(0xFFFFB3BD), font = Body, weight = FontWeight.Bold, align = TextAlign.Center)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(24.u)) {
                CandyButton("Cancel", Modifier.size(240.u, 66.u), Tone.Dark, size = 28, onClick = onClose)
                CandyButton(if (busy) (if (edit != null) "Saving…" else "Creating…") else if (edit != null) "Save" else "Create Lobby", Modifier.size(300.u, 66.u), Tone.Purple, size = 30, enabled = !busy, onClick = submit)
            }
        },
    ) {
        FormRow("Lobby Name", errors["name"], "${name.value.trim().length}/$NAME_MAX") {
            FieldBox { ph.pusoy13.game.screens.BareInput(name, "e.g. 553 Rookie Room", Modifier.fillMaxWidth(), hintColor = Color(0x59FFFFFF), size = 22) }
        }
        FormRow(
            "Password", errors["password"],
            if (wasPrivate) (if (clearPw) "The password will be removed: anyone can join." else "Leave empty to keep the current password.") else "Optional — leave empty for a public lobby.",
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                FieldBox(Modifier.weight(1f)) {
                    ph.pusoy13.game.screens.BareInput(password, if (wasPrivate) "Keep current password" else "No password", Modifier.fillMaxWidth().padding(end = 44.u), hintColor = Color(0x59FFFFFF), size = 22, password = true, shown = showPw)
                    EyeToggle(showPw, "password", Modifier.align(Alignment.CenterEnd)) { showPw = !showPw }
                }
                if (wasPrivate && password.value.isEmpty()) {
                    Box(Modifier.tap { clearPw = !clearPw }.clip(RoundedCornerShape(999.u)).border(2.u, Color(0x66FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 12.u, vertical = 6.u)) {
                        Txt(if (clearPw) "Keep" else "Remove", 17, color = Color(0xD9FFFFFF), font = Body, weight = FontWeight.Bold)
                    }
                }
                TypeBadge(type, 19)
            }
        }
        if (edit == null) {
            FormRow("Type of Game", hint = ROUND_BANK_RULE) {
                FieldBox { Txt("Round Bank", 22, font = Body, weight = FontWeight.Bold) }
            }
            FormRow("Minimum Entry") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                    ChipIcon(34)
                    Box(Modifier.weight(1f)) { LobbySelect("Minimum Entry", minEntry, tiers.map { it.minEntry to "${fmt(it.minEntry)} Chips · ${keysLabel(it.keys)}" }) { minEntry = it } }
                }
            }
            // What this tier means in the game: its only bets, and the Keys fee paid when the game starts.
            Column(
                Modifier.padding(start = 206.u, bottom = 10.u).fillMaxWidth().clip(RoundedCornerShape(18.u)).background(Color(0xCC1D0306)).border(3.u, Color(0x99D9A441), RoundedCornerShape(18.u)).padding(horizontal = 16.u, vertical = 8.u),
            ) {
                val body = androidx.compose.ui.text.TextStyle(fontFamily = Body, fontWeight = FontWeight.Bold, fontSize = 18.ts, lineHeight = 24.ts, color = Color(0xD9FFFFFF))
                val gold = androidx.compose.ui.text.SpanStyle(color = Color(0xFFFFE14D), fontWeight = FontWeight.Black)
                androidx.compose.foundation.text.BasicText(androidx.compose.ui.text.buildAnnotatedString {
                    append("In-game bets: "); withStyle(gold) { append("${tier.bets.joinToString(" / ") { fmt(it) }} Chips") }; append(" · chosen each round in the game · hold 2× your bet.")
                }, style = body)
                androidx.compose.foundation.text.BasicText(androidx.compose.ui.text.buildAnnotatedString {
                    append("Entry fee: "); withStyle(gold) { append(keysLabel(tier.keys)) }; append(", deducted once when the game starts.")
                }, style = body)
                if (chips != null || keys != null) {
                    Txt("You have ${chips?.let { "${fmtWhole(it)} Chips" } ?: "…"} · ${keys?.let { keysLabel(it.toInt()) } ?: "…"}", 18, color = if (problem != null) Color(0xFFFF9AA8) else Color(0x99FFFFFF), font = Body, weight = FontWeight.Bold)
                }
            }
        }
        FormRow("Preparation Time", hint = "Time to arrange your 13 cards each round") {
            LobbySelect("Preparation Time", prep, PREPARATION_SECONDS.map { it to "$it Seconds" }) { prep = it }
        }
    }
}
