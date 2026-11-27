package ph.pusoy13.game.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import kotlinx.coroutines.launch
import org.json.JSONObject
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Transaction
import ph.pusoy13.game.core.dataList
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt2
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.int
import ph.pusoy13.game.core.num
import ph.pusoy13.game.core.obj
import ph.pusoy13.game.core.str
import ph.pusoy13.game.core.text
import ph.pusoy13.game.core.titleCase
import ph.pusoy13.game.core.whenText
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.GoldIcon
import ph.pusoy13.game.ui.KeyIcon
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.RoundIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.WalletPill
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.u

private val CURRENCY = mapOf("CH" to "Chips", "GD" to "Gold", "KY" to "Keys")

/** A titled page on the lantern scene with a back button and a scrolling gold panel. */
@Composable
private fun Page(title: String, actions: @Composable BoxScope.() -> Unit = {}, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Stage(background = { Scene("lantern") }) {
        RoundIcon("Back", Modifier.at(24, 20), onClick = { Nav.back() }) { Txt("←", 40, color = C.Gold) }
        Txt(title, 56, modifier = Modifier.at(130, 26), color = C.Gold, stroke = Color(0xFF3A1300), strokeWidth = 8)
        actions()
        GoldFrame(Modifier.at(60, 130, 1480, 740), radius = 34, rim = 6, fill = Brush.verticalGradient(listOf(Color(0xF25A0C18), Color(0xF22A0410)))) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.u), verticalArrangement = Arrangement.spacedBy(10.u)) { content() }
        }
    }
}

/** Wallet: the three separate balances and the transaction history (filter by currency). */
@Composable
fun WalletScreen() {
    val balances by Session.balances.collectAsState()
    val gold by Session.gold.collectAsState()
    var currency by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    var last by remember { mutableIntStateOf(1) }
    var rows by remember { mutableStateOf<List<Transaction>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { Session.reloadWallets() }
    LaunchedEffect(currency, page) {
        try {
            val r = Api.get("/wallet/transactions", mapOf("page" to page, "currency" to currency.ifBlank { null }))
            rows = r.dataList().map(Transaction::of)
            last = r.obj("meta")?.int("last_page", 1) ?: 1
            error = null
        } catch (e: Exception) {
            error = errorText(e)
        }
    }
    Page("Wallet", actions = {
        Row(Modifier.at(560, 30), horizontalArrangement = Arrangement.spacedBy(14.u)) {
            WalletPill({ GoldIcon(46) }, gold?.let { fmtWhole(it.total) } ?: "…", Modifier.size(300.u, 70.u), listOf(Color(0xFF6A3A00), Color(0xFF2A1400)))
            WalletPill({ ChipIcon(46) }, balances.chips?.let(::fmtWhole) ?: "…", Modifier.size(300.u, 70.u))
            WalletPill({ KeyIcon(42) }, balances.keys?.let(::fmtWhole) ?: "…", Modifier.size(300.u, 70.u), listOf(Color(0xFF5A1A9A), Color(0xFF24074A)))
        }
    }) {
        Txt("Gold is for Single Player, Chips for Multiplayer, Keys for lobby entry. They are separate and never cash.", 20, color = C.White.copy(alpha = 0.7f))
        Row(horizontalArrangement = Arrangement.spacedBy(12.u)) {
            listOf("" to "All", "CH" to "Chips", "GD" to "Gold", "KY" to "Keys").forEach { (c, l) ->
                CandyButton(l, Modifier.size(160.u, 58.u), if (currency == c) Tone.Gold else Tone.Dark, size = 24) { currency = c; page = 1 }
            }
        }
        error?.let { Txt(it, 22, color = C.Pink) }
        val list = rows
        when {
            list == null -> Txt("Loading…", 26)
            list.isEmpty() -> Txt("No transactions yet.", 26, color = C.White.copy(alpha = 0.6f))
            else -> list.forEach { tx ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.u)).background(Color(0x40000000)).padding(horizontal = 18.u, vertical = 10.u), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Txt(titleCase(tx.type), 24)
                        Txt("${tx.reference} · ${whenText(tx.createdAt)}${tx.reason?.let { " · $it" } ?: ""}", 17, color = C.White.copy(alpha = 0.6f), maxLines = 1)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        val out = tx.direction == "out"
                        Txt("${if (out) "−" else "+"}${fmt2(tx.amount)} ${CURRENCY[tx.currency] ?: tx.currency}", 24, color = if (out) C.Pink else C.Mint)
                        tx.balanceAfter?.let { Txt("Balance ${fmt2(it)}", 16, color = C.White.copy(alpha = 0.6f)) }
                    }
                }
            }
        }
        if (last > 1) {
            Row(Modifier.align(Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(14.u), verticalAlignment = Alignment.CenterVertically) {
                CandyButton("‹ Prev", Modifier.size(180.u, 60.u), Tone.Dark, size = 24, enabled = page > 1) { page-- }
                Pill("Page $page of $last", size = 24)
                CandyButton("Next ›", Modifier.size(180.u, 60.u), Tone.Dark, size = 24, enabled = page < last) { page++ }
            }
        }
    }
}

