package ph.pusoy13.game.screens

import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.softGlow
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.ApiException
import ph.pusoy13.game.core.Echo
import ph.pusoy13.game.core.LobbyDetail
import ph.pusoy13.game.core.LobbySeat
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.keysLabel
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.Field
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.RoundIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.ToastHost
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.rememberToast
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

private val SEAT_AT = mapOf(1 to (800 to 170), 2 to (262 to 410), 3 to (1338 to 410), 4 to (800 to 650))
private const val TILE = 196

val WAITING_EVENTS = listOf(
    "player.joined", "player.left", "player.ready", "player.seated", "player.updated", "table.full", "match.countdown",
    "match.countdown_cancelled", "match.started", "match.completed", "player.disconnected", "player.reconnected",
)

/**
 * Choose Your Seat — where Create Lobby and Join land. Tap a free seat, Confirm Seat saves it (the
 * server never puts two players on one seat). When everyone seated has confirmed, Start appears;
 * once every player pressed it the server runs a synchronized countdown and starts the match, and
 * everyone moves into the game. All state comes from GET /lobbies/{id}, which is also the heartbeat
 * (every 3 s, every second during the countdown) plus Reverb events on `presence-table.{id}`.
 */
@Composable
fun RoomScreen(roomId: Int) {
    val user by Session.user.collectAsState()
    val balances by Session.balances.collectAsState()
    var lobby by remember { mutableStateOf<LobbyDetail?>(null) }
    var gone by remember { mutableStateOf<String?>(null) }
    var pick by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableLongStateOf(0L) }
    var known by remember { mutableStateOf<Set<Int>?>(null) }
    var wasSeated by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val toast = rememberToast()
    val scope = rememberCoroutineScope()

    val load: suspend () -> Unit = load@{
        if (user == null) return@load
        val sent = System.currentTimeMillis()
        try {
            val d = LobbyDetail.of(Api.get("/lobbies/$roomId").data())
            val got = System.currentTimeMillis()
            d.serverTime?.let { offset = it - (sent + got) / 2 }
            val ids = d.seats.mapNotNull { it.userId }.toSet()
            known?.let { before ->
                d.seats.filter { it.userId != null && it.userId !in before && it.userId != user?.id }.forEach {
                    toast.show(true, "${it.name} joined the table")
                    Sound.play("chip")
                }
            }
            known = ids
            lobby = d
            if (d.isSeated) wasSeated = true else if (wasSeated) {
                wasSeated = false
                toast.show(false, "You are no longer in this lobby.")
            }
            if (pick != null && d.mySeat == pick && d.mySeatConfirmed) pick = null
        } catch (e: ApiException) {
            if (e.status == 404) gone = "This lobby no longer exists."
        } catch (_: Exception) {
        }
    }
    val refresh: () -> Unit = { scope.launch { load() } }

    LaunchedEffect(user?.id) { load() }
    val l = lobby
    val counting = l?.countdownEndsAt != null
    // Live: table events while seated, plus polling (every 3 s, every second during the countdown).
    val tableId = if (l?.isSeated == true) l.tableId else null
    DisposableEffect(tableId) {
        val h = tableId?.let { Echo.listen(Echo.presence("table.$it"), "*") { e, _ -> if (e in WAITING_EVENTS) refresh() } }
        onDispose { h?.remove() }
    }
    LaunchedEffect(tableId, counting) {
        while (true) {
            delay(if (counting) 1_000 else 3_000)
            load()
        }
    }
    LaunchedEffect(Unit) { Session.resumed.collect { load() } }
    // The countdown clock, aligned to the server.
    LaunchedEffect(l?.countdownEndsAt) {
        val ends = l?.countdownEndsAt ?: return@LaunchedEffect
        var lastShown: Long? = null
        while (true) {
            now = System.currentTimeMillis()
            val left = maxOf(0, kotlin.math.ceil((ends - (now + offset)) / 1000.0).toLong())
            if (left != lastShown) {
                Sound.play(if (left == 0L) "start" else "tick")
                lastShown = left
            }
            if (left == 0L) {
                // The server starts the match at 0 (and tells everyone with match.started); look
                // straight away, then a few more times in quick succession until the table is in
                // game, so no phone sits on "Get ready…" for a whole poll interval.
                for (wait in listOf(60L, 300L, 400L, 500L, 750L, 1_000L)) {
                    delay(wait)
                    load()
                    if (lobby?.tableStatus == "IN_GAME" || lobby?.countdownEndsAt == null) break
                }
                break
            }
            delay(100)
        }
    }
    // Seats, starts and matches move Chips: reload the balance when any of them changes.
    LaunchedEffect(l?.tableStatus, l?.mySeat, l?.summary?.players, l?.countdownEndsAt) { Session.reloadWallets() }
    // The match started: into the game table.
    LaunchedEffect(l?.isSeated, l?.tableStatus) {
        if (l != null && l.isSeated && l.tableStatus == "IN_GAME" && l.tableId != null) {
            Nav.replace(Route.Play(l.tableId)) // straight in: every phone moves on the same server signal
        }
    }

    val act: (suspend () -> Unit, (() -> Unit)?) -> Unit = { fn, after ->
        if (!busy) {
            busy = true
            scope.launch {
                try {
                    fn()
                    after?.invoke()
                } catch (e: Exception) {
                    Sound.play("lose")
                    toast.show(false, errorText(e))
                }
                load()
                busy = false
            }
        }
    }

    val count = l?.countdownEndsAt?.let { maxOf(0, kotlin.math.ceil((it - (now + offset)) / 1000.0).toInt()) }
    val mySeat = pick ?: l?.mySeat
    val canPick = l?.isSeated == true && !counting && l.tableStatus != "IN_GAME"
    val needsConfirm = l?.isSeated == true && (if (pick != null) pick != l.mySeat || !l.mySeatConfirmed else !l.mySeatConfirmed)

    Stage(background = { Scene("lantern") }) {
        Art("table", Modifier.fillMaxSize())

        Row(Modifier.at(24, 20), horizontalArrangement = Arrangement.spacedBy(12.u)) {
            RoundIcon("Back to lobby", Modifier, onClick = { Nav.replace(Route.Lobby) }) { Art("ic-back-gold", Modifier.size(40.u), animate = false) }
            RoundIcon("Settings", Modifier, onClick = { panel = "settings" }) { Art("ic-gear-gold", Modifier.size(40.u), animate = false) }
            RoundIcon("How it works", Modifier, onClick = { panel = "help" }) { Txt("?", 42, color = C.Gold) }
        }
        Art("mini-crest", Modifier.at(290, 6, 240, 140))

        // Lobby info (top right)
        if (l != null) {
            Column(Modifier.at(1148, 18).width(430.u), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.u)) {
                Box(Modifier.fillMaxWidth().lip(6, Color(0xFF7A3E00), 24).goldRim(24, 5).padding(5.u)) {
                    Row(Modifier.fillMaxWidth().height(64.u).clip(RoundedCornerShape(19.u)).background(Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF5A0609)))).padding(horizontal = 16.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                        ChipIcon(44)
                        Txt(l.summary.gameModeLabel, 30, modifier = Modifier.weight(1f), align = TextAlign.Center)
                        TypeBadge(l.summary.type, 17)
                    }
                }
                Box(Modifier.clip(RoundedCornerShape(999.u)).background(Color(0x99000000)).padding(horizontal = 16.u, vertical = 2.u)) { Runs(21, "${l.summary.name} · " to Color.White, "ID ${l.summary.lobbyId}" to C.Gold) }
                Pill("Bets ${l.summary.betChips.joinToString("/") { fmt(it) }} · Min Entry ${fmt(l.summary.minEntry)}${if (l.summary.keyFee > 0) " · ${keysLabel(l.summary.keyFee)}" else ""} · Prep ${l.summary.preparationSeconds}s", size = 17)
                Pill("Your Chips ${balances.chips?.let(::fmtWhole) ?: "…"}${if (l.summary.keyFee > 0) " · Keys ${fmt(l.myKeys)}" else ""}", size = 18, color = C.Gold)
                if (l.isSeated && l.myBet != null) {
                  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.u)).background(Color(0x99000000)).padding(horizontal = 12.u, vertical = 6.u), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.u)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Txt("Your Bet", 18, color = Color(0xD9FFFFFF))
                        l.summary.betChips.forEach { b ->
                            val on = b == l.myBet
                            Box(
                                Modifier.alpha(if (busy || counting) 0.5f else 1f).tap(enabled = !busy && !counting && !on, label = "Bet ${fmt(b)}") { act({ Api.post("/lobbies/${l.summary.id}/bet", Api.body("bet" to b)) }) { Sound.play("chip") } }
                                    .clip(RoundedCornerShape(999.u)).background(if (on) Color(0xFFE08A00) else Color.Transparent).border(2.u, if (on) Color(0xFFFFE14D) else Color(0x66FFFFFF), RoundedCornerShape(999.u)).padding(horizontal = 12.u),
                            ) { Txt(fmt(b), 18, color = if (on) Color(0xFF3B1D00) else Color(0xD9FFFFFF)) }
                        }
                    }
                    l.myRequiredChips?.let { Txt("Needs ${fmt(it)} Chips (2× bet, min entry)" + if (l.summary.keyFee > 0) " · ${keysLabel(l.summary.keyFee)} deducted at start" else "", 16, color = if ((balances.chips ?: 0.0) < it) C.Pink else C.White.copy(alpha = 0.7f), align = TextAlign.End) }
                  }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.u)) {
                    Pill("${l.summary.players}/${l.summary.maxPlayers} Players", size = 22, color = C.Gold)
                    if (l.isOwner && !counting && l.tableStatus != "IN_GAME") CandyButton("Edit", Modifier.size(110.u, 44.u), Tone.Dark, size = 20) { panel = "edit" }
                }
            }

            // Seats
            l.seats.forEach { s ->
                SeatTile(
                    s, selected = pick == s.seat, mine = s.isYou || pick == s.seat,
                    canPick = canPick && (s.userId == null || s.isYou),
                    canKick = l.isOwner && s.userId != null && !s.isYou && !counting && l.tableStatus != "IN_GAME",
                    showReady = l.allConfirmed, me = user?.let { Triple(it.avatar, it.id, l.mySeatConfirmed && pick == null) },
                    onPick = { if (s.userId == null || s.isYou) pick = s.seat },
                    onKick = { act({ Api.post("/lobbies/${l.summary.id}/kick", Api.body("user_id" to s.userId)) }) { toast.show(true, "${s.name} was removed.") } },
                    myReady = l.myReady,
                )
            }
            // Your pick (before confirming) shows your avatar on the free seat you chose.
            if (pick != null && l.seats.find { it.seat == pick }?.isYou != true) {
                SEAT_AT[pick!!]?.let { (x, y) ->
                    Box(Modifier.at(x - 75, y - 106).border(5.u, C.Gold, RoundedCornerShape(24.u))) { Avatar(user?.avatar, user?.id, 150, square = true) }
                }
            }

            // Centre: Choose Your Seat → Start
            if (count == null) {
                Column(Modifier.at(420, 338).width(760.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.u)) {
                    if (!l.allConfirmed || !l.isSeated) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.u)) { listOf("♠" to Color(0xFF1A1A1A), "♥" to Color(0xFFE0262F), "♦" to Color(0xFFE0262F), "♣" to Color(0xFF1A1A1A)).forEach { (t, c) -> Txt(t, 44, color = c, font = ph.pusoy13.game.ui.Body) } }
                        Box(Modifier.lip(8, Color(0xFF5A2A00), 30).goldRim(30, 5).padding(5.u)) {
                            Box(Modifier.clip(RoundedCornerShape(25.u)).background(Brush.verticalGradient(listOf(Color(0xFF3A1206), Color(0xFF1A0602)))).padding(horizontal = 48.u, vertical = 8.u)) {
                                Txt("Choose Your Seat", 64, color = Color(0xFFFFD34D), stroke = Color(0xFF5A2A00), strokeWidth = 4, italic = true)
                            }
                        }
                        Txt(
                            if (!l.isSeated) (gone ?: "Join this lobby to pick a seat") else if (needsConfirm) "Tap an available seat, then Confirm Seat" else l.startHint,
                            26, align = TextAlign.Center, modifier = Modifier.padding(top = 4.u),
                        )
                    } else {
                        Txt("${if (l.confirmedCount == 4) "All four seats" else if (l.confirmedCount == l.seatedCount) "All ${l.confirmedCount} seats" else "${l.confirmedCount} seats"} confirmed · ${l.readyCount}/${l.confirmedCount} pressed Start", 26, color = C.Cream, align = TextAlign.Center)
                        if (l.myReady) {
                            Txt(l.startHint, 24, align = TextAlign.Center)
                            Txt("Cancel Start", 20, color = C.White.copy(alpha = 0.75f), modifier = Modifier.tap { act({ Api.post("/lobbies/${l.summary.id}/start", Api.body("ready" to false)) }, null) })
                        } else {
                            CandyButton("START", Modifier.size(420.u, 120.u), size = 60, enabled = !busy && l.canPressStart) {
                                act({ Api.post("/lobbies/${l.summary.id}/start", Api.body("ready" to true)) }) { Sound.play("start") }
                            }
                        }
                    }
                }
            }

            // Bottom actions
            if (l.isSeated && count == null && l.tableStatus != "IN_GAME") {
                if (!l.allConfirmed) {
                    Row(Modifier.at(390, 782), horizontalArrangement = Arrangement.spacedBy(40.u)) {
                        CandyButton("⟳ Change Seat", Modifier.size(380.u, 92.u), Tone.Blue, size = 38, enabled = !busy && pick != null) { pick = null }
                        CandyButton("✓ Confirm Seat", Modifier.size(400.u, 92.u), size = 38, enabled = !busy && needsConfirm) {
                            val seat = pick ?: l.mySeat
                            if (seat != null) act({ Api.post("/lobbies/${l.summary.id}/seat", Api.body("seat" to seat)) }) { Sound.play("chip"); pick = null }
                        }
                    }
                }
                CandyButton("Leave", Modifier.at(30, 810, 180, 64), Tone.Red, size = 26) { panel = "leave" }
            }
            if (!l.isSeated && gone == null && l.summary.canJoin) {
                CandyButton("Join Lobby", Modifier.at(610, 780, 380, 92), size = 40, enabled = !busy) {
                    if (l.summary.type == "private") panel = "password" else act({ Api.post("/lobbies/${l.summary.id}/join") }, null)
                }
            }
        } else if (gone == null) {
            Txt("Loading the lobby…", 34, modifier = Modifier.at(600, 420))
        }
        if (gone != null || l?.summary?.status == "closed") {
            Column(Modifier.at(500, 380).width(600.u), horizontalAlignment = Alignment.CenterHorizontally) {
                Txt(gone ?: "This lobby is closed.", 32, align = TextAlign.Center)
                CandyButton("Back to Lobby", Modifier.padding(top = 16.u).size(380.u, 86.u), size = 34) { Nav.replace(Route.Lobby) }
            }
        }

        // Countdown 3 → 2 → 1 (server-timed)
        if (count != null) {
            Box(Modifier.fillMaxSize().background(Color(0x59000000)), contentAlignment = Alignment.Center) {
                Box(Modifier.size(320.u).clip(CircleShape).border(10.u, C.Gold, CircleShape), contentAlignment = Alignment.Center) {
                    Txt(if (count > 0) "$count" else "GO!", if (count > 0) 220 else 130, color = C.Gold, stroke = Color(0xFF7A3E00), strokeWidth = 12)
                }
            }
        }

        // Popups
        when (panel) {
            "settings" -> SettingsPanel { panel = null }
            "help" -> l?.let {
                Modal("How it works", { panel = null }, width = 900) {
                    listOf(
                        if (it.summary.gameMode == "banker") "12 rounds · the lobby owner is the banker every round." else "12 rounds · the owner banks first, then the banker rotates clockwise (a banker needs 6× the maximum bet).",
                        "Tap an available seat, then Confirm Seat. When every seated player has confirmed, each presses Start.",
                        "A synchronized countdown starts the match for everyone (2 to 4 players).",
                        "Bets are chosen in the game, each round, from this lobby's chips: ${it.summary.betChips.joinToString(" / ") { b -> fmt(b) }}. Hold 2× your bet.",
                        if (it.summary.keyFee > 0) "${keysLabel(it.summary.keyFee)} ${if (it.summary.keyFee == 1) "is" else "are"} deducted once, when the game starts." else "No Keys fee for this lobby.",
                    ).forEach { t -> Txt("• $t", 24, modifier = Modifier.fillMaxWidth().padding(vertical = 4.u)) }
                }
            }
            "edit" -> l?.let { CreateLobbyModal(it, balances.chips, balances.keys, emptyList<ph.pusoy13.game.core.LobbyTier>().ifEmpty { ph.pusoy13.game.core.LobbyTier.DEFAULT }, { panel = null }) { panel = null; refresh() } }
            "leave" -> Modal("Leave Lobby?", { panel = null }, width = 760) {
                Txt("You give up your seat. ${if (l?.isOwner == true) "Ownership passes to the next player (or the lobby closes when you were the last)." else "The others are told right away."}", 24, align = TextAlign.Center)
                Row(Modifier.padding(top = 24.u), horizontalArrangement = Arrangement.spacedBy(24.u)) {
                    CandyButton("Stay", Modifier.size(240.u, 78.u), Tone.Dark, size = 30) { panel = null }
                    CandyButton("Leave Lobby", Modifier.size(300.u, 78.u), size = 30, enabled = !busy) {
                        panel = null
                        act({
                            if (l?.tableId != null && l.isSeated) Api.post("/tables/${l.tableId}/leave")
                            wasSeated = false
                            Session.walletChanged()
                            Nav.replace(Route.Lobby)
                        }, null)
                    }
                }
            }
            "password" -> {
                val pw = remember { mutableStateOf("") }
                Modal("Private Lobby", { panel = null }, width = 700) {
                    Field("Lobby password", pw, Modifier.fillMaxWidth(), password = true, size = 26)
                    CandyButton("Join", Modifier.padding(top = 18.u).size(300.u, 78.u), size = 32, enabled = pw.value.isNotEmpty() && !busy) {
                        panel = null
                        act({ Api.post("/lobbies/$roomId/join", Api.body("password" to pw.value)) }, null)
                    }
                }
            }
        }
        ToastHost(toast, 150)
    }
}

