package ph.pusoy13.game.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.ApiException
import ph.pusoy13.game.core.Echo
import ph.pusoy13.game.core.LUCKY_LABELS
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Rows
import ph.pusoy13.game.core.SeatPlayer
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.SessionState
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.TableState
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.dealtRows
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.json
import ph.pusoy13.game.core.signed
import ph.pusoy13.game.core.str
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.BetChip
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.RoundIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.ToastHost
import ph.pusoy13.game.ui.Toggle
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.WalletPill
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.rememberToast
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

private val TABLE_EVENTS = setOf(
    "player.joined", "player.left", "player.ready", "table.full", "game.started", "game.timer", "player.submitted", "game.all_submitted",
    "game.revealed", "game.scored", "game.results", "player.disconnected", "player.reconnected", "game.cancelled", "player.updated",
    "match.started", "round.started", "banker.assigned", "player.bet", "betting.closed", "player.lucky", "round.completed",
    "match.completed", "match.paused", "match.resumed",
)

private val END_REASON = mapOf(
    "completed" to "All 12 rounds played",
    "not_enough_players" to "Not enough players left",
    "not_enough_eligible_players" to "Not enough players with Chips to play",
    "no_eligible_banker" to "Nobody held enough Chips to be the banker (6× the maximum bet) in time",
)

/** Seconds a round's arrangement is still shown after the deal (the server added it to the deadline). */
private val shownDeals = mutableSetOf<Int>()
private val shownReveals = mutableSetOf<Int>()

/**
 * Multiplayer in-game table for lobby matches, driven entirely by the server: REST state, Reverb
 * events on `presence-table.{id}` (+ `cards.dealt` on your private channel) as signals to re-read
 * it, a heartbeat every 10 s and polling as a fallback — so reconnecting after a drop recovers
 * exactly like a fresh load. Nothing here decides a banker, a bet, a score or a payout.
 */
