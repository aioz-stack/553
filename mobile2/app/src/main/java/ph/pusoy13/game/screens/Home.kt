package ph.pusoy13.game.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.GoldWallet
import ph.pusoy13.game.core.Level
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.TableState
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.obj
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyText
import ph.pusoy13.game.ui.Glitter
import ph.pusoy13.game.ui.LocalUnit
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.bob
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.spring
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u
import kotlin.math.cos
import kotlin.math.sin

/**
 * Reconnection: when a screen opens, the app returns to the foreground or the network comes back,
 * ask the server for your current seat. A match you are seated in that is still being played takes
 * you straight back to it; the table then restores your round, cards and saved arrangement.
 */
@Composable
fun ResumeMatch(onSeat: (TableState?) -> Unit = {}) {
    val user by Session.user.collectAsState()
    val check: suspend () -> Unit = {
        runCatching {
            val r = Api.get("/tables/current")
            val seat = r.obj("data")?.let(TableState::of)
            onSeat(seat)
            if (seat != null && seat.status == "IN_GAME") Nav.replace(Route.Play(seat.id))
        }
    }
    LaunchedEffect(user?.id) { if (user != null) check() }
    LaunchedEffect(Unit) { Session.resumed.collect { if (Session.user.value != null) check() } }
}

/** Animates a number from its previous value to the new one (0.9 s ease-out), like useCountUp. */
@Composable
fun countUp(target: Double?): Double? {
    if (target == null) return null
    val a = remember { Animatable(target.toFloat()) }
    LaunchedEffect(target) { a.animateTo(target.toFloat(), tween(900, easing = androidx.compose.animation.core.CubicBezierEasing(0.33f, 1f, 0.68f, 1f))) }
    return a.value.toDouble()
}

/**
 * Landscape main menu — mobile/src/app/home/page.tsx on its 1600×900 stage: profile + level, logo
 * crest, Gold / Chips / Keys wallets, Friends List, Single Player, Multiplayer, Shop, Settings and
 * Logout. Balances are live from the server; nothing here changes a balance.
 */
