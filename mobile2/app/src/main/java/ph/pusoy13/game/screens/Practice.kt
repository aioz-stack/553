package ph.pusoy13.game.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.ApiException
import ph.pusoy13.game.core.GoldWallet
import ph.pusoy13.game.core.MatchState
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.PracticeTier
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.RoundState
import ph.pusoy13.game.core.Rows
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.dataList
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.idempotencyKey
import ph.pusoy13.game.core.isFull
import ph.pusoy13.game.core.json
import ph.pusoy13.game.core.obj
import ph.pusoy13.game.core.signed
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.BetChip
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.GoldIcon
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

private val BOTS = mapOf(2 to "LuckyBot", 3 to "CardBot", 4 to "AceBot")
private val BOT_AVATARS = mapOf(2 to "animal-02", 3 to "animal-03", 4 to "animal-08")
private val BOT_SPOT = mapOf(2 to Spot.Left, 3 to Spot.Top, 4 to Spot.Right)
private val practiceDeals = mutableSetOf<Int>()
private val practiceReveals = mutableSetOf<Int>()

/**
 * Single Player — Round Bank Pusoy against three bots (LuckyBot, CardBot, AceBot). A match is 12
 * rounds; the banker rotates You → LuckyBot → CardBot → AceBot. Before every round you pick the bet
 * from your difficulty's chips; the server deals, the bots arrange themselves, you arrange Front /
 * Middle / Back, and every non-banker's lanes are compared with the banker's. Every settled round
 * credits or deducts your Gold on the server; out of Gold ends the match (Home offers free Gold).
 */
