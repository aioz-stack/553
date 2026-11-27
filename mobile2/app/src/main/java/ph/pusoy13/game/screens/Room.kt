package ph.pusoy13.game.screens

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
                delay(150)
                load()
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
            delay(400)
            Nav.replace(Route.Play(l.tableId))
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
            RoundIcon("Back to lobby", Modifier, onClick = { Nav.replace(Route.Lobby) }) { Txt("←", 40, color = C.Gold) }
            RoundIcon("Settings", Modifier, onClick = { panel = "settings" }) { Txt("⚙", 42, color = C.Gold) }
            RoundIcon("How it works", Modifier, onClick = { panel = "help" }) { Txt("?", 42, color = C.Gold) }
        }
        Art("mini-crest", Modifier.at(290, 6, 240, 140))

        // Lobby info (top right)
        if (l != null) {
            Column(Modifier.at(1040, 16).width(540.u), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.u)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.u)) {
                    ChipIcon(40)
                    Txt(l.summary.gameModeLabel, 30)
                    Pill(if (l.summary.type == "private") "🔒 Private" else "Public", bg = if (l.summary.type == "private") Color(0xFF5A1A9A) else Color(0xFF13643A), size = 17)
                }
                Pill("${l.summary.name} · ID ${l.summary.lobbyId}", size = 20, color = C.Cream)
                Pill("Bets ${l.summary.betChips.joinToString("/") { fmt(it) }} · Min Entry ${fmt(l.summary.minEntry)}${if (l.summary.keyFee > 0) " · ${keysLabel(l.summary.keyFee)}" else ""} · Prep ${l.summary.preparationSeconds}s", size = 17)
                Pill("Your Chips ${balances.chips?.let(::fmtWhole) ?: "…"}${if (l.summary.keyFee > 0) " · Keys ${fmt(l.myKeys)}" else ""}", size = 18, color = C.Gold)
                if (l.isSeated && l.myBet != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Txt("Your bet", 18, color = C.White.copy(alpha = 0.8f))
                        l.summary.betChips.forEach { b ->
                            val on = b == l.myBet
                            CandyButton(fmt(b), Modifier.size(90.u, 46.u), if (on) Tone.Gold else Tone.Dark, size = 20, enabled = !busy && !counting && !on) {
                                act({ Api.post("/lobbies/${l.summary.id}/bet", Api.body("bet" to b)) }) { Sound.play("chip") }
                            }
                        }
                    }
                    l.myRequiredChips?.let { Txt("Needs ${fmt(it)} Chips (2× bet, min entry)", 16, color = if ((balances.chips ?: 0.0) < it) C.Pink else C.White.copy(alpha = 0.7f)) }
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
                Column(Modifier.at(500, 330).width(600.u), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.u)) {
                    if (!l.allConfirmed || !l.isSeated) {
                        Txt(
                            if (!l.isSeated) (gone ?: "Join this lobby to pick a seat") else if (needsConfirm) "Tap an available seat, then Confirm Seat" else l.startHint,
                            30, align = TextAlign.Center, stroke = Color(0x99000000),
                        )
                    } else {
                        Txt("${if (l.seatedCount == 4) "All four" else "All ${l.seatedCount}"} seats confirmed · ${l.readyCount}/${l.seatedCount} pressed Start", 26, color = C.Cream, align = TextAlign.Center)
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
                    Row(Modifier.at(400, 790), horizontalArrangement = Arrangement.spacedBy(20.u)) {
                        CandyButton("Change Seat", Modifier.size(380.u, 92.u), Tone.Blue, size = 36, enabled = !busy && pick != null) { pick = null }
                        CandyButton("Confirm Seat", Modifier.size(400.u, 92.u), size = 38, enabled = !busy && needsConfirm) {
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
    Column(Modifier.at(x - TILE / 2, y - TILE / 2 - 10).width(TILE.u), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(TILE.u).tap(enabled = canPick && !other, onClick = onPick).clip(RoundedCornerShape(30.u))
                .background(if (free) Brush.radialGradient(listOf(Color(0x99FFE14D), Color(0x33FFC531))) else Brush.verticalGradient(listOf(Color(0x66000000), Color(0x66000000))))
                .border(5.u, if (selected) C.Gold else if (free) Color(0xFFFFE9A0) else Color(0x66FFFFFF), RoundedCornerShape(30.u)),
            contentAlignment = Alignment.Center,
        ) {
            when {
                free -> Txt("＋", 80, color = C.Gold)
                other -> Box {
                    Box(Modifier.border(4.u, if (seat.isBanker) Color(0xFF7CC8FF) else Color.White, RoundedCornerShape(22.u))) { Avatar(seat.avatar, seat.userId, 150, square = true, offline = !seat.isConnected) }
                    if (seat.state == "reserved") Pill("Reserved", Modifier.align(Alignment.BottomCenter), color = C.Gold, size = 16)
                    if (!seat.isConnected) Pill("offline", Modifier.align(Alignment.TopCenter), size = 14)
                    if (seat.isOwner) Txt("👑", 34, modifier = Modifier.align(Alignment.TopCenter).padding(bottom = 140.u))
                    if (seat.isBanker) Pill("BANKER", Modifier.align(Alignment.TopStart), bg = Color(0xFFE08A00), color = C.Brown, size = 14)
                }
                seat.isYou && me != null -> Box {
                    Box(Modifier.border(5.u, if (me.third) Color(0xFF5DFF7A) else C.Gold, RoundedCornerShape(24.u))) { Avatar(me.first, me.second, 150, square = true) }
                    if (me.third) Pill(if (myReady) "Ready ✓" else "Seat locked ✓", Modifier.align(Alignment.BottomCenter), bg = C.Green, size = 15)
                }
            }
            if (canKick) {
                Box(Modifier.align(Alignment.TopEnd).padding(4.u).size(44.u).tap(label = "Remove ${seat.name}", onClick = onKick).clip(CircleShape).background(Color(0xFFD81E3C)).border(3.u, Color.White, CircleShape), contentAlignment = Alignment.Center) { Txt("✕", 22) }
            }
        }
        Pill(if (other) seat.name ?: "" else if (selected) "Seat ${seat.seat} (Selected)" else "Seat ${seat.seat}", Modifier.padding(top = 8.u), bg = if (selected) C.GoldDeep else Color(0xCC1A0A02), color = if (selected) C.Brown else C.White, size = 22)
        if (other && showReady) Pill(if (seat.isReady) "Ready ✓" else "Not ready", Modifier.padding(top = 4.u), bg = if (seat.isReady) C.Green else Color(0x8C000000), size = 16)
    }
}