@Composable
fun HomeScreen(route: Route.Home) {
    val user by Session.user.collectAsState()
    val balances by Session.balances.collectAsState()
    val gold by Session.gold.collectAsState()
    var level by remember { mutableStateOf<Level?>(null) }
    var seat by remember { mutableStateOf<TableState?>(null) }
    var panel by remember { mutableStateOf<String?>(if (route.picker) "picker" else null) }
    var outOfGold by remember { mutableStateOf<GoldWallet?>(null) }
    val scope = rememberCoroutineScope()

    ResumeMatch { seat = it }
    LaunchedEffect(user?.id) {
        if (user == null) return@LaunchedEffect
        Session.reloadWallets()
        runCatching { level = Level.of(Api.get("/profile/stats").data().obj("level")) }
    }
    LaunchedEffect(route.goldOut) {
        if (route.goldOut) runCatching { GoldWallet.of(Api.get("/practice/gold").data()).let { if (it.outOfGold) outOfGold = it } }
    }
    /** Single Player: Out of Gold opens the free Gold popup instead of the level picker. */
    val openPicker: () -> Unit = {
        scope.launch {
            val g = runCatching { GoldWallet.of(Api.get("/practice/gold").data()) }.getOrNull()
            if (g?.outOfGold == true) outOfGold = g else panel = "picker"
        }
    }

    val lv = level ?: user?.level
    val name = user?.shownName ?: ""
    val xp = lv?.let { (it.intoLevel.toFloat() / it.forNext.coerceAtLeast(1)).coerceIn(0f, 1f) } ?: 0f

    Stage(background = { Scene("beach") }) {
        // Profile (display only); the pencil badge opens Choose Your Avatar.
        Row(Modifier.at(40, 22), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Box(Modifier.spring("avatar", "soft", 4f, 1f).lip(8, Color(0xFF8A4A00), 999).goldRim(999, 8).padding(8.u)) {
                Box(Modifier.size(150.u).goldRim(999, 3, avatar = true, glint = false).padding(3.u)) { Avatar(user?.avatar, user?.id, 144) }
            }
            Column {
                CandyText(if (name.length > 14) name.take(13) + "…" else name, 340, 70, 52, stroke = Color(0xFF3A2210), fill = listOf(Color.White, Color.White, Color(0xFFF2ECE0)), sweepDelay = 0.8f)
                Box(Modifier.padding(top = 4.u).size(330.u, 52.u).lip(5, Color(0xFF8A4A00), 999).goldRim(999, 5).padding(5.u)) {
                    Row(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Color(0xFF241433)).padding(end = 8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Box(Modifier.padding(start = 0.u).height(44.u).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD75A), Color(0xFFE89A00)))).padding(horizontal = 12.u), contentAlignment = Alignment.Center) {
                            Txt("Lv. ${lv?.level ?: 1}", 28, color = Color(0xFF5A2600))
                        }
                        Box(Modifier.weight(1f).height(22.u).clip(RoundedCornerShape(999.u)).background(Color(0x99000000))) {
                            Box(Modifier.fillMaxHeight().fillMaxWidth(xp).clip(RoundedCornerShape(999.u)).goldRim(999, 0, glint = false))
                        }
                    }
                }
            }
        }

        // Logo crest (LogoCrest: crest art + "Pusoy 553" title + glitter, bobbing slowly)
        Box(Modifier.at(488, 0, 600, 250).bob(5f)) {
            Art("home-crest", Modifier.fillMaxSize())
            Art("home-title", Modifier.at(20, 90, 560, 120))
            Glitter(8, 3, 1.2f)
        }

        WalletStack(Modifier.at(1220, 50), gold?.let { countUp(kotlin.math.floor(it.total)) }, balances.chips?.let { countUp(kotlin.math.floor(it)) }, balances.keys?.let { countUp(kotlin.math.floor(it)) }) { panel = "shop" }

        FriendsPanel(Modifier.at(25, 215, 440, 660))

        seat?.let { s ->
            Row(
                Modifier.at(495, 228, 640, 46).tap { Nav.go(Route.Play(s.id)) }.clip(RoundedCornerShape(999.u)).background(Color(0xE60F2A1C)).border(4.u, Color(0xFF4EE36B), RoundedCornerShape(999.u)),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(16.u).clip(CircleShape).background(Color(0xFF4EE36B)))
                Txt("   You have a seat at ${s.roomName} — tap to return", 26, maxLines = 1)
            }
        }

        // Play tiles: Single Player (difficulty picker) and Multiplayer (lobby)
        Tile(495, 284, 520, 350, Color(0xFFC477FF), Color(0xFF5A14B8), "Single Player", 0.4f, onClick = openPicker) {
            Art("tile-single-art", Modifier.at(41, 14, 440, 250))
            Art("label-single", Modifier.at(15, 233, 490, 100))
        }
        Tile(1040, 284, 520, 350, Color(0xFFFF6B5C), Color(0xFF9C0A12), "Multiplayer", 1.2f, onClick = { Nav.go(Route.Lobby) }) {
            Art("tile-multi-art", Modifier.at(41, 14, 440, 250))
            Art("label-multi", Modifier.at(15, 233, 490, 100))
        }
        // Controls: Shop, Settings, Logout
        Tile(515, 660, 320, 210, Color(0xFF5EF08A), Color(0xFF0F7A34), "Shop", 2.0f, onClick = { panel = "shop" }) {
            Art("tile-shop-art", Modifier.at(100, 26, 120, 104))
            Art("label-shop", Modifier.at(10, 127, 300, 64))
        }
        Tile(858, 660, 320, 210, Color(0xFF6FD4FF), Color(0xFF1560D0), "Settings", 2.6f, onClick = { panel = "settings" }) {
            Art("tile-settings-art", Modifier.at(105, 23, 110, 100))
            Art("label-settings", Modifier.at(10, 123, 300, 64))
        }
        Tile(1201, 660, 320, 210, Color(0xFFFF86B6), Color(0xFFD81B60), "Logout", 3.2f, onClick = { scope.launch { Session.logout() } }) {
            Art("tile-logout-art", Modifier.at(100, 23, 120, 100))
            Art("label-logout", Modifier.at(10, 123, 300, 64))
        }

        // Change avatar / nickname: the pencil badge on your portrait.
        Box(
            Modifier.at(150, 136, 54, 54).tap(label = "Change avatar") { panel = "avatar" }.lip(4, Color(0xFF8A4A00), 999).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))).border(4.u, Color.White, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Txt("✎", 26, color = Color(0xFF4A1D00), font = ph.pusoy13.game.ui.Body) }

        when (panel) {
            "settings" -> SettingsPanel { panel = null }
            "shop" -> ShopPanel { panel = null }
            "avatar" -> AvatarPicker { panel = null }
            "picker" -> SinglePlayerPicker({ panel = null }) { tier, bet -> panel = null; Nav.go(Route.Practice(tier, bet)) }
        }
        outOfGold?.let { g -> OutOfGoldPopup(g, { outOfGold = null }) { outOfGold = null; panel = "picker" } }
    }
}