@Composable
fun PlayScreen(tableId: Int) {
    val user by Session.user.collectAsState()
    val balances by Session.balances.collectAsState()
    val connected by Echo.connected.collectAsState()
    var table by remember { mutableStateOf<TableState?>(null) }
    var session by remember { mutableStateOf<SessionState?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var removed by remember { mutableStateOf(false) }
    var offset by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var busy by remember { mutableStateOf(false) }
    var declaring by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var dealing by remember { mutableStateOf<Int?>(null) }
    var reveal by remember { mutableStateOf<Pair<Int, RevealPlan>?>(null) }
    var lastRows by remember { mutableStateOf<Pair<Int, Rows>?>(null) }
    var autoSubmitted by remember { mutableStateOf<Int?>(null) }
    var autoNoticed by remember { mutableStateOf<Int?>(null) }
    var prevPhase by remember { mutableStateOf<String?>(null) }
    val toast = rememberToast()
    val scope = rememberCoroutineScope()

    // ---- state from the server ----
    var refreshing by remember { mutableStateOf(false) }
    var again by remember { mutableStateOf(false) }
    suspend fun refresh() {
        if (refreshing) { again = true; return }
        refreshing = true
        try {
            val t = TableState.of(Api.get("/tables/$tableId").data())
            table = t
            if (t.currentSessionId != null) {
                val s = SessionState.of(Api.get("/games/${t.currentSessionId}").data())
                s.serverTime?.let { offset = it - System.currentTimeMillis() }
                session = s
            } else session = null
            error = null
        } catch (e: ApiException) {
            if (e.status == 403 || e.status == 404) removed = true
            error = errorText(e)
        } catch (e: Exception) {
            error = errorText(e)
        }
        refreshing = false
        if (again) { again = false; refresh() }
    }
    var burst by remember { mutableStateOf<Job?>(null) }
    val refreshSoon: () -> Unit = {
        burst?.cancel()
        burst = scope.launch { delay(120); refresh() }
    }
    LaunchedEffect(tableId) { refresh() }
    DisposableEffect(tableId, user?.id) {
        val uid = user?.id
        val h1 = Echo.listen(Echo.presence("table.$tableId"), "*") { e, _ -> if (e in TABLE_EVENTS) refreshSoon() }
        val h2 = uid?.let { Echo.listen(Echo.private("user.$it"), "cards.dealt") { _, _ -> refreshSoon() } }
        onDispose { h1.remove(); h2?.remove() }
    }
    // Heartbeat (right away, every 10 s, on resume) and polling (4 s without a socket, 30 s with one).
    LaunchedEffect(tableId) {
        while (true) {
            runCatching { Api.post("/tables/$tableId/heartbeat") }
            delay(10_000)
        }
    }
    LaunchedEffect(tableId, connected) {
        while (true) {
            delay(if (connected) 30_000 else 4_000)
            refresh()
        }
    }
    LaunchedEffect(Unit) { Session.resumed.collect { runCatching { Api.post("/tables/$tableId/heartbeat") }; refresh() } }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(250) } }

    val secondsLeft = { deadline: Long? -> if (deadline == null) 0 else maxOf(0, kotlin.math.ceil((deadline - (now + offset)) / 1000.0).toInt()) }

    val t = table
    val s = session
    val phase = s?.status ?: if (t?.status == "CLOSED") "CLOSED" else "STARTING"
    val betLeft = secondsLeft(if (s?.status == "BETTING") s.bettingDeadline else null)
    val arrangeLeft = secondsLeft(if (s?.status == "ARRANGING") s.arrangementDeadline else null)
    val nextIn = secondsLeft(t?.nextRoundAt)

    // Entry, bets and settlements move Chips: reload every wallet display when the game moves on.
    LaunchedEffect(s?.status, s?.roundNumber, t?.status) { Session.reloadWallets() }
    // Sound cues on phase changes.
    LaunchedEffect(s?.id, s?.status) {
        if (s == null) return@LaunchedEffect
        when (s.status) {
            "BETTING" -> Sound.play("start")
            "ARRANGING" -> Sound.play("deal")
        }
    }
    LaunchedEffect(arrangeLeft) { if (phase == "ARRANGING" && arrangeLeft in 1..5) Sound.play("tick") }
    // No longer seated / ended by the administrator: say so, then leave.
    LaunchedEffect(removed) { if (removed) { delay(2500); Nav.replace(Route.Lobby) } }
    val terminated = t?.status == "CLOSED" && t.endReason == "terminated_by_admin"
    LaunchedEffect(terminated) { if (terminated) { Session.walletChanged(); delay(2500); Nav.reset(Route.Home()) } }

    // Tell the player once per round what the betting timeout did.
    LaunchedEffect(s?.id, s?.myBetType, s?.myAutoBetSkipped) {
        if (s == null || autoNoticed == s.id) return@LaunchedEffect
        if (s.myBetType == "AUTO" && s.myBet != null) {
            autoNoticed = s.id
            toast.show(true, "Time expired — minimum bet of ${fmt(s.myBet)} chips automatically placed.")
        } else if (s.myAutoBetSkipped != null) {
            autoNoticed = s.id
            toast.show(false, "Time expired — no automatic bet: ${s.myAutoBetSkipped}")
        }
    }

    // ---- seats seen from you: you at the bottom, then left, top, right (clockwise) ----
    val players: List<SeatPlayer> = if (s?.players?.isNotEmpty() == true) s.players else t?.players ?: emptyList()
    val me = t?.players?.find { it.isYou }
    val mySeat = me?.seat ?: 1
    val around = (1..3).map { o -> val n = ((mySeat - 1 + o) % 4) + 1; players.find { it.seat == n } ?: t?.players?.find { it.seat == n } }
    val viewSeat = { real: Int -> ((real - mySeat + 4) % 4) + 1 }
    val bankerId = s?.bankerUserId ?: t?.bankerUserId
    val banker = t?.players?.find { it.userId == bankerId } ?: players.find { it.userId == bankerId }
    val iBank = user != null && bankerId == user?.id
    val round = s?.roundNumber ?: maxOf(1, t?.roundsPlayed ?: 1)
    val total = t?.roundsTotal ?: s?.roundsTotal ?: 12
    val chipsList = s?.betChips?.takeIf { it.isNotEmpty() } ?: t?.betChips ?: emptyList()
    val myChips = balances.chips
    val canCover = { c: Double -> myChips == null || myChips >= c * 2 }
    val resultOf = { id: Int? -> s?.results?.find { it.userId == id } }
    val arrangementOf = { id: Int? -> s?.arrangements?.find { it.userId == id } }
    val myResult = resultOf(user?.id)
    val matchOver = t?.status == "CLOSED"
    val revealed = s?.arrangements != null && phase in listOf("REVEALING", "SCORING", "COMPLETED")
    val covering = if (iBank) players.sumOf { it.bet } else 0.0
    val cantBank = s?.bankerChecks?.filter { !it.second }?.map { it.first }?.toSet() ?: emptySet()
    val standingOf = { id: Int? -> t?.standings?.find { it.userId == id } }
    val seatOf = { id: Int? -> t?.players?.find { it.userId == id }?.seat ?: players.find { it.userId == id }?.seat ?: mySeat }
    val bankerView = viewSeat(seatOf(bankerId))
    val arranging = phase == "ARRANGING" && s?.myCards != null && s.mySubmission == null

    // 1. Deal animation once per round, before the arrangement opens.
    LaunchedEffect(s?.id, phase) {
        if (s != null && phase == "ARRANGING" && s.myCards != null && s.mySubmission == null && shownDeals.add(s.id) && Session.motion.value != "low") dealing = s.id
    }
    // 2. The reveal show when the round you just played is judged (once per round).
    LaunchedEffect(phase, s?.id, revealed) {
        val was = prevPhase
        prevPhase = phase
        if (s == null || !revealed) return@LaunchedEffect
        if (was !in listOf("ARRANGING", "SUBMITTED", "REVEALING", "SCORING") || !shownReveals.add(s.id) || Session.motion.value == "low") return@LaunchedEffect
        val seats = s.arrangements!!.map { a ->
            val r = resultOf(a.userId)
            RevealSeat(viewSeat(seatOf(a.userId)), a.userId == bankerId, r?.bet ?: 0.0, a.rows, a.isFoul, r?.lanes)
        }
        reveal = s.id to revealPlan(seats, bankerView)
    }
    val revealing = reveal != null && reveal?.first == s?.id
    LaunchedEffect(s?.id) { if (reveal != null && reveal?.first != s?.id) reveal = null }
    val revealDone = {
        reveal = null
        val net = myResult?.net ?: 0.0
        Sound.play(if (net > 0) "win" else if (net < 0) "lose" else "start")
    }
    val nowShow = revealClock(if (revealing) reveal?.second else null, revealDone)

    // ---- actions ----
    val bet: (Double) -> Unit = { amount ->
        if (s != null && !busy) {
            busy = true
            Sound.play("chip")
            scope.launch {
                try {
                    Api.post("/games/${s.id}/bet", Api.body("amount" to "%.2f".format(java.util.Locale.US, amount)))
                    Session.walletChanged()
                    refresh()
                } catch (e: Exception) {
                    Sound.play("lose")
                    toast.show(false, errorText(e))
                }
                busy = false
            }
        }
    }
    var draftJob by remember { mutableStateOf<Job?>(null) }
    val saveDraft: (Rows) -> Unit = { rows ->
        if (s != null) {
            lastRows = s.id to rows
            draftJob?.cancel()
            val id = s.id
            draftJob = scope.launch { delay(400); runCatching { Api.put("/games/$id/draft", rows.json()) } }
        }
    }
    val submit: (Rows, Boolean) -> Unit = { rows, timedOut ->
        if (s != null && (!busy || timedOut)) {
            busy = true
            scope.launch {
                try {
                    Api.post("/games/${s.id}/submit", rows.json())
                    Sound.play("deal")
                    refresh()
                } catch (e: Exception) {
                    val code = (e as? ApiException)?.code
                    if (code == "timer_expired" || code == "already_submitted" || code == "invalid_state") {
                        if (!timedOut) toast.show(true, "Time's up — your cards were submitted as they are.")
                        refresh()
                    } else {
                        Sound.play("lose")
                        toast.show(false, errorText(e))
                    }
                }
                busy = false
            }
        }
    }
    val declare: (Rows) -> Unit = { rows ->
        if (s != null && !declaring) {
            declaring = true
            scope.launch {
                try {
                    val r = Api.post("/games/${s.id}/lucky", rows.json())
                    val failed = r.data().optJSONObject("my_submission")?.optBoolean("lucky_failed") == true
                    Sound.play(if (failed) "lose" else "lucky")
                    toast.show(!failed, r.str("message") ?: if (failed) "No Lucky Hand." else "Lucky Hand!")
                    refresh()
                } catch (e: Exception) {
                    toast.show(false, errorText(e))
                }
                declaring = false
            }
        }
    }
    // Time's up: submit the rows on screen exactly as they are (once per round).
    LaunchedEffect(arranging, arrangeLeft, s?.id) {
        if (!arranging || s == null) return@LaunchedEffect
        val passed = s.arrangementDeadline != null && s.arrangementDeadline <= System.currentTimeMillis() + offset + 1000
        if (arrangeLeft <= 0 && passed && autoSubmitted != s.id && dealing != s.id) {
            autoSubmitted = s.id
            val rows = lastRows?.takeIf { it.first == s.id }?.second ?: s.myDraft ?: dealtRows(s.myCards!!)
            toast.show(true, "Time's up — your cards were submitted as they are.")
            submit(rows, true)
        }
    }

    // Leave Game only in the Betting Phase (the server decides: table.leave).
    val leaveAllowed = matchOver || (t?.leaveAllowed == true && !(phase == "BETTING" && betLeft <= 0))
    val leaveReason = if (leaveAllowed) null else t?.leaveReason ?: "You cannot leave the game once the betting phase has ended. Please wait until the round is complete."
    BackHandler { panel = "leave" }
    val bankerName = banker?.let { if (it.isYou) "You" else it.name } ?: "…"

    Stage(background = { Scene("lantern") }) {
        ph.pusoy13.game.ui.Art("table", Modifier.fillMaxSize())
        when {
            removed -> Centered("You are no longer seated at this table.\nYour finished rounds are settled. Returning to the Multiplayer Lobby…")
            terminated -> Centered("This game was ended by the administrator.\nAny Chips held for the round are back in your wallet. Returning to Game Home…")
            t == null -> Centered(error ?: "Joining the table…")
            else -> {
                // Top-left controls
                Row(Modifier.at(20, 12), horizontalArrangement = Arrangement.spacedBy(10.u)) {
                    RoundIcon("Back", Modifier, onClick = { panel = "leave" }) { Txt("←", 40, color = C.Gold) }
                    RoundIcon("Settings", Modifier, onClick = { panel = "settings" }) { Txt("⚙", 42, color = C.Gold) }
                    RoundIcon("How to play", Modifier, onClick = { panel = "help" }) { Txt("?", 42, color = C.Gold) }
                }
                ph.pusoy13.game.ui.Art("mini-crest", Modifier.at(290, 4, 240, 140))
                WalletPill({ ChipIcon(50) }, balances.chips?.let(::fmtWhole) ?: "…", Modifier.at(905, 12, 330, 76), label = "TOTAL CHIPS")
                GoldFrame(Modifier.at(1250, 14, 330, 76), radius = 24, rim = 5, fill = Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF5A0609)))) {
                    Row(Modifier.fillMaxSize().padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically) {
                        ChipIcon(46)
                        Txt(
                            if (iBank) (if (covering > 0) "Covering ${fmt(covering)}" else "Banker · no bet") else s?.myBet?.let { "Bet: ${fmt(it)} Chips${if (s.myBetType == "AUTO") " (auto)" else ""}" } ?: "Bet: —",
                            24, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1,
                        )
                    }
                }
                Column(Modifier.at(1080, 98).width(500.u), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.u)) {
                    Pill("Round ${minOf(round, total)} / $total · ${if (bankerName == "You") "You bank" else "$bankerName banks"}", size = 22, color = C.Gold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(14.u).clip(CircleShape).background(if (connected) Color(0xFF45E0A5) else C.Gold))
                        Pill("${t.roomName} · Min Entry ${fmt(t.minEntry)} · ${if (t.gameMode == "banker") "Banker Mode" else "Round Bank"}", size = 17)
                    }
                }
                t.pausedMessage?.takeIf { t.status == "IN_GAME" }?.let {
                    GoldFrame(Modifier.at(390, 190, 820, 130), radius = 26, rim = 4, fill = Brush.verticalGradient(listOf(Color(0xF22A1402), Color(0xF21A0A00)))) {
                        Column(Modifier.fillMaxSize().padding(14.u), horizontalAlignment = Alignment.CenterHorizontally) {
                            Txt("Game paused — no eligible banker", 30, color = C.Gold)
                            Txt(it, 20, align = TextAlign.Center)
                        }
                    }
                }

                // The other three seats, clockwise from you: left, top, right.
                listOf(Spot.Left, Spot.Top, Spot.Right).forEachIndexed { i, spot ->
                    val p = around[i]
                    if (p == null) {
                        HandPanel(spot, "Empty seat", null, status = "Empty seat", statusColor = C.White.copy(alpha = 0.5f))
                    } else {
                        val a = if (revealed) arrangementOf(p.userId) else null
                        val r = resultOf(p.userId)
                        val dealt = (phase == "ARRANGING" || phase == "SUBMITTED") && dealing != s?.id && (p.userId == bankerId || p.bet > 0)
                        val (status, color) = seatStatus(p, s, phase, revealed, revealing, bankerId, r?.net, standingOf(p.userId)?.net)
                        HandPanel(
                            spot, p.name, { Avatar(p.avatar, p.userId, 116, square = true, offline = !p.isConnected) },
                            status = status + if (p.userId in cantBank) " · Can't bank (low Chips)" else "", statusColor = color,
                            banker = p.userId == bankerId, offline = !p.isConnected, glow = revealed && !revealing && (r?.net ?: 0.0) > 0,
                            cards = when {
                                a != null -> SeatCards.Shown(a.rows, a.labels, r?.lanes,
                                    up = if (revealing) { l, idx -> reveal!!.second.isUp(nowShow, viewSeat(p.seat), l, idx) } else null,
                                    laneShown = if (revealing) { l -> reveal!!.second.laneShown(nowShow, l) } else null)
                                dealt -> SeatCards.Backs
                                else -> SeatCards.Empty
                            },
                            badges = a?.let { handBadges(it.luckyType?.let { k -> LUCKY_LABELS[k] ?: k }, it.isFoul, it.luckyFailed) } ?: emptyList(),
                        )
                    }
                }

                TableCrest(
                    round, total,
                    if (revealing) null else when {
                        phase == "STARTING" -> "Get ready — seating players and shuffling…"
                        phase == "BETTING" -> "${if (iBank) "You are the banker" else "$bankerName is the banker"} · ${if (betLeft <= 0) "betting closed" else if (s?.canBet == true) "place your bet" else if (iBank) "you cover the bets" else if (s?.myBet != null) "bet placed" else "you sit out"} · ${betLeft}s"
                        phase == "ARRANGING" || phase == "SUBMITTED" -> "${if (s?.mySubmission != null) "Hand locked in" else if (s?.myCards != null) "Arrange your hand" else "Dealt in next round"} · ${players.count { it.hasSubmitted }} / ${players.size} ready · ${arrangeLeft}s"
                        phase == "CANCELLED" -> "Round cancelled (${s?.cancelReason?.replace('_', ' ')}) — reserved Chips returned"
                        revealed && !matchOver && phase == "COMPLETED" -> if (round >= total) "Final round played" else if (nextIn > 0) "Next round in ${nextIn}s" else "Dealing the next round…"
                        matchOver -> "Match over"
                        else -> "Every lane vs the banker · 3-0 pays 2× · 2-1 pays 1×"
                    },
                )
                if (iBank && !matchOver) BankerRibbon()

                // Your seat
                val mine = if (revealed && user != null) arrangementOf(user!!.id) else null
                HandPanel(
                    Spot.Bottom, me?.name ?: "You", { Avatar(me?.avatar ?: user?.avatar, user?.id, 110, square = true) },
                    status = if (revealed && !revealing) myResult?.let { "${signed(it.net)} Chips" } ?: "—" else null,
                    statusColor = toneColor(myResult?.net ?: 0.0),
                    banker = iBank, glow = revealed && !revealing && (myResult?.net ?: 0.0) > 0,
                    cards = mine?.let {
                        SeatCards.Shown(it.rows, it.labels, myResult?.lanes,
                            up = if (revealing) { l, idx -> reveal!!.second.isUp(nowShow, viewSeat(mySeat), l, idx) } else null,
                            laneShown = if (revealing) { l -> reveal!!.second.laneShown(nowShow, l) } else null)
                    } ?: SeatCards.Empty,
                    badges = mine?.let { handBadges(it.luckyType?.let { k -> LUCKY_LABELS[k] ?: k }, it.isFoul, it.luckyFailed) } ?: emptyList(),
                    extra = {
                        if (phase == "BETTING" && s?.canBet == true && betLeft > 0) {
                            Row(horizontalArrangement = Arrangement.spacedBy(16.u), verticalAlignment = Alignment.CenterVertically) {
                                chipsList.forEachIndexed { i, c ->
                                    BetChip(fmt(c), i, 96, Modifier.alpha(if (canCover(c)) 1f else 0.4f).tap(enabled = !busy && canCover(c), sound = null, label = "Bet ${fmt(c)}") { bet(c) })
                                }
                                Txt(
                                    if (busy) "Placing bet…" else if (chipsList.none(canCover)) "You need ${fmt((chipsList.minOrNull() ?: 0.0) * 2)} Chips (2× the smallest bet) to bet" else "Tap a chip to bet (hold 2× your bet) · ${betLeft}s",
                                    19, color = C.White.copy(alpha = 0.85f), modifier = Modifier.weight(1f),
                                )
                            }
                        } else if (mine == null) {
                            Txt(
                                when {
                                    matchOver -> "Match over"
                                    phase == "BETTING" -> if (iBank) "You are the banker — covering ${fmt(covering)} Chips" else s?.myBet?.let { b -> if (s.myBetType == "AUTO") "Time expired — minimum bet of ${fmt(b)} Chips placed automatically" else "Bet ${fmt(b)} Chips — waiting for the deal" } ?: if (betLeft <= 0) "Betting closed — dealing…" else "Sitting out this round"
                                    revealed -> "Match total ${signed(standingOf(user?.id)?.net ?: 0.0)} Chips · round $round of $total"
                                    s?.mySubmission != null -> "Hand locked in — waiting for the others"
                                    s?.myCards != null -> if (dealing == s.id) "Shuffling and dealing…" else "Arrange your 13 cards: Front 3 · Middle 5 · Back 5"
                                    else -> "Waiting…"
                                },
                                21, color = C.White.copy(alpha = 0.85f),
                            )
                        }
                    },
                )

                if (s != null && dealing == s.id && phase == "ARRANGING" && s.myCards != null) {
                    DealAnimation(s.id, bankerView, players.map { viewSeat(it.seat) }) { dealing = null }
                }
                if (revealing) RevealBanner(reveal!!.second, nowShow, revealDone)
                if (arranging && s != null && dealing != s.id) {
                    ArrangePopup(
                        s.id, s.myCards!!, s.myDraft,
                        "${t.roomName} · R$round/$total · ${if (bankerName == "You") "You bank" else "$bankerName banks"} · ${arrangeLeft}s",
                        if (iBank) "Covering ${fmt(covering)}" else "Bet: ${fmt(s.myBet ?: 0.0)} Chips${if (s.myBetType == "AUTO") " (auto)" else ""}",
                        "/games/${s.id}/preview", (around[0]?.name ?: "") to (around[2]?.name ?: ""), declaring, busy,
                        onDeclare = declare, onSubmit = { submit(it, false) }, onRowsChange = saveDraft,
                    ) {
                        WalletPill({ ChipIcon(48) }, balances.chips?.let(::fmtWhole) ?: "…", Modifier.at(1080, 690, 330, 76), label = "TOTAL CHIPS")
                    }
                }

                // Final results after round 12 (or an early end)
                if (matchOver) {
                    val ranked = t.standings
                    val mineS = ranked.find { it.userId == user?.id }
                    Modal(if (mineS?.rank == 1) "YOU WIN THE MATCH!" else mineS?.let { "#${it.rank} PLACE" } ?: "MATCH OVER", null, width = 900) {
                        mineS?.let { Txt("${signed(it.net)} Chips", 40, color = toneColor(it.net)) }
                        Txt("${t.roundsPlayed} / $total rounds · ${END_REASON[t.endReason ?: ""] ?: (t.endReason ?: "").replace('_', ' ')}", 18, color = C.White.copy(alpha = 0.65f), align = TextAlign.Center)
                        Column(Modifier.padding(top = 12.u).width(640.u), verticalArrangement = Arrangement.spacedBy(6.u)) {
                            ranked.forEach { st ->
                                Row(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.u)).background(if (st.userId == user?.id) Color(0x40FFD13A) else Color(0x4D000000)).padding(horizontal = 16.u, vertical = 6.u),
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
                                ) {
                                    Txt(if (st.rank == 1) "👑" else "${st.rank}", 24, color = C.Gold, modifier = Modifier.width(40.u))
                                    Avatar(st.avatar, st.userId, 40)
                                    Txt(st.name, 24, modifier = Modifier.weight(1f), maxLines = 1)
                                    Txt("banked ${st.bankerRounds}", 18, color = C.White.copy(alpha = 0.6f))
                                    Txt(signed(st.net), 24, color = toneColor(st.net))
                                }
                            }
                        }
                        CandyButton("Back to Lobby", Modifier.padding(top = 20.u).size(360.u, 76.u), size = 30) { Nav.replace(Route.Lobby) }
                    }
                }

                when (panel) {
                    "settings" -> {
                        var sfx by remember { mutableStateOf(Sound.sfxOn) }
                        Modal("Settings", { panel = null }, width = 760) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Txt("Sound", 30)
                                Toggle(sfx, "Sound") { sfx = !sfx; Session.savePrefs(sfx = sfx) }
                            }
                        }
                    }
                    "help" -> Modal("${if (t.gameMode == "banker") "Banker Mode" else "Round Bank"} · 12 rounds", { panel = null }, width = 900) {
                        listOf(
                            "Four players, 12 rounds. ${if (t.gameMode == "banker") "The lobby creator banks while they can cover the table." else "The banker turn passes clockwise each round."} To bank you need at least ${fmt(t.bankerReserve)} Chips (6× the biggest bet); anyone below that is skipped.",
                            "Bets are the table's chips only: ${chipsList.joinToString(" / ") { fmt(it) }} Chips (from the ${fmt(t.minEntry)}-Chip Minimum Entry). The banker places no bet and covers everyone else's.",
                            "Arrange your 13 cards into Front (3), Middle (5) and Back (5). Each lane is compared with the banker's: win all 3 = 2× bet, win 2 = 1×; lose 2 = −1×, lose all 3 = −2×. An identical lane goes to the banker.",
                            "A Lucky Hand (3-Flushes, 3-Straight, No Faces, 6 Pairs) pays 2× the bet when declared; a false declaration or a misarranged hand costs 2× the bet.",
                        ).forEach { Txt(it, 22, modifier = Modifier.fillMaxWidth().padding(vertical = 4.u)) }
                    }
                    "leave" -> Modal("Leave the table?", { panel = null }, width = 820) {
                        if (leaveAllowed) {
                            Txt(if (matchOver) "The match is over." else "You can leave during the Betting Phase. Your finished rounds stay settled.", 24, align = TextAlign.Center)
                            Row(Modifier.padding(top = 22.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
                                CandyButton("Stay", Modifier.size(240.u, 78.u), Tone.Dark, size = 30) { panel = null }
                                CandyButton("Leave", Modifier.size(260.u, 78.u), Tone.Red, size = 30, enabled = !busy) {
                                    busy = true
                                    scope.launch {
                                        try {
                                            if (!matchOver) Api.post("/tables/$tableId/leave")
                                            Session.walletChanged()
                                            Nav.replace(Route.Lobby)
                                        } catch (e: Exception) {
                                            toast.show(false, errorText(e))
                                            panel = null
                                        }
                                        busy = false
                                    }
                                }
                            }
                        } else {
                            Txt(leaveReason ?: "", 24, align = TextAlign.Center)
                            Row(Modifier.padding(top = 22.u), horizontalArrangement = Arrangement.spacedBy(20.u)) {
                                CandyButton("Keep Playing", Modifier.size(300.u, 78.u), size = 30) { panel = null }
                                CandyButton("Game Home", Modifier.size(280.u, 78.u), Tone.Dark, size = 28) { Nav.reset(Route.Home()) }
                            }
                            Txt("Game Home keeps your seat — you can come back to this table.", 18, color = C.White.copy(alpha = 0.6f), modifier = Modifier.padding(top = 10.u))
                        }
                    }
                }
            }
        }
        ToastHost(toast, 120)
    }
}

fun toneColor(n: Double) = if (n > 0) C.Mint else if (n < 0) C.Pink else C.White

private fun seatStatus(p: SeatPlayer, s: SessionState?, phase: String, revealed: Boolean, revealing: Boolean, bankerId: Int?, net: Double?, matchNet: Double?): Pair<String, Color> = when {
    s == null -> (matchNet?.let { signed(it) } ?: "") to toneColor(matchNet ?: 0.0)
    revealed && revealing -> "Revealing…" to C.White.copy(alpha = 0.8f)
    revealed -> (net?.let { signed(it) } ?: "") to toneColor(net ?: 0.0)
    phase == "BETTING" -> if (p.userId == bankerId) "Covering bets" to Color(0xFF9FE0FF) else if (p.bet > 0) "Bet ${fmt(p.bet)}${if (p.betType == "AUTO") " (auto)" else ""}" to C.Mint else "Betting…" to C.White.copy(alpha = 0.8f)
    phase == "ARRANGING" || phase == "SUBMITTED" -> if (p.hasSubmitted) "✓ Ready" to C.Mint else "Arranging…" to C.White.copy(alpha = 0.8f)
    else -> (matchNet?.let { signed(it) } ?: "") to toneColor(matchNet ?: 0.0)
}
