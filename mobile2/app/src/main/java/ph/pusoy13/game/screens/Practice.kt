package ph.pusoy13.game.screens

import androidx.activity.compose.BackHandler
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
import ph.pusoy13.game.core.idempotencyKey
import ph.pusoy13.game.core.isFull
import ph.pusoy13.game.core.json
import ph.pusoy13.game.core.obj
import ph.pusoy13.game.core.signed
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyText
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.ToastHost
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.rememberToast
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

private val BOTS = mapOf(2 to "LuckyBot", 3 to "CardBot", 4 to "AceBot")
private val BOT_AVATARS = mapOf(2 to "animal-02", 3 to "animal-03", 4 to "animal-08")
private val BOT_SPOT = mapOf(2 to Spot.Left, 3 to Spot.Top, 4 to Spot.Right)
private val practiceDeals = mutableSetOf<Int>()
private val practiceReveals = mutableSetOf<Int>()
private fun bankerFor(round: Int) = ((round - 1) % 4) + 1
private fun banksText(seat: Int) = if (seat == 1) "You bank" else "${BOTS[seat]} banks"

/**
 * Single Player (mobile/src/app/practice/page.tsx): Round Bank Pusoy against LuckyBot, CardBot and
 * AceBot over 12 rounds; the banker rotates You → LuckyBot → CardBot → AceBot. You pick each round's
 * bet from your level's chips, the server deals, the bots arrange themselves, you arrange in the
 * shared arrangement popup, and every non-banker's lanes are compared with the banker's on the
 * server. Same table, popup and results screen as Multiplayer; only this adapter differs.
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
    var leaving by remember { mutableStateOf<Long?>(null) }
    var sortBy by remember { mutableStateOf("dealt") }
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
            if (out && current?.current == null) { Nav.replace(Route.Home(goldOut = true)); return@LaunchedEffect }
            val t = tiers.find { it.key == route.tier } ?: run { Nav.replace(Route.Home(picker = true)); return@LaunchedEffect }
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
    LaunchedEffect(leaving, reveal) {
        val d = leaving ?: return@LaunchedEffect
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
                if (mm.outOfGold) leaving = 2600
                else if (mm.status == "completed") scope.launch { delay(1600L + (plan?.done ?: 0L)); panel = "summary" }
            }
        }
    }

    /** Place your bet (null when you are the banker: no bet, you cover the others) and deal. */
    val placeBet: (Int?) -> Unit = placeBet@{ amount ->
        val t = tier ?: return@placeBet
        if (busy) return@placeBet
        if (!t.eligible) { toast.show(false, "Not enough gold for ${t.name}. You need at least ${fmt(t.minGold)} gold."); return@placeBet }
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
        if (!lanes.isFull() || lanes.values.flatten().toSet() != r.cards.toSet()) { toast.show(false, "Place all 13 cards first."); return@submit }
        busy = true
        scope.launch {
            try { settled(RoundState.of(Api.post("/practice/${r.id}/submit", lanes.json()).data()), true) } catch (e: Exception) { toast.show(false, errorText(e)) }
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
                if ((e as? ApiException)?.code == "not_lucky") { notice = "noluck"; Sound.play("lose") } else toast.show(false, errorText(e))
            }
            declaring = false
        }
    }

    val revealed = phase == "revealed"
    val revealing = reveal != null && revealed && round?.id == reveal?.first
    val nowShow = revealClock(if (revealing) reveal?.second else null) { reveal = null; round?.let(::resultSound) }
    val leave: () -> Unit = { if (phase == "arranging" || revealing) panel = "leave" else Nav.replace(Route.Home(picker = true)) }
    BackHandler { leave() }

    val r = round
    val m = match
    val t = tier
    val matchOver = m?.status == "completed" || m?.status == "out_of_gold"
    val inRound = phase == "arranging" || revealed
    val roundNo = if (inRound) r?.round ?: 1 else m?.nextRound ?: (m?.roundsPlayed?.plus(1) ?: 1)
    val total = m?.roundsTotal ?: 12
    val banker = if (inRound) r?.banker ?: 1 else m?.nextBanker ?: bankerFor(roundNo)
    val canBet = t != null && t.eligible && !revealing && (phase == "betting" || (revealed && !matchOver))
    val nextBanker = if (revealed) bankerFor(roundNo + 1) else banker
    val players = r?.players ?: emptyList()
    val me = players.find { it.isYou }
    val name = user?.shownName ?: "You"
    val outcomeText = when {
        r == null || r.resultGold == null -> ""
        r.luckyLabel != null && !r.luckyFailed -> "Declared Luck — ${r.luckyLabel}"
        r.luckyFailed -> if (r.banker == 1) "Declared Luck failed — 2× bet to each player" else "Declared Luck failed — 2× bet"
        r.misplaced -> if (r.banker == 1) "Misplaced cards — 2× penalty to each player" else "Misplaced cards — 2× penalty"
        r.banker == 1 -> "You banked · beat ${players.count { !it.isYou && it.gold < 0 }} of 3"
        r.resultLanes == null -> ""
        else -> { val w = r.resultLanes.values.count { it > 0 }; "$w-${3 - w} vs ${r.bankerName} · ${kotlin.math.abs(r.resultMultiple ?: 0)}× bet" }
    }

    @Composable
    fun botStatus(seat: Int) {
        val p = players.find { it.seat == seat }
        when {
            revealing -> Txt("Submitted ✓", 17, color = C.Mint)
            revealed && p != null -> Txt(signed(p.gold) + (p.lucky?.let { " · $it" } ?: ""), 17, color = toneColor(p.gold))
            phase == "arranging" && dealing != null -> Txt("Dealing…", 17, color = Color(0xCCFFFFFF))
            phase == "arranging" -> Txt("Ready ✓" + if (p != null && !p.isBanker) " · Bet ${fmt(p.bet)}" else "", 17, color = C.Mint)
            else -> {
                val s = m?.standings?.find { it.first == seat }
                if (s != null && m.roundsPlayed > 0) Txt(signed(s.third), 17, color = toneColor(s.third)) else Txt("Waiting", 17, color = Color(0xB3FFFFFF))
            }
        }
    }

    @Composable
    fun betControls() {
        if (!canBet || t == null) return
        if (nextBanker == 1) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                Box(
                    Modifier.height(86.u).tap(enabled = !busy, label = "Deal") { placeBet(null) }.lip(7, Color(0xFF8A4A00), 999).clip(RoundedCornerShape(999.u))
                        .background(Brush.verticalGradient(listOf(Color(0xFFFFD13A), Color(0xFFE08A00)))).border(5.u, Color(0xFFFFF3A0), RoundedCornerShape(999.u)).padding(horizontal = 32.u),
                    contentAlignment = Alignment.Center,
                ) { Txt(if (busy) "Dealing…" else "Deal", 36, color = C.Brown) }
                Txt((if (revealed) "Round ${roundNo + 1}: you bank. " else "") + "You're the banker — no bet needed. You cover the other players' bets.", 19, color = Color(0xD9FFFFFF), modifier = Modifier.weight(1f))
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.u)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.u), verticalAlignment = Alignment.CenterVertically) {
                    t.bets.forEachIndexed { i, b ->
                        BetChipButton(if (b >= 10000) "${b / 1000}K" else "$b", i, if (revealed) 92 else 100, bet == b, !busy) { placeBet(b) }
                    }
                }
                Txt(if (busy) "Dealing…" else if (revealed) "Round ${roundNo + 1}: ${if (bankerFor(roundNo + 1) == 1) "you bank" else "${BOTS[bankerFor(roundNo + 1)]} banks"} — pick a bet" else "Tap a chip to deal", 19, color = Color(0xD9FFFFFF))
            }
        }
    }

    Stage(background = { Scene("lantern") }) {
        Art("table", Modifier.fillMaxSize())
        TableControls(onBack = leave, onSettings = { panel = "settings" }, onHelp = { panel = "help" })
        WalletHud(Modifier.at(905, 12), "Total Gold", gold?.total, "icon-gold", sub = gold?.let { g -> (g.total - g.gold).takeIf { it > 0 }?.let { "${fmt(it)} in play" } })
        BetPill(if (banker == 1) (if (inRound) "Covering ${fmt(r?.covered ?: 0.0)}" else "Banker · no bet") else "Bet: ${fmt(if (inRound) r?.bet ?: bet.toDouble() else bet.toDouble())} Gold", "icon-gold")
        InfoPills(
            { Runs(22, "Round ${minOf(roundNo, total)} / $total · " to Color.White, banksText(banker) to C.Gold) },
            m?.let { mm -> { Runs(18, "${t?.name ?: ""} · Match " to Color(0xE6FFFFFF), signed(mm.gold) to toneColor(mm.gold)) } },
        )

        TableCrest(minOf(roundNo, total), total, if (revealing) null else ({
            StatusPill("") {
                when {
                    phase == "loading" -> Txt("Setting up the table…", 19, align = TextAlign.Center)
                    phase == "betting" && t != null -> Txt(if (t.eligible) "${t.name} · ${if (banker == 1) "You are the banker — tap Deal" else "${BOTS[banker]} is the banker — tap a chip to bet"}" else "You need at least ${fmt(t.minGold)} gold to play ${t.name}", 19, align = TextAlign.Center)
                    phase == "arranging" -> Txt(if (dealing != null) "Shuffling and dealing…" else "Arrange Front 3 · Middle 5 · Back 5", 19, align = TextAlign.Center)
                    revealed && r?.resultGold != null -> Runs(19, "Round ${r.round} · " to Color.White, "${signed(r.resultGold)} Gold" to toneColor(r.resultGold), " · $outcomeText" to Color.White)
                    else -> Txt("4 players · every lane vs the banker · 3-0 pays 2× · 2-1 pays 1×", 19, align = TextAlign.Center)
                }
            }
        }))
        // The three bots: LuckyBot left, CardBot top, AceBot right.
        (2..4).forEach { seat ->
            val p = players.find { it.seat == seat }
            val shown = revealed && p?.rows != null
            HandPanel(
                BOT_SPOT.getValue(seat), BOTS.getValue(seat), { Avatar(BOT_AVATARS[seat], seat, 116, square = true) },
                status = { botStatus(seat) },
                banker = banker == seat,
                glow = revealed && !revealing && (p?.gold ?: 0.0) > 0,
                cards = when {
                    shown -> PanelCards.Shown(p!!.rows!!, p.labels, p.lanes,
                        up = reveal?.second?.let { plan -> { l, i -> plan.isUp(nowShow, seat, l, i) } },
                        laneShown = reveal?.second?.let { plan -> { l -> plan.laneShown(nowShow, l) } })
                    phase == "arranging" && dealing == null -> PanelCards.Backs
                    else -> PanelCards.Empty
                },
                extra = if (shown) ({ HandBadges(p?.lucky, p?.isFoul == true, false) }) else null,
            )
        }

        if (banker == 1 && !matchOver) BankerRibbon()

        // Your seat: your revealed hand, or the bet chips / Deal / status.
        HandPanel(
            Spot.Bottom, name, { Avatar(user?.avatar, user?.id, 140, square = true) },
            status = if (revealed && !revealing && r?.resultGold != null) ({ Txt("${signed(r.resultGold)} Gold", 16, color = toneColor(r.resultGold)) }) else null,
            banker = banker == 1,
            glow = revealed && !revealing && (r?.resultGold ?: 0.0) > 0,
            cards = if (revealed && me?.rows != null) PanelCards.Shown(me.rows, me.labels, me.lanes,
                up = reveal?.second?.let { plan -> { l, i -> plan.isUp(nowShow, 1, l, i) } },
                laneShown = reveal?.second?.let { plan -> { l -> plan.laneShown(nowShow, l) } }) else null,
            extra = if (revealed && me != null) ({ HandBadges(r?.luckyLabel?.takeIf { r.luckyFailed.not() }, r?.misplaced == true, r?.luckyFailed == true) }) else null,
        ) {
            Column {
                if (!revealed) betControls()
                if ((phase == "betting" || phase == "loading") && t != null && !t.eligible) Txt("Not enough gold for ${t.name}", 26, color = Color(0xCCFFFFFF))
                if (phase == "arranging") Txt(if (dealing != null) "Shuffling and dealing…" else "Arranging your 13 cards…", 22, color = Color(0xD9FFFFFF))
            }
        }

        // After a reveal: the next round's bet (or Deal) and Results beside your hand.
        if (revealed && !revealing && (canBet || matchOver)) {
            Box(
                Modifier.at(1170, 588).width(410.u).lip(8, Color(0x59000000), 24).clip(RoundedCornerShape(24.u))
                    .background(Brush.verticalGradient(listOf(Color(0xF26E0B10), Color(0xF22A0305)))).border(3.u, Color(0xCCD9A441), RoundedCornerShape(24.u)).padding(12.u),
            ) {
                if (matchOver && m != null) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.u)) {
                        Runs(24, "Match over · " to Color.White, "${signed(m.gold)} Gold" to toneColor(m.gold))
                        Box(
                            Modifier.height(70.u).tap(label = "Results") { panel = "summary" }.lip(6, Color(0xFF8A4A00), 999).clip(RoundedCornerShape(999.u))
                                .background(Brush.verticalGradient(listOf(Color(0xFFFFD13A), Color(0xFFE08A00)))).border(5.u, Color(0xFFFFF3A0), RoundedCornerShape(999.u)).padding(horizontal = 32.u),
                            contentAlignment = Alignment.Center,
                        ) { Txt("Results", 28, color = C.Brown) }
                    }
                } else betControls()
            }
        }

        SortButton(sortBy, phase == "arranging") { sortBy = when (sortBy) { "dealt" -> "rank"; "rank" -> "suit"; else -> "dealt" }; Sound.play("tap") }

        if (r != null && dealing == r.id && phase == "arranging") {
            DealAnimation(r.id, r.banker, r.cards, mapOf(1 to "You") + BOTS) { dealing = null }
        }
        if (revealing) RevealBanner(reveal!!.second, nowShow) { reveal = null; round?.let(::resultSound) }

        // The shared arrangement popup (Single Player adapter: /practice preview, submit, lucky).
        if (phase == "arranging" && r != null && r.status == "arranging" && dealing != r.id) {
            ArrangePopup(
                r.id, r.cards, sortedRows(ph.pusoy13.game.core.dealtRows(r.cards), sortBy).takeIf { sortBy != "dealt" },
                "${r.tierName} · R${r.round} · ${banksText(r.banker)}",
                if (r.banker == 1) "Covering ${fmt(r.covered)}" else "Bet: ${fmt(r.bet)}",
                "/practice/${r.id}/preview", declaring, busy,
                onDeclare = declare, onSubmit = submit,
            ) {
                WalletHud(Modifier.at(1080, 668), "Total Gold", gold?.total, "icon-gold")
            }
        }

        notice?.let { n -> LuckNotice(n, r) { notice = null } }
        if (leaving != null && !revealing) {
            Column(
                Modifier.at(420, 300).width(760.u).lip(10, Color(0xFF7A3E00), 36).clip(RoundedCornerShape(36.u)).background(Brush.verticalGradient(listOf(Color(0xFF7A1FD1), Color(0xFF2A0758))))
                    .border(6.u, C.Gold, RoundedCornerShape(36.u)).padding(horizontal = 56.u, vertical = 24.u),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Txt("Out of Gold!", 64, color = C.Gold, stroke = Color(0x80000000), strokeWidth = 4)
                Txt("Single Player has ended. Returning to Home…", 28, color = Color(0xD9FFFFFF), align = TextAlign.Center)
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
                ph.pusoy13.game.ui.CandyButton("Keep Playing", Modifier.padding(top = 18.u).size(320.u, 78.u), size = 30) { panel = null }
            }
            "summary" -> m?.let { mm ->
                Modal("MATCH OVER", null, width = 900) {
                    Txt("${mm.tierName} · ${mm.roundsPlayed} / ${mm.roundsTotal} rounds", 22, color = C.Cream)
                    Txt("${signed(mm.gold)} Gold", 44, color = toneColor(mm.gold))
                    Column(Modifier.width(620.u).padding(top = 10.u), verticalArrangement = Arrangement.spacedBy(6.u)) {
                        mm.standings.sortedByDescending { it.third }.forEachIndexed { i, (seat, sname, g) ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.u)).background(if (seat == 1) Color(0x40FFD13A) else Color(0x4D000000)).padding(horizontal = 16.u, vertical = 6.u), horizontalArrangement = Arrangement.spacedBy(12.u), verticalAlignment = Alignment.CenterVertically) {
                                Txt(if (i == 0) "👑" else "${i + 1}", 24, color = C.Gold, modifier = Modifier.width(40.u))
                                Avatar(if (seat == 1) user?.avatar else BOT_AVATARS[seat], if (seat == 1) user?.id else seat, 40)
                                Txt(if (seat == 1) "You" else sname, 24, modifier = Modifier.weight(1f))
                                Txt(signed(g), 24, color = toneColor(g))
                            }
                        }
                    }
                    Row(Modifier.padding(top = 20.u), horizontalArrangement = Arrangement.spacedBy(18.u)) {
                        ph.pusoy13.game.ui.CandyButton("Play Again", Modifier.size(280.u, 76.u), Tone.Green, size = 30) {
                            panel = null
                            tier?.let { tt -> scope.launch { runCatching { newMatch(tt); Sound.play("tap") }.onFailure { toast.show(false, errorText(it)) } } }
                        }
                        ph.pusoy13.game.ui.CandyButton("Change Level", Modifier.size(300.u, 76.u), size = 30) { Nav.replace(Route.Home(picker = true)) }
                        ph.pusoy13.game.ui.CandyButton("Home", Modifier.size(200.u, 76.u), Tone.Dark, size = 30) { Nav.reset(Route.Home()) }
                    }
                }
            }
        }
        ToastHost(toast, 120)
    }
}