private data class Burst(val id: Long, val x: Float, val y: Float)

/**
 * Big glossy tile (home/page.tsx `Tile`): shimmering gold frame (11 px) with corner studs, a glossy
 * radial dome with a light sweep, glitter, an idle spring bounce, a squish on press and gold stars
 * that fly out where it is tapped. Children are placed in tile coordinates.
 */
@Composable
fun BoxScope.Tile(x: Int, y: Int, w: Int, h: Int, from: Color, to: Color, label: String, sweepDelay: Float, onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) {
    val bursts = remember { mutableStateListOf<Burst>() }
    val u = LocalUnit.current
    val scope = rememberCoroutineScope()
    Box(
        Modifier.at(x, y, w, h).spring(label, "tile", 3.2f, 1.4f)
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val e = awaitPointerEvent()
                        val p = e.changes.firstOrNull() ?: continue
                        if (p.pressed && !p.previousPressed) {
                            val b = Burst(System.nanoTime(), p.position.x / u, p.position.y / u)
                            bursts.add(b)
                            scope.launch { delay(750); bursts.remove(b) }
                        }
                    }
                }
            }
            .tap(label = label, onClick = onClick),
    ) {
        Box(Modifier.fillMaxSize().lip(12, Color(0xFF8A4A00), 44).goldRim(44, 11, glintDelay = sweepDelay).padding(11.u)) {
            Box(
                Modifier.fillMaxSize().clip(RoundedCornerShape(34.u)).background(
                    Brush.radialGradient(listOf(from, to), center = Offset((w - 22) * 0.5f * u, (h - 22) * 0.22f * u), radius = (w - 22) * 0.85f * u),
                ).gloss(sweepDelay),
            ) {
                Glitter(10, x + y)
            }
        }
        Box(Modifier.fillMaxSize(), content = content)
        // gold corner studs
        listOf(Alignment.TopStart, Alignment.TopEnd, Alignment.BottomStart, Alignment.BottomEnd).forEach {
            Box(Modifier.align(it).padding(14.u).size(14.u).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFFFFFBE0), Color(0xFFE09000)))))
        }
        bursts.forEach { b -> key(b.id) { BurstStars(b) } }
    }
}

/** Gold star particles flying out from a tap point (lx-burst, 0.7 s). */
@Composable
private fun BurstStars(b: Burst) {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { a.animateTo(1f, tween(700, easing = androidx.compose.animation.core.CubicBezierEasing(0.1f, 0.8f, 0.3f, 1f))) }
    val u = LocalUnit.current
    Canvas(Modifier.fillMaxSize()) {
        val k = a.value
        repeat(9) { i ->
            val ang = (i / 9f) * Math.PI * 2 + (b.id % 1000) / 159.0
            val dist = (90 + (i * 37) % 60) * u
            val c = Offset(b.x * u + cos(ang).toFloat() * dist * k, b.y * u + sin(ang).toFloat() * dist * k)
            val s = 17 * u * (0.3f + 0.8f * k)
            rotate(160f * k, c) {
                val star = Path().apply {
                    moveTo(c.x, c.y - s); lineTo(c.x + s * 0.22f, c.y - s * 0.22f); lineTo(c.x + s, c.y); lineTo(c.x + s * 0.22f, c.y + s * 0.22f)
                    lineTo(c.x, c.y + s); lineTo(c.x - s * 0.22f, c.y + s * 0.22f); lineTo(c.x - s, c.y); lineTo(c.x - s * 0.22f, c.y - s * 0.22f); close()
                }
                drawPath(star, if (i % 3 != 0) Color(0xFFFFE14D) else Color.White, alpha = 1 - k)
                drawPath(star, Color(0xFFC47300), alpha = 1 - k, style = Stroke(1.5f * u))
            }
        }
    }
}