@Composable
private fun SeatTile(
    seat: LobbySeat,
    selected: Boolean,
    mine: Boolean,
    canPick: Boolean,
    canKick: Boolean,
    showReady: Boolean,
    me: Triple<String?, Int, Boolean>?,
    myReady: Boolean,
    onPick: () -> Unit,
    onKick: () -> Unit,
) {
    val (x, y) = SEAT_AT[seat.seat] ?: return
    val other = seat.userId != null && !seat.isYou
    val free = seat.userId == null && !selected && !mine
    val clock = ph.pusoy13.game.ui.LocalClock.current
    Column(Modifier.at(x - TILE / 2, y - TILE / 2 - 10).width(TILE.u), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(TILE.u)
                .then(if (free && canPick && clock != null) Modifier.graphicsLayer {
                    val p = (clock.floatValue % 1.8f) / 1.8f
                    translationY = -3f * density * (0.5f - 0.5f * kotlin.math.cos(2 * Math.PI * p)).toFloat()
                }.drawBehind {
                    val p = (clock.floatValue % 1.8f) / 1.8f
                    val k = (0.5 - 0.5 * kotlin.math.cos(2 * Math.PI * p)).toFloat()
                    softGlow(Color(0xFFFFD34D).copy(alpha = 0.55f * k), 34f * density * k + 1f, 34f * density)
                } else Modifier)
                .then(if (selected && clock != null) Modifier.drawBehind {
                    val p = (clock.floatValue % 1.1f) / 1.1f
                    val k = (0.5 - 0.5 * kotlin.math.cos(2 * Math.PI * p)).toFloat()
                    softGlow(Color(0xFFFFD34D).copy(alpha = 0.75f + 0.2f * k), (22f + 24f * k) * density, 34f * density)
                } else Modifier)
                .alpha(if (other && seat.state == "reserved") 0.8f else 1f)
                .tap(enabled = canPick && !other, onClick = onPick)
                .lip(8, Color(0xFF2A1204), 34)
                .background(Brush.verticalGradient(listOf(Color(0xFF5A2A10), Color(0xFF2A1204))), RoundedCornerShape(34.u))
                .border(6.u, if (selected) Color(0xFFFFE14D) else Color(0xFFD9A441), RoundedCornerShape(34.u)),
            contentAlignment = Alignment.Center,
        ) {
            when {
                free -> Art("ic-person-plus", Modifier.size(78.u), animate = false)
                other -> Box {
                    Box(Modifier.clip(RoundedCornerShape(22.u)).border(4.u, if (seat.isBanker) Color(0xFF7CC8FF) else Color.White, RoundedCornerShape(22.u))) {
                        Avatar(seat.avatar, seat.userId, 150, square = true, offline = !seat.isConnected)
                        if (seat.state == "reserved") Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xA6000000)).padding(vertical = 2.u), contentAlignment = Alignment.Center) { Txt("Reserved", 18, color = C.Gold) }
                        if (!seat.isConnected) Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().background(Color(0xB3000000)), contentAlignment = Alignment.Center) { Txt("offline", 15, font = ph.pusoy13.game.ui.Body) }
                    }
                    if (seat.isBanker) Box(Modifier.align(Alignment.TopStart).offset(x = (-12).u, y = (-12).u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))).border(2.u, Color.White, RoundedCornerShape(999.u)).padding(horizontal = 8.u)) { Txt("BANKER", 14, color = C.Brown) }
                }
                seat.isYou && me != null -> Box(contentAlignment = Alignment.TopCenter) {
                    Box(Modifier.drawBehind { softGlow(Color(0xB3FFD34D), 30f * density, 24f * density) }.clip(RoundedCornerShape(24.u)).border(5.u, if (me.third) Color(0xFF5DFF7A) else Color(0xFFFFE14D), RoundedCornerShape(24.u))) { Avatar(me.first, me.second, 150, square = true) }
                    Box(Modifier.offset(y = (-30).u).lip(4, Color(0xFF7A3E00), 12).clip(RoundedCornerShape(12.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))).border(3.u, Color.White, RoundedCornerShape(12.u)).padding(horizontal = 16.u)) { Txt("YOU", 24, color = C.Brown) }
                    if (me.third) Box(Modifier.align(Alignment.BottomCenter).offset(y = 12.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF13A344)).padding(horizontal = 12.u)) { Txt(if (myReady) "Ready ✓" else "Seat locked ✓", 16) }
                }
            }
            if (other && seat.isOwner) Art("owner-crown", Modifier.align(Alignment.TopCenter).offset(y = (-36).u).size(54.u, 40.u), animate = false)
            if (canKick) {
                Box(Modifier.align(Alignment.TopEnd).offset(x = 12.u, y = (-12).u).size(36.u).tap(label = "Remove ${seat.name}", onClick = onKick).clip(CircleShape).background(Color(0xFFC0101A)).border(2.u, Color.White, CircleShape), contentAlignment = Alignment.Center) { Txt("✕", 18) }
            }
        }
        Box(
            Modifier.padding(top = 8.u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(if (selected) listOf(Color(0xFFFFD34D), Color(0xFFE08A00)) else listOf(Color(0xFF3A1A08), Color(0xFF1A0A02))))
                .border(3.u, if (selected) Color(0xFFFFE14D) else Color(0xFFD9A441), RoundedCornerShape(999.u)).padding(horizontal = 20.u, vertical = 2.u),
        ) { Txt(if (other) seat.name ?: "" else if (selected) "Seat ${seat.seat} (Selected)" else "Seat ${seat.seat}", 24, color = if (selected) C.Brown else Color.White, maxLines = 1) }
        if (other && showReady) Box(Modifier.padding(top = 4.u).clip(RoundedCornerShape(999.u)).background(if (seat.isReady) Color(0xFF13A344) else Color(0x8C000000)).padding(horizontal = 12.u)) { Txt(if (seat.isReady) "Ready ✓" else "Not ready", 17, color = if (seat.isReady) Color.White else Color(0xCCFFFFFF)) }
    }
}