/** DECLARED LUCK! / NO LUCK! popup (practice/page.tsx `notice`). */
@Composable
private fun LuckNotice(kind: String, r: RoundState?, onClose: () -> Unit) {
    val lucky = kind == "lucky"
    Box(Modifier.fillMaxSize().background(Color(0x8C000000)), contentAlignment = Alignment.Center) {
        Box(Modifier.width(640.u).lip(12, Color(0xFF7A3E00), 44).goldRim(44, 10).padding(10.u)) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(36.u)).background(Brush.radialGradient(if (lucky) listOf(Color(0xFFB06BFF), Color(0xFF4A0F9A)) else listOf(Color(0xFF8F1015), Color(0xFF3A0204)))).padding(start = 32.u, end = 32.u, top = 24.u, bottom = 32.u),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Art("clover", Modifier.size(150.u), animate = false)
                CandyText(if (lucky) "DECLARED LUCK!" else "NO LUCK!", 580, 110, if (lucky) 72 else 92, stroke = if (lucky) Color(0xFF2A0660) else Color(0xFF5A0606), fill = if (lucky) listOf(Color(0xFFFFFBE0), Color(0xFFFFE14D), Color(0xFFFFA514)) else listOf(Color.White, Color(0xFFFFD0D0), Color(0xFFFF8A8A)))
                if (lucky && r?.luckyLabel != null) {
                    Txt("${r.luckyLabel.uppercase()} – LUCKY HAND", 40, align = TextAlign.Center)
                    Txt("Double winnings · 2× bet${if (r.banker == 1) " from each bot" else ""}", 26, color = Color(0xD9FFFFFF), align = TextAlign.Center)
                    Txt("${signed(r.resultGold ?: 0.0)} Gold", 44, color = toneColor(r.resultGold ?: 0.0))
                } else if (r?.luckyFailed == true) {
                    Txt("No 3-Flushes, 3-Straight, No Faces or 6 Pairs in your 13 cards — 2× bet penalty.", 26, color = Color(0xE6FFFFFF), align = TextAlign.Center)
                    Txt("Declaration failed · 2× bet${if (r.banker == 1) " to each bot" else ""}", 28, align = TextAlign.Center)
                    Txt("${signed(r.resultGold ?: 0.0)} Gold", 44, color = toneColor(r.resultGold ?: 0.0))
                } else {
                    Txt("Your cards do not qualify for Declared Luck. Keep arranging and play the hand normally.", 28, color = Color(0xE6FFFFFF), align = TextAlign.Center)
                }
                Box(
                    Modifier.padding(top = 24.u).size(240.u, 80.u).tap(label = "OK", onClick = onClose).lip(6, Color(0xFF8A4A00), 999).clip(RoundedCornerShape(999.u))
                        .background(Brush.verticalGradient(listOf(Color(0xFFFFD13A), Color(0xFFE08A00)))).border(5.u, Color(0xFFFFF3A0), RoundedCornerShape(999.u)),
                    contentAlignment = Alignment.Center,
                ) { Txt("OK", 40, color = C.Brown) }
            }
        }
    }
}

private fun resultSound(r: RoundState) {
    val g = r.resultGold ?: 0.0
    Sound.play(if (g > 0) "win" else if (g < 0) "lose" else "start")
}