/** Game history: your stats and the games you played (Multiplayer). */
@Composable
fun HistoryScreen() {
    var games by remember { mutableStateOf<List<JSONObject>?>(null) }
    var stats by remember { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(Unit) {
        runCatching { stats = Api.get("/profile/stats").obj("data") }
        runCatching { games = Api.get("/profile/games").dataList() }.onFailure { games = emptyList() }
    }
    Page("Game History") {
        stats?.let { st ->
            val r = st.obj("rounds")
            val b = st.obj("banker")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.u)) {
                listOf(
                    "Rounds" to "${r?.int("played") ?: 0}", "Won" to "${r?.int("won") ?: 0}", "Lost" to "${r?.int("lost") ?: 0}", "Tied" to "${r?.int("tied") ?: 0}",
                    "Lucky" to "${r?.int("lucky_hands") ?: 0}", "Banked" to "${b?.int("rounds") ?: 0}",
                ).forEach { (l, v) ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(18.u)).background(Color(0x40000000)).padding(10.u), horizontalAlignment = Alignment.CenterHorizontally) {
                        Txt(v, 34, color = C.Gold)
                        Txt(l, 18, color = C.White.copy(alpha = 0.7f))
                    }
                }
            }
        }
        val list = games
        when {
            list == null -> Txt("Loading…", 26)
            list.isEmpty() -> Txt("No games yet — go win one!", 26, color = C.White.copy(alpha = 0.6f))
            else -> list.forEach { g ->
                val res = g.obj("my_result")
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.u)).background(Color(0x40000000)).padding(horizontal = 18.u, vertical = 10.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.u)) {
                    Txt(res?.int("placement")?.let { listOf("🥇", "🥈", "🥉", "4️⃣").getOrNull(it - 1) } ?: "•", 30)
                    Column(Modifier.weight(1f)) {
                        Txt(g.obj("room")?.text("name") ?: "Game", 24, maxLines = 1)
                        Txt("#${g.int("id")} · ${whenText(g.str("started_at"))}", 17, color = C.White.copy(alpha = 0.6f))
                    }
                    if (res != null) {
                        Column(horizontalAlignment = Alignment.End) {
                            Txt("${res.int("score")} pts", 22, color = C.Gold)
                            val net = res.num("net")
                            Txt("${fmt2(net)} ${CURRENCY[g.text("currency")] ?: g.text("currency")}", 20, color = toneColor(net))
                        }
                    } else Pill(titleCase(g.text("status")), size = 18)
                }
            }
        }
    }
}

@Composable
fun NotificationsScreen() {
    var items by remember { mutableStateOf<List<JSONObject>?>(null) }
    val scope = rememberCoroutineScope()
    val load: () -> Unit = { scope.launch { runCatching { items = Api.get("/notifications").dataList() }.onFailure { items = emptyList() } } }
    LaunchedEffect(Unit) { load() }
    Page("Notifications", actions = {
        CandyButton("Mark all read", Modifier.at(1240, 34, 300, 64), Tone.Dark, size = 24) {
            scope.launch { runCatching { Api.post("/notifications/read") }; load() }
        }
    }) {
        val list = items
        when {
            list == null -> Txt("Loading…", 26)
            list.isEmpty() -> Txt("You're all caught up.", 26, color = C.White.copy(alpha = 0.6f))
            else -> list.forEach { n ->
                val d = n.obj("data")
                val unread = n.isNull("read_at")
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.u)).background(Color(0x40000000)).then(if (unread) Modifier.border(3.u, C.Gold.copy(alpha = 0.7f), RoundedCornerShape(16.u)) else Modifier).padding(horizontal = 18.u, vertical = 10.u),
                ) {
                    Txt(d?.str("title") ?: "Notification", 24)
                    d?.str("message")?.let { Txt(it, 20, color = C.White.copy(alpha = 0.8f)) }
                    Txt(whenText(n.str("created_at")), 16, color = C.White.copy(alpha = 0.5f), align = TextAlign.Start)
                }
            }
        }
    }
}