@Composable
fun PracticeScreen(route: Route.Practice) {
    val user by Session.user.collectAsState()
    val gold by Session.gold.collectAsState()
    var tier by remember { mutableStateOf<PracticeTier?>(null) }
    var match by remember { mutableStateOf<MatchState?>(null) }
    var round by remember { mutableStateOf<RoundState?>(null) }
    var phase by remember { mutableStateOf("loading") }
    var bet by remember { mutableIntStateOf(route.bet ?: 0) }
    var busy by remember { mutableStateOf(false) }
    var declaring by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var dealing by remember { mutableStateOf<Int?>(null) }
    var reveal by remember { mutableStateOf<Pair<Int, RevealPlan>?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var leavingAfter by remember { mutableStateOf<Long?>(null) }
    val toast = rememberToast()
    val scope = rememberCoroutineScope()

    suspend fun newMatch(t: PracticeTier): MatchState {
        val m = MatchState.of(Api.post("/practice/matches", Api.body("tier" to t.key)).data())
        match = m
        round = null
        reveal = null
        phase = "betting"
        return m
    }

    // ---- load: the tier → resume the active match at this tier, or start a new one ----
    LaunchedEffect(user?.id) {
        if (user == null) return@LaunchedEffect
        try {
            val tiersR = Api.get("/practice/tiers")
            val tiers = tiersR.dataList().map(PracticeTier::of)
            val current = Api.get("/practice/matches/current").obj("data")?.let(MatchState::of)
            val out = tiersR.obj("meta")?.obj("gold_wallet")?.let(GoldWallet::of)?.outOfGold == true
            if (out && current?.current == null) {
                Nav.replace(Route.Home(goldOut = true))
                return@LaunchedEffect
            }
            val t = tiers.find { it.key == route.tier }
            if (t == null) {
                Nav.replace(Route.Home(picker = true))
                return@LaunchedEffect
            }
            tier = t
            bet = if (route.bet != null && route.bet in t.bets) route.bet else t.bets.firstOrNull() ?: 0
            if (current != null && current.tierKey == t.key) {
                match = current
                if (current.current != null) {
                    round = current.current
                    bet = current.current.bet.toInt()
                    phase = "arranging"
                } else phase = "betting"
            } else if (t.eligible) newMatch(t) else phase = "betting"
        } catch (e: Exception) {
            toast.show(false, errorText(e))
            phase = "betting"
        }
    }
    // Out of Gold: after the result has been on screen, back Home to the free Gold.
    LaunchedEffect(leavingAfter, reveal) {
        val d = leavingAfter ?: return@LaunchedEffect
        if (reveal != null) return@LaunchedEffect
        delay(d)
        Nav.replace(Route.Home(goldOut = true))
    }

    val settled: suspend (RoundState, Boolean) -> Unit = { r, show ->
        round = r
        phase = "revealed"
        val plan = if (show && Session.motion.value != "low" && practiceReveals.add(r.id)) revealPlan(
            r.players.filter { it.rows != null }.map { RevealSeat(it.seat, it.isBanker, it.bet, it.rows!!, it.isFoul, it.lanes) }, r.banker,
        ) else null
        if (plan != null) reveal = r.id to plan else resultSound(r)
        Session.walletChanged()
        match?.let { m ->
            runCatching {
                val mm = MatchState.of(Api.get("/practice/matches/${m.id}").data())
                match = mm
                if (mm.outOfGold) leavingAfter = 2600
                else if (mm.status == "completed") scope.launch { delay(1600L + (plan?.done ?: 0L)); panel = "summary" }
            }
        }
    }

    /** Place your bet (null when you are the banker: no bet, you cover the others) and deal. */
    val placeBet: (Int?) -> Unit = placeBet@{ amount ->
        val t = tier ?: return@placeBet
        if (busy) return@placeBet
        if (!t.eligible) {
            toast.show(false, "Not enough gold for ${t.name}. You need at least ${fmt(t.minGold)} gold.")
            return@placeBet
        }
        busy = true
        amount?.let { bet = it }
        Sound.play("chip")
        scope.launch {
            try {
                val m = match?.takeIf { it.status == "active" } ?: newMatch(t)
                val body = Api.body("request_id" to idempotencyKey())
                if (amount != null) body.put("bet", amount)
                val r = RoundState.of(Api.post("/practice/matches/${m.id}/deal", body).data())
                reveal = null
                round = r
                match = m.copy(current = r, nextRound = null, nextBanker = null, nextBankerName = null)
                phase = "arranging"
                Session.walletChanged()
                if (practiceDeals.add(r.id) && Session.motion.value != "low") dealing = r.id
            } catch (e: Exception) {
                val code = (e as? ApiException)?.code
                if (code == "out_of_gold") Nav.replace(Route.Home(goldOut = true))
                else toast.show(false, if (code == "insufficient_gold") "Not enough gold for ${t.name}. You need at least ${fmt(t.minGold)} gold." else errorText(e))
            }
            busy = false
        }
    }
    val submit: (Rows) -> Unit = submit@{ lanes ->
        val r = round ?: return@submit
        if (busy) return@submit
        if (!lanes.isFull() || lanes.values.flatten().toSet() != r.cards.toSet()) {
            toast.show(false, "Place all 13 cards first.")
            return@submit
        }
        busy = true
        scope.launch {
            try {
                settled(RoundState.of(Api.post("/practice/${r.id}/submit", lanes.json()).data()), true)
            } catch (e: Exception) {
                toast.show(false, errorText(e))
            }
            busy = false
        }
    }
    val declare: (Rows) -> Unit = declare@{ rows ->
        val r = round ?: return@declare
        if (declaring || r.status != "arranging") return@declare
        declaring = true
        scope.launch {
            try {
                val res = RoundState.of(Api.post("/practice/${r.id}/lucky", rows.json()).data())
                notice = if (res.luckyFailed) "noluck" else "lucky"
                Sound.play(if (res.luckyFailed) "lose" else "lucky")
                settled(res, false)
            } catch (e: Exception) {
                if ((e as? ApiException)?.code == "not_lucky") {
                    notice = "noluck"
                    Sound.play("lose")
                } else toast.show(false, errorText(e))
            }
            declaring = false
        }
    }

    val revealing = reveal != null && phase == "revealed" && round?.id == reveal?.first
    val nowShow = revealClock(if (revealing) reveal?.second else null) {
        reveal = null
        round?.let(::resultSound)
    }
    val leave: () -> Unit = {
        if (phase == "arranging" || revealing) panel = "leave"
        else Nav.replace(Route.Home(picker = true))
    }
    BackHandler { leave() }

    val r = round
    val m = match
    val t = tier
    val revealed = phase == "revealed"
    val bankerSeat = if (phase == "betting") m?.nextBanker ?: 1 else r?.banker ?: 1
    val iBank = bankerSeat == 1
    val roundNo = if (phase == "betting") m?.nextRound ?: (m?.roundsPlayed?.plus(1) ?: 1) else r?.round ?: 1
    val total = m?.roundsTotal ?: 12

    Stage(background = { Scene("lantern") }) {
        ph.pusoy13.game.ui.Art("table", Modifier.fillMaxSize())
        Row(Modifier.at(20, 12), horizontalArrangement = Arrangement.spacedBy(10.u)) {
            RoundIcon("Back", Modifier, onClick = leave) { Txt("←", 40, color = C.Gold) }
            RoundIcon("Settings", Modifier, onClick = { panel = "settings" }) { Txt("⚙", 42, color = C.Gold) }
            RoundIcon("How to play", Modifier, onClick = { panel = "help" }) { Txt("?", 42, color = C.Gold) }
        }
        ph.pusoy13.game.ui.Art("mini-crest", Modifier.at(290, 4, 240, 140))
        WalletPill({ GoldIcon(50) }, gold?.let { fmtWhole(it.total) } ?: "…", Modifier.at(905, 12, 330, 76), listOf(Color(0xFF6A3A00), Color(0xFF2A1400)), label = "TOTAL GOLD")
        GoldFrame(Modifier.at(1250, 14, 330, 76), radius = 24, rim = 5, fill = Brush.verticalGradient(listOf(Color(0xFFB3141B), Color(0xFF5A0609)))) {
            Row(Modifier.fillMaxSize().padding(horizontal = 12.u), verticalAlignment = Alignment.CenterVertically) {
                Txt("${t?.name ?: ""} · ${if (iBank) (r?.covered?.takeIf { it > 0 }?.let { "Covering ${fmt(it)}" } ?: "You bank") else "Bet: ${fmt(bet)}"}", 22, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1)
            }
        }
        Pill("Round ${minOf(roundNo, total)} / $total · ${if (iBank) "You bank" else "${BOTS[bankerSeat]} banks"}", Modifier.at(1180, 100), size = 22, color = C.Gold)

        // Bots
        (2..4).forEach { seat ->
            val p = r?.players?.find { it.seat == seat }
            val spot = BOT_SPOT.getValue(seat)
            val show = revealed && p?.rows != null
            HandPanel(
                spot, BOTS.getValue(seat), { Avatar(BOT_AVATARS[seat], seat, 116, square = true) },
                status = when {
                    revealing -> "Revealing…"
                    show -> p?.gold?.let { signed(it) }
                    phase == "arranging" -> if (seat == bankerSeat) "Banker" else "Bet ${fmt(p?.bet ?: 0.0)}"
                    else -> m?.standings?.find { it.first == seat }?.third?.let { "Match ${signed(it)}" }
                },
                statusColor = if (show && !revealing) toneColor(p?.gold ?: 0.0) else C.White,
                banker = seat == bankerSeat,
                glow = show && !revealing && (p?.gold ?: 0.0) > 0,
                cards = when {
                    show -> SeatCards.Shown(p!!.rows!!, p.labels, p.lanes,
                        up = if (revealing) { l, i -> reveal!!.second.isUp(nowShow, seat, l, i) } else null,
                        laneShown = if (revealing) { l -> reveal!!.second.laneShown(nowShow, l) } else null)
                    phase == "arranging" && dealing != r?.id -> SeatCards.Backs
                    else -> SeatCards.Empty
                },
                badges = if (show) handBadges(p?.lucky, p?.isFoul == true, false) else emptyList(),
            )
        }

        TableCrest(
            roundNo, total,
            if (revealing) null else when (phase) {
                "loading" -> "Getting the table ready…"
                "betting" -> if (iBank) "You are the banker — deal when ready" else "Choose your bet"
                "arranging" -> "Arrange your hand"
                else -> if (m?.status == "completed") "Match over" else if (m?.outOfGold == true) "Out of Gold" else "Round settled"
            },
        )
        if (iBank && m?.status != "completed") BankerRibbon()

        // You
        val mine = r?.players?.find { it.isYou }
        HandPanel(
            Spot.Bottom, user?.shownName ?: "You", { Avatar(user?.avatar, user?.id, 110, square = true) },
            status = if (revealed && !revealing) r?.resultGold?.let { "${signed(it)} Gold" + (r.resultMultiple?.let { x -> " · ${x}× bet" } ?: "") } else null,
            statusColor = toneColor(r?.resultGold ?: 0.0),
            banker = iBank, glow = revealed && !revealing && (r?.resultGold ?: 0.0) > 0,
            cards = if (revealed && mine?.rows != null) SeatCards.Shown(mine.rows, mine.labels, mine.lanes,
                up = if (revealing) { l, i -> reveal!!.second.isUp(nowShow, 1, l, i) } else null,
                laneShown = if (revealing) { l -> reveal!!.second.laneShown(nowShow, l) } else null) else SeatCards.Empty,
            badges = if (revealed) handBadges(r?.luckyLabel, r?.misplaced == true, r?.luckyFailed == true) else emptyList(),
            extra = {
                when {
                    phase == "betting" && t != null -> Row(horizontalArrangement = Arrangement.spacedBy(16.u), verticalAlignment = Alignment.CenterVertically) {
                        if (iBank) {
                            CandyButton(if (busy) "Dealing…" else "DEAL", Modifier.size(260.u, 90.u), size = 40, enabled = !busy && t.eligible) { placeBet(null) }
                            Txt("You bank this round: no bet, you cover the bots' bets.", 20, color = C.White.copy(alpha = 0.85f), modifier = Modifier.weight(1f))
                        } else {
                            t.bets.forEachIndexed { i, b -> BetChip(fmt(b), i, 96, Modifier.alpha(if (busy) 0.5f else 1f).tap(enabled = !busy, sound = null, label = "Bet $b") { placeBet(b) }) }
                            Txt(if (t.eligible) "Tap a chip to bet and deal" else "Not enough Gold for ${t.name} (min ${fmt(t.minGold)})", 20, color = if (t.eligible) C.White.copy(alpha = 0.85f) else C.Pink, modifier = Modifier.weight(1f))
                        }
                    }
                    revealed && !revealing && m?.status == "active" && m.outOfGold.not() -> Row(horizontalArrangement = Arrangement.spacedBy(16.u), verticalAlignment = Alignment.CenterVertically) {
                        val nextBank = m.nextBanker == 1
                        if (nextBank) CandyButton("Next Round — You bank", Modifier.size(420.u, 80.u), size = 30, enabled = !busy) { placeBet(null) }
                        else t?.bets?.forEachIndexed { i, b -> BetChip(fmt(b), i, 86, Modifier.tap(enabled = !busy, sound = null, label = "Bet $b") { placeBet(b) }) }
                        Txt(if (nextBank) "" else "Next round: tap a chip to bet", 20, color = C.White.copy(alpha = 0.85f))
                    }
                    phase == "arranging" -> Txt(if (dealing == r?.id) "Shuffling and dealing…" else "Arrange your 13 cards: Front 3 · Middle 5 · Back 5", 21, color = C.White.copy(alpha = 0.85f))
                }
            },
        )

        if (r != null && dealing == r.id && phase == "arranging") DealAnimation(r.id, r.banker, listOf(1, 2, 3, 4)) { dealing = null }
        if (revealing) RevealBanner(reveal!!.second, nowShow) { reveal = null; round?.let(::resultSound) }
        if (phase == "arranging" && r != null && r.status == "arranging" && dealing != r.id) {
            ArrangePopup(
                r.id, r.cards, null,
                "${r.tierName} · R${r.round}/${r.roundsTotal} · ${if (r.banker == 1) "You bank" else "${BOTS[r.banker]} banks"}",
                if (r.banker == 1) "Covering ${fmt(r.covered)}" else "Bet: ${fmt(r.bet)}",
                "/practice/${r.id}/preview", "LuckyBot" to "AceBot", declaring, busy,
                onDeclare = declare, onSubmit = submit,
            ) {
                WalletPill({ GoldIcon(48) }, gold?.let { fmtWhole(it.total) } ?: "…", Modifier.at(1080, 690, 330, 76), listOf(Color(0xFF6A3A00), Color(0xFF2A1400)), label = "TOTAL GOLD")
            }
        }

        notice?.let { n ->
            Modal(if (n == "lucky") "LUCKY HAND!" else "No Lucky Hand", { notice = null }, width = 760) {
                Txt(if (n == "lucky") "${r?.luckyLabel ?: "Lucky Hand"} — you win 2× your bet." else "Your 13 cards have no Lucky Hand: the declaration costs 2× your bet.", 26, align = TextAlign.Center)
                CandyButton("OK", Modifier.padding(top = 18.u).size(240.u, 76.u), size = 32) { notice = null }
            }
        }
        when (panel) {
            "settings" -> SettingsPanel { panel = null }
            "help" -> Modal("Single Player · Round Bank", { panel = null }, width = 900) {
                listOf(
                    "You and three bots (LuckyBot, CardBot, AceBot), 12 rounds. The banker rotates You → LuckyBot → CardBot → AceBot.",
                    "Before every round pick your bet from your level's chips (no bet when you bank: you cover the bots).",
                    "Arrange Front (3), Middle (5) and Back (5). Each lane is compared with the banker's: an identical lane goes to the banker, 3-0 = 2× bet, 2-1 = 1× bet.",
                    "Lucky Hands pay 2× when declared; a false declaration or a misarranged hand costs 2×. Gold is won and lost on the server after every round.",
                ).forEach { Txt(it, 22, modifier = Modifier.fillMaxWidth().padding(vertical = 4.u)) }
            }
            "leave" -> Modal("Leave Single Player?", { panel = null }, width = 760) {
                Txt("Finish this round first — you can leave once it is settled (in the Betting Phase).", 24, align = TextAlign.Center)
                CandyButton("Keep Playing", Modifier.padding(top = 18.u).size(320.u, 78.u), size = 30) { panel = null }
            }
            "summary" -> m?.let { mm ->
                Modal("MATCH OVER", null, width = 900) {
                    Txt("${mm.tierName} · ${mm.roundsPlayed} / ${mm.roundsTotal} rounds", 22, color = C.Cream)
                    Txt("${signed(mm.gold)} Gold", 44, color = toneColor(mm.gold))
                    Column(Modifier.width(620.u).padding(top = 10.u), verticalArrangement = Arrangement.spacedBy(6.u)) {
                        mm.standings.sortedByDescending { it.third }.forEachIndexed { i, (seat, name, g) ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.u)).background(if (seat == 1) Color(0x40FFD13A) else Color(0x4D000000)).padding(horizontal = 16.u, vertical = 6.u), horizontalArrangement = Arrangement.spacedBy(12.u), verticalAlignment = Alignment.CenterVertically) {
                                Txt(if (i == 0) "👑" else "${i + 1}", 24, color = C.Gold, modifier = Modifier.width(40.u))
                                Avatar(if (seat == 1) user?.avatar else BOT_AVATARS[seat], if (seat == 1) user?.id else seat, 40)
                                Txt(if (seat == 1) "You" else name, 24, modifier = Modifier.weight(1f))
                                Txt(signed(g), 24, color = toneColor(g))
                            }
                        }
                    }
                    Row(Modifier.padding(top = 20.u), horizontalArrangement = Arrangement.spacedBy(18.u)) {
                        CandyButton("Play Again", Modifier.size(280.u, 76.u), Tone.Green, size = 30) {
                            panel = null
                            tier?.let { tt -> scope.launch { runCatching { newMatch(tt); Sound.play("tap") }.onFailure { toast.show(false, errorText(it)) } } }
                        }
                        CandyButton("Change Level", Modifier.size(300.u, 76.u), size = 30) { Nav.replace(Route.Home(picker = true)) }
                        CandyButton("Home", Modifier.size(200.u, 76.u), Tone.Dark, size = 30) { Nav.reset(Route.Home()) }
                    }
                }
            }
        }
        if (phase == "loading") Centered("Getting the table ready…")
        ToastHost(toast, 120)
    }
}

private fun resultSound(r: RoundState) {
    val g = r.resultGold ?: 0.0
    Sound.play(if (g > 0) "win" else if (g < 0) "lose" else "start")
}