@Composable
private fun key(id: Long, content: @Composable () -> Unit) = androidx.compose.runtime.key(id) { content() }

private data class WalletTheme(val label: String, val frame: List<Color>, val body: List<Color>, val text: Color)

private val WALLET_THEMES = mapOf(
    "gold" to WalletTheme("Gold", listOf(Color(0xFFFFF3A0), Color(0xFFFFC531), Color(0xFFC27A04)), listOf(Color(0xFF6B4300), Color(0xFF2A1800)), Color(0xFFFFE14D)),
    "chips" to WalletTheme("Chips", listOf(Color(0xFFFFB3B3), Color(0xFFFF4A4A), Color(0xFF8A0A10)), listOf(Color(0xFF7A0A12), Color(0xFF2E0306)), Color(0xFFFFB3BD)),
    "keys" to WalletTheme("Keys", listOf(Color(0xFFE9C8FF), Color(0xFFA24DFF), Color(0xFF3A0B7A)), listOf(Color(0xFF3A0B7A), Color(0xFF160330)), Color(0xFFE2C4FF)),
)

/** The three wallet cards (lobby/WalletStack.tsx): Gold, Chips, Keys — information only; Keys (+) opens the Shop. */
@Composable
fun WalletStack(modifier: Modifier, gold: Double?, chips: Double?, keys: Double?, onBuyKeys: () -> Unit) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.u), horizontalAlignment = Alignment.End) {
        WalletCard("gold", gold, 0.6f) { Art("icon-gold", Modifier.size(48.u)) }
        WalletCard("chips", chips, 1.4f) { Art("icon-chips", Modifier.size(46.u)) }
        WalletCard("keys", keys, 2.2f, onBuyKeys) { Art("icon-keys", Modifier.size(46.u)) }
    }
}

@Composable
private fun WalletCard(kind: String, value: Double?, delay: Float, onPlus: (() -> Unit)? = null, icon: @Composable () -> Unit) {
    val t = WALLET_THEMES.getValue(kind)
    var last by remember { mutableStateOf(value) }
    var flash by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(value) {
        val before = last
        last = value
        if (value != null && before != null && value != before) {
            flash = if (value > before) "up" else "down"
            delay(1200)
            flash = null
        }
    }
    Box(Modifier.size(356.u, 64.u).lip(6, Color(0x59000000), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(t.frame)).padding(4.u)) {
        Row(
            Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(t.body)).gloss(delay).padding(start = 4.u, end = if (onPlus != null) 4.u else 12.u),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u),
        ) {
            icon()
            Txt(t.label.uppercase(), 14, color = t.text, modifier = Modifier.width(54.u))
            Txt(
                value?.let { ph.pusoy13.game.core.fmtWhole(it) } ?: "…", 27, modifier = Modifier.weight(1f), align = TextAlign.End, maxLines = 1,
                color = when (flash) { "up" -> Color(0xFF7DFF8A); "down" -> Color(0xFFFF9A9A); else -> Color.White },
            )
            if (onPlus != null) {
                Box(
                    Modifier.size(46.u).tap(label = "Buy Keys in the Shop", onClick = onPlus).lip(3, Color(0xFF0B6B2A), 999).clip(CircleShape)
                        .background(Brush.verticalGradient(listOf(Color(0xFF5EF08A), Color(0xFF13A344)))).border(3.u, Color(0xFFC8FFD8), CircleShape),
                    contentAlignment = Alignment.Center,
                ) { Txt("+", 30) }
            }
        }
    }
}

@Composable
fun Centered(text: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Txt(text, 30, align = TextAlign.Center) }
