package ph.pusoy13.game.screens

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.GoldWallet
import ph.pusoy13.game.core.Level
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.TableState
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.obj
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.GoldBrush
import ph.pusoy13.game.ui.GoldIcon
import ph.pusoy13.game.ui.KeyIcon
import ph.pusoy13.game.ui.Scene
import ph.pusoy13.game.ui.Stage
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.WalletPill
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

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

/**
 * Landscape main menu (the web app's 1600×900 Home): profile + level, logo crest, Gold / Chips /
 * Keys wallets, Friends, Single Player, Multiplayer, Shop, Settings and Logout. Balances are live
 * from the server (private wallet channel); nothing here changes a balance.
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
    // Single Player sends you here with goldOut when you run out of Gold.
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
        // Profile: avatar in a gold ring, name, level bar; the pencil badge opens Choose Your Avatar.
        Row(Modifier.at(40, 22), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
            Box(Modifier.size(166.u).clip(CircleShape).background(GoldBrush).padding(8.u)) { Avatar(user?.avatar, user?.id, 150) }
            Column {
                Txt(if (name.length > 14) name.take(13) + "…" else name, 52, stroke = Color(0xFF3A2210), strokeWidth = 8)
                Box(Modifier.size(330.u, 52.u).clip(RoundedCornerShape(999.u)).background(GoldBrush).padding(5.u)) {
                    Row(Modifier.fillMaxSize().clip(RoundedCornerShape(999.u)).background(Color(0xFF241433)).padding(end = 8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                        Box(Modifier.fillMaxHeight().clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD75A), Color(0xFFE89A00)))).padding(horizontal = 12.u), contentAlignment = Alignment.Center) {
                            Txt("Lv. ${lv?.level ?: 1}", 28, color = Color(0xFF5A2600))
                        }
                        Box(Modifier.weight(1f).height(22.u).clip(RoundedCornerShape(999.u)).background(Color(0x99000000))) {
                            Box(Modifier.fillMaxHeight().fillMaxWidth(xp).clip(RoundedCornerShape(999.u)).background(GoldBrush))
                        }
                    }
                }
            }
        }
        Box(Modifier.at(150, 136, 54, 54).tap(label = "Change avatar") { panel = "avatar" }.clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFFD34D), Color(0xFFE08A00)))).border(4.u, Color.White, CircleShape), contentAlignment = Alignment.Center) {
            Txt("✎", 26, color = C.Brown)
        }

        // Logo
        Art("home-crest", Modifier.at(500, 0, 576, 240))

        // Wallets: Gold (Single Player), Chips (Multiplayer), Keys — three separate balances.
        Column(Modifier.at(1246, 40), verticalArrangement = Arrangement.spacedBy(12.u)) {
            WalletPill({ GoldIcon(52) }, gold?.let { fmtWhole(it.total) } ?: "…", Modifier.size(330.u, 72.u), listOf(Color(0xFF6A3A00), Color(0xFF2A1400)))
            WalletPill({ ChipIcon(52) }, balances.chips?.let(::fmtWhole) ?: "…", Modifier.size(330.u, 72.u))
            WalletPill({ KeyIcon(48) }, balances.keys?.let(::fmtWhole) ?: "…", Modifier.size(330.u, 72.u), listOf(Color(0xFF5A1A9A), Color(0xFF24074A)), plus = { panel = "shop" })
        }

        FriendsPanel(Modifier.at(25, 215, 440, 660))

        seat?.let { s ->
            Row(
                Modifier.at(495, 228, 1065, 50).tap { Nav.go(Route.Play(s.id)) }.clip(RoundedCornerShape(999.u)).background(Color(0xE60F2A1C)).border(4.u, Color(0xFF4EE36B), RoundedCornerShape(999.u)),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(16.u).clip(CircleShape).background(Color(0xFF4EE36B)))
                Txt("  You have a seat at ${s.roomName} — tap to return", 26)
            }
        }

        Tile(495, 284, 520, 350, Color(0xFFC477FF), Color(0xFF5A14B8), "Single Player", onClick = openPicker) {
            Art("tile-single-art", Modifier.size(440.u, 250.u))
            Art("label-single", Modifier.size(490.u, 100.u).padding(top = 0.u))
        }
        Tile(1040, 284, 520, 350, Color(0xFFFF6B5C), Color(0xFF9C0A12), "Multiplayer", onClick = { Nav.go(Route.Lobby) }) {
            Art("tile-multi-art", Modifier.size(440.u, 250.u))
            Art("label-multi", Modifier.size(490.u, 100.u))
        }
        Tile(515, 660, 320, 210, Color(0xFF5EF08A), Color(0xFF0F7A34), "Shop", onClick = { panel = "shop" }) {
            Art("tile-shop-art", Modifier.size(120.u, 104.u))
            Art("label-shop", Modifier.size(300.u, 64.u))
        }
        Tile(858, 660, 320, 210, Color(0xFF6FD4FF), Color(0xFF1560D0), "Settings", onClick = { panel = "settings" }) {
            Art("tile-settings-art", Modifier.size(110.u, 100.u))
            Art("label-settings", Modifier.size(300.u, 64.u))
        }
        Tile(1201, 660, 320, 210, Color(0xFFFF86B6), Color(0xFFD81B60), "Logout", onClick = { scope.launch { Session.logout() } }) {
            Art("tile-logout-art", Modifier.size(120.u, 100.u))
            Art("label-logout", Modifier.size(300.u, 64.u))
        }

        when (panel) {
            "settings" -> SettingsPanel { panel = null }
            "shop" -> ShopPanel { panel = null }
            "avatar" -> AvatarPicker { panel = null }
            "picker" -> SinglePlayerPicker({ panel = null }) { tier, bet -> panel = null; Nav.go(Route.Practice(tier, bet)) }
        }
        outOfGold?.let { g -> OutOfGoldPopup(g, { outOfGold = null }) { outOfGold = null; panel = "picker" } }
    }
}

/** Big glossy tile: gold frame with corner studs around a radial gradient dome. */
@Composable
fun BoxScope.Tile(x: Int, y: Int, w: Int, h: Int, from: Color, to: Color, label: String, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(Modifier.at(x, y, w, h).tap(label = label, onClick = onClick)) {
        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(44.u)).background(GoldBrush).padding(11.u)) {
            Box(
                Modifier.fillMaxSize().clip(RoundedCornerShape(34.u)).background(Brush.radialGradient(listOf(from, to), center = androidx.compose.ui.geometry.Offset(w * 0.5f * ph.pusoy13.game.ui.LocalUnit.current, h * 0.22f * ph.pusoy13.game.ui.LocalUnit.current), radius = w * 0.85f * ph.pusoy13.game.ui.LocalUnit.current)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy((-20).u)) { content() }
            }
        }
        listOf(Alignment.TopStart, Alignment.TopEnd, Alignment.BottomStart, Alignment.BottomEnd).forEach {
            Box(Modifier.align(it).padding(14.u).size(14.u).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFFFFFBE0), Color(0xFFE09000)))))
        }
    }
}

@Composable
fun Centered(text: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Txt(text, 30, align = TextAlign.Center) }
