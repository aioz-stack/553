package ph.pusoy13.game.screens

import ph.pusoy13.game.ui.ts
import ph.pusoy13.game.ui.CandyText
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.foundation.text.BasicText
import androidx.compose.ui.text.TextStyle
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.zIndex
import ph.pusoy13.game.ui.softGlow
import ph.pusoy13.game.ui.popIn
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.bob
import ph.pusoy13.game.ui.at
import ph.pusoy13.game.ui.LocalClock
import ph.pusoy13.game.ui.Glitter
import ph.pusoy13.game.ui.Body
import ph.pusoy13.game.ui.Art
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.FriendsData
import ph.pusoy13.game.core.GoldWallet
import ph.pusoy13.game.core.Nav
import ph.pusoy13.game.core.PracticeTier
import ph.pusoy13.game.core.Route
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.ShopPack
import ph.pusoy13.game.core.ShopState
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.dataList
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.fmt
import ph.pusoy13.game.core.fmtWhole
import ph.pusoy13.game.core.idempotencyKey
import ph.pusoy13.game.core.instant
import ph.pusoy13.game.core.text
import ph.pusoy13.game.core.whenText
import ph.pusoy13.game.ui.AVATAR_IDS
import ph.pusoy13.game.ui.AVATAR_NAMES
import ph.pusoy13.game.ui.Avatar
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.CandyButton
import ph.pusoy13.game.ui.ChipIcon
import ph.pusoy13.game.ui.Divider
import ph.pusoy13.game.ui.Field
import ph.pusoy13.game.ui.GoldFrame
import ph.pusoy13.game.ui.GoldIcon
import ph.pusoy13.game.ui.KeyIcon
import ph.pusoy13.game.ui.Modal
import ph.pusoy13.game.ui.Pill
import ph.pusoy13.game.ui.Toggle
import ph.pusoy13.game.ui.Tone
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.avatarFor
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.u

// ---------------------------------------------------------------- Settings

private val Brown = Color(0xFF4A1D0A)

/**
 * Settings (components/SettingsPanel.tsx): audio (BGM, sound effects), motion quality and change
 * password, on the cream-and-orange panel with the pink SETTINGS ribbon. Settings follow the
 * account (PUT /profile/preferences); the password change is checked by the server.
 */
@Composable
fun SettingsPanel(onClose: () -> Unit) {
    var bgm by remember { mutableStateOf(Sound.musicOn) }
    var sfx by remember { mutableStateOf(Sound.sfxOn) }
    val motion = Session.motion.value
    val current = remember { mutableStateOf("") }
    val next = remember { mutableStateOf("") }
    val confirm = remember { mutableStateOf("") }
    var message by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val update: () -> Unit = {
        if (!busy) {
            when {
                current.value.isEmpty() || next.value.isEmpty() -> message = false to "Fill in your current and new password."
                next.value != confirm.value -> message = false to "The new passwords do not match."
                else -> {
                    busy = true
                    scope.launch {
                        message = try {
                            Api.put("/profile/password", Api.body("current_password" to current.value, "password" to next.value, "password_confirmation" to confirm.value))
                            current.value = ""; next.value = ""; confirm.value = ""
                            Sound.play("win")
                            true to "Password updated."
                        } catch (e: Exception) {
                            Sound.play("lose")
                            false to errorText(e)
                        }
                        busy = false
                    }
                }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0x8C000000)).tap(sound = null, onClick = onClose), contentAlignment = Alignment.TopCenter) {
        Box(Modifier.padding(top = 30.u).size(1060.u, 858.u).popIn("settings").tap(sound = null) {}) {
            Box(Modifier.fillMaxSize().lip(14, Color(0xFF6A2A0C), 58).clip(RoundedCornerShape(58.u)).background(Brush.verticalGradient(listOf(Color(0xFFF9B25A), Color(0xFFE8822C), Color(0xFFB14D12)))).padding(12.u)) {
                Column(Modifier.fillMaxSize().clip(RoundedCornerShape(48.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFF6E6), Color(0xFFFBE7CB)))).padding(start = 40.u, end = 40.u, top = 52.u)) {
                    SectionTab("st-speaker-w", "AUDIO SETTINGS")
                    SettingsCard(top = 28, bottom = 8) {
                        Row(Modifier.fillMaxWidth().height(66.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                            Art("st-music", Modifier.size(46.u), animate = false)
                            Column(Modifier.weight(1f)) { Txt("BGM", 27, color = Brown); Txt("(Background Music)", 19, color = Color(0xFF7A5A3A), font = Body, weight = FontWeight.Bold) }
                            SettingsToggle(bgm, "Background music") { bgm = !bgm; Session.savePrefs(bgm = bgm) }
                        }
                        Box(Modifier.fillMaxWidth().height(2.u).background(Color(0xFFEFCF9F)))
                        Row(Modifier.fillMaxWidth().height(66.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u)) {
                            Art("st-speaker", Modifier.size(46.u), animate = false)
                            Column(Modifier.weight(1f)) { Txt("Sound Effects", 27, color = Brown); Txt("(In-Game Sounds)", 19, color = Color(0xFF7A5A3A), font = Body, weight = FontWeight.Bold) }
                            SettingsToggle(sfx, "Sound effects") { sfx = !sfx; Session.savePrefs(sfx = sfx) }
                        }
                    }
                    Box(Modifier.height(8.u))
                    SectionTab("st-screen", "MOTION EFFECTS")
                    SettingsCard(top = 28, bottom = 16) {
                        Txt("Graphics and animation quality for a smoother gaming experience.", 21, color = Color(0xFF5A3A1A), font = Body, weight = FontWeight.Bold, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                        Row(Modifier.padding(top = 8.u).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.u)) {
                            listOf("low" to "Low", "medium" to "Medium", "high" to "High").forEach { (v, label) ->
                                val on = motion == v
                                Row(
                                    Modifier.weight(1f).height(60.u).tap(label = label) { Session.savePrefs(motionLevel = v) }.lip(6, if (on) Color(0xFF0B5E18) else Color(0xFFC08A4A), 999).clip(RoundedCornerShape(999.u))
                                        .background(Brush.verticalGradient(if (on) listOf(Color(0xFF4FE05F), Color(0xFF139A2A)) else listOf(Color(0xFFFFE2BD), Color(0xFFF2BD84))))
                                        .border(4.u, if (on) Color(0xFFFFE14D) else Color(0xFFF3D2A6), RoundedCornerShape(999.u)),
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u, Alignment.CenterHorizontally),
                                ) {
                                    Box(Modifier.size(38.u).clip(CircleShape).border(4.u, if (on) Color.White else Color(0xFF8A4A1C), CircleShape), contentAlignment = Alignment.Center) {
                                        if (on) Art("st-check", Modifier.size(22.u), animate = false)
                                    }
                                    Txt(label, 30, color = if (on) Color.White else Color(0xFF6A2A0C))
                                }
                            }
                        }
                    }
                    Box(Modifier.height(8.u))
                    SectionTab("st-lock-w", "CHANGE PASSWORD")
                    SettingsCard(top = 24, bottom = 4) {
                        PasswordRow("st-key", "Current Password", current, "Enter current password", true)
                        PasswordRow("st-lock", "New Password", next, "Enter new password", true)
                        PasswordRow("st-lock", "Confirm New Password", confirm, "Confirm new password", false)
                    }
                    val m = message
                    Row(
                        Modifier.align(Alignment.CenterHorizontally).padding(top = 8.u).height(42.u).clip(RoundedCornerShape(999.u))
                            .background(if (m?.first == true) Color(0xFFD7F8D4) else if (m != null) Color(0xFFFFD4D8) else Color(0xFFFBD9DF)).padding(horizontal = 24.u),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
                    ) {
                        val col = if (m?.first == true) Color(0xFF106A1F) else Color(0xFFB0102A)
                        Box(Modifier.size(28.u).clip(CircleShape).border(3.u, col, CircleShape), contentAlignment = Alignment.Center) { Txt(if (m?.first == true) "✓" else "i", 17, color = col) }
                        Txt(m?.second ?: "Password must be at least 8 characters and include letters and numbers.", 20, color = col, font = Body, weight = FontWeight.Bold, maxLines = 1)
                    }
                    Row(
                        Modifier.align(Alignment.CenterHorizontally).padding(top = 8.u).size(500.u, 74.u).alpha(if (busy) 0.7f else 1f).tap(enabled = !busy, label = "Update password", onClick = update)
                            .lip(7, Color(0xFF0B5E18), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF56E865), Color(0xFF119A28)))).border(5.u, Color(0xFFFFF07A), RoundedCornerShape(999.u)),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u, Alignment.CenterHorizontally),
                    ) {
                        Art("st-update", Modifier.size(40.u), animate = false)
                        Txt(if (busy) "UPDATING…" else "UPDATE PASSWORD", 34, stroke = Color(0x33000000), strokeWidth = 3)
                    }
                }
            }
            // the pink SETTINGS ribbon with laurels
            Row(Modifier.align(Alignment.TopCenter).offset(y = (-40).u), verticalAlignment = Alignment.Bottom) {
                Art("st-laurel", Modifier.size(60.u, 80.u), animate = false)
                Row(
                    Modifier.offset(y = 0.u).height(96.u).lip(7, Color(0xFF7A0A33), 40).clip(RoundedCornerShape(40.u)).background(Brush.verticalGradient(listOf(Color(0xFFFF6FA5), Color(0xFFEC2F78), Color(0xFFB80F4F))))
                        .border(5.u, Color(0xFFFFD34D), RoundedCornerShape(40.u)).padding(horizontal = 32.u),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u),
                ) {
                    Art("st-gear", Modifier.size(62.u), animate = false)
                    Art("st-title", Modifier.size(330.u, 86.u), animate = false)
                }
                Art("st-laurel", Modifier.size(60.u, 80.u).graphicsLayer { scaleX = -1f }, animate = false)
            }
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = 30.u, y = (-30).u).size(100.u).tap(label = "Close", onClick = onClose).lip(7, Color(0xFF6B0606), 999).clip(CircleShape)
                    .background(Brush.verticalGradient(listOf(Color(0xFFFF6B5C), Color(0xFFC0101A)))).border(6.u, Color(0xFFFFD34D), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Txt("✕", 46) }
        }
    }
}

@Composable
private fun SectionTab(icon: String, title: String) {
    Row(
        Modifier.padding(start = 16.u).zIndex(1f).height(50.u).lip(4, Color(0x73501E05), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFFA8521F), Color(0xFF6A2A0C)))).padding(end = 28.u),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(66.u, 50.u).clip(RoundedCornerShape(16.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFB347), Color(0xFFE0700A)))).border(3.u, Color(0xFFFFE6A8), RoundedCornerShape(16.u)), contentAlignment = Alignment.Center) {
            Art(icon, Modifier.size(38.u), animate = false)
        }
        Txt(title, 27, modifier = Modifier.padding(start = 12.u), stroke = Color(0xFF3A1300), strokeWidth = 3)
    }
}

@Composable
private fun SettingsCard(top: Int, bottom: Int, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier.overlapUp(22).fillMaxWidth().clip(RoundedCornerShape(28.u)).background(Color(0xFFF9E4C4)).border(3.u, Color(0xFFEFCF9F), RoundedCornerShape(28.u)).padding(start = 24.u, end = 24.u, top = top.u, bottom = bottom.u),
        content = content,
    )
}

/** The ON / OFF switch of the Settings panel (150 × 60). */
@Composable
private fun SettingsToggle(on: Boolean, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(150.u, 60.u).tap(label = label, onClick = onClick).lip(5, if (on) Color(0xFF0B5E18) else Color(0xFF6B5640), 999).clip(RoundedCornerShape(999.u))
            .background(Brush.verticalGradient(if (on) listOf(Color(0xFF3FD04F), Color(0xFF138A24)) else listOf(Color(0xFFC9B49B), Color(0xFF9A8268)))).border(4.u, if (on) Color(0xFF9CF08A) else Color(0xFFE3CFB5), RoundedCornerShape(999.u)),
    ) {
        Txt(if (on) "ON" else "OFF", 27, modifier = Modifier.align(if (on) Alignment.CenterStart else Alignment.CenterEnd).padding(horizontal = 16.u))
        Box(Modifier.align(Alignment.CenterStart).offset(x = if (on) 92.u else 4.u).size(46.u).clip(CircleShape).background(Brush.verticalGradient(listOf(Color.White, Color(0xFFDCDCDC)))))
    }
}

@Composable
private fun PasswordRow(icon: String, label: String, state: androidx.compose.runtime.MutableState<String>, hint: String, divider: Boolean) {
    var show by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().height(56.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
        Box(Modifier.width(44.u), contentAlignment = Alignment.Center) { Art(icon, Modifier.size(38.u), animate = false) }
        Txt(label, 25, color = Brown, modifier = Modifier.width(270.u), maxLines = 1)
        Box(Modifier.weight(1f).height(48.u).clip(RoundedCornerShape(14.u)).background(Color(0xFFFFFAF2)).border(2.u, Color(0xFFD9C2A3), RoundedCornerShape(14.u)).padding(start = 16.u, end = 8.u), contentAlignment = Alignment.CenterStart) {
            BareInput(state, hint, Modifier.fillMaxWidth().padding(end = 44.u), hintColor = Color(0xFFA8957F), size = 22, color = Color(0xFF3A2410), password = true, shown = show)
            Box(Modifier.align(Alignment.CenterEnd).tap(sound = null, label = if (show) "Hide $label" else "Show $label") { show = !show }) { Art("st-eye", Modifier.size(30.u), animate = false) }
        }
    }
    if (divider) Box(Modifier.fillMaxWidth().height(2.u).background(Color(0xFFEFCF9F)))
}

// ---------------------------------------------------------------- Shop

private fun shopKeys(n: Int) = "$n ${if (n == 1) "KEY" else "KEYS"}"

/**
 * Shop (components/lobby/ShopModal.tsx): buy Keys with Chips (fixed packages) on the 80% gold-framed
 * popup — SHOP plaque, rate, balances, Keys tab + your exchanges, four key packages and the notice.
 * The server decides everything (GET /shop, POST /shop/key-exchanges): it checks the Chips, credits
 * the Keys, refuses duplicates (the idempotency key) and logs it. Every exchange needs an explicit
 * "final and non-refundable" OK.
 */
@Composable
fun ShopPanel(onClose: () -> Unit) {
    var state by remember { mutableStateOf<ShopState?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<ShopPack?>(null) }
    var agreed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var requestKey by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val load: () -> Unit = { scope.launch { try { state = ShopState.of(Api.get("/shop").data()); loadError = null } catch (e: Exception) { loadError = errorText(e) } } }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(note) { if (note != null) { delay(3800); note = null } }
    val s = state
    val chips = s?.chips
    val keys = s?.keys
    val choose: (ShopPack) -> Unit = { p ->
        if (!busy) {
            Sound.play("tap")
            if (chips != null && chips < p.chips) {
                Sound.play("lose")
                note = false to "Not enough Chips — this package costs ${fmt(p.chips)} Chips and you have ${fmtWhole(chips)}."
            } else {
                requestKey = idempotencyKey() // one key per confirmed exchange: a double tap can't repeat it
                agreed = false
                confirm = p
            }
        }
    }
    val pill = RoundedCornerShape(999.u)

    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0xB3000000)).tap(sound = null) { if (!busy) onClose() })
        // Gold frame → dark-red body
        Box(
            Modifier.at(160, 90, 1280, 720).popIn("shop").tap(sound = null) {}.drawBehind { softGlow(Color(0x73FFBE3C), 44f * density, 22f * density) }
                .clip(RoundedCornerShape(22.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFE58A), Color(0xFFD99A1C), Color(0xFF7A4A00)))).padding(6.5f.u),
        ) {
            Column(
                Modifier.fillMaxSize().clip(RoundedCornerShape(17.u))
                    .background(Brush.radialGradient(listOf(Color(0xFF4A0D10), Color(0xFF240406), Color(0xFF120203)), center = androidx.compose.ui.geometry.Offset(633.5f * ph.pusoy13.game.ui.LocalUnit.current, 0f), radius = 1100f * ph.pusoy13.game.ui.LocalUnit.current)),
            ) {
                // Header: rate, SHOP plaque, balances, close
                Box(Modifier.fillMaxWidth().height(108.u)) {
                    Box(Modifier.align(Alignment.CenterStart).padding(start = 14.u).clip(pill).background(Color(0x73000000)).padding(horizontal = 14.u, vertical = 4.u)) {
                        Txt("${s?.chipsPerKey ?: 5} Chips = 1 Key", 23, color = Color(0xFFFFE14D))
                    }
                    Box(
                        Modifier.align(Alignment.Center).drawBehind { softGlow(Color(0x80FFC850), 22f * density, 999f * density) }.clip(pill)
                            .background(Brush.verticalGradient(listOf(Color(0xFF3A1405), Color(0xFF160602)))).border(4.3f.u, Color(0xFFFFD34D), pill).padding(horizontal = 43.u, vertical = 4.u),
                    ) {
                        Box {
                            Txt("SHOP", 54, color = Color(0xFF5A2A00), modifier = Modifier.offset(y = 3.6f.u))
                            Txt("SHOP", 54, color = Color(0xFFFFD34D))
                        }
                    }
                    Column(Modifier.align(Alignment.CenterEnd).padding(end = 86.u), verticalArrangement = Arrangement.spacedBy(4.u)) {
                        listOf(Triple("icon-chips", chips, listOf(Color(0xFFFFB3B3), Color(0xFF7A0A12), Color(0xFF2E0306))), Triple("icon-keys", keys, listOf(Color(0xFFE2C4FF), Color(0xFF3A0B7A), Color(0xFF160330)))).forEach { (icon, v, c) ->
                            Row(
                                Modifier.clip(pill).background(Brush.verticalGradient(listOf(c[1], c[2]))).border(2.9f.u, c[0], pill).padding(start = 4.u, end = 10.u, top = 2.u, bottom = 2.u),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.u),
                            ) {
                                Art(icon, Modifier.size(33.u), animate = false)
                                Txt(if (v != null) fmtWhole(v) else "…", 24.5f, align = TextAlign.End, modifier = Modifier.width(94.u))
                            }
                        }
                    }
                    Box(
                        Modifier.align(Alignment.CenterEnd).padding(end = 14.u).size(58.u).lip(4, Color(0xFF6B0606), 999).tap(label = "Close", enabled = !busy) { onClose() }
                            .clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFF6B5C), Color(0xFFC0101A)))).border(4.3f.u, Color(0xFFFFD34D), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Txt("✕", 30) }
                }

                Row(Modifier.fillMaxWidth().weight(1f).padding(start = 14.u, end = 14.u, bottom = 11.u), horizontalArrangement = Arrangement.spacedBy(14.u)) {
                    // Left: the Keys tab + your recent exchanges
                    Column(Modifier.width(272.u).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(11.u)) {
                        val tab = RoundedCornerShape(11.5f.u)
                        Row(
                            Modifier.fillMaxWidth().drawBehind { softGlow(Color(0x99FFC850), 18f * density, 11.5f * density) }.clip(tab)
                                .background(Brush.horizontalGradient(listOf(Color(0xFFFFC531), Color(0xFFC27A04)))).border(3.6f.u, Color(0xFFFFD34D), tab).padding(horizontal = 11.u, vertical = 7.u),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.6f.u),
                        ) {
                            KeyIcon(43)
                            Txt("Keys", 33, color = Color(0xFF3A1405))
                        }
                        Column(Modifier.fillMaxWidth().weight(1f).clip(tab).background(Color(0x59000000)).padding(8.6f.u).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.3f.u)) {
                            Txt("YOUR EXCHANGES", 19, color = Color(0xFFFFD34D))
                            if (s != null && s.history.isEmpty()) Txt("None yet.", 18, color = Color(0x99FFFFFF), font = Body)
                            s?.history?.forEach { x ->
                                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(7.u)).background(Color(0x0DFFFFFF)).padding(horizontal = 7.u, vertical = 3.6f.u)) {
                                    val k = x.text("keys").toDoubleOrNull()
                                    if (x.text("direction", "chips_to_keys") == "chips_to_keys") {
                                        Row(horizontalArrangement = Arrangement.spacedBy(4.u)) {
                                            Txt("−${fmt(x.text("chips").toDoubleOrNull())} Chips →", 17, font = Body, weight = FontWeight.Black)
                                            Txt("+${fmt(k)} ${if (k == 1.0) "Key" else "Keys"}", 17, color = Color(0xFFE2C4FF), font = Body, weight = FontWeight.Black)
                                        }
                                    } else {
                                        val paid = x.optJSONObject("paid_out")
                                        Row(horizontalArrangement = Arrangement.spacedBy(4.u)) {
                                            Txt("−${fmt(k)} Keys →", 17, font = Body, weight = FontWeight.Black)
                                            Txt("+${fmt(paid?.optString("amount")?.toDoubleOrNull())} ${if (paid?.optString("currency") == "GD") "Gold" else "Chips"}", 17, color = Color(0xFFFFE14D), font = Body, weight = FontWeight.Black)
                                        }
                                    }
                                    Txt(whenText(x.text("created_at")), 17, color = Color(0x80FFFFFF), font = Body)
                                }
                            }
                        }
                    }

                    // Packages + notice
                    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(11.u)) {
                        loadError?.let { err ->
                            Row(Modifier.fillMaxWidth().clip(pill).background(Color(0xFF3A0D14)).padding(horizontal = 14.u, vertical = 6.u), horizontalArrangement = Arrangement.Center) {
                                Txt("$err  ", 20, color = Color(0xFFFFB3BD), font = Body)
                                Txt("Retry", 20, color = Color(0xFFFFB3BD), font = Body, modifier = Modifier.tap { load() })
                            }
                        }
                        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(11.5f.u)) {
                            (s?.packages ?: emptyList()).forEach { p ->
                                val short = chips != null && chips < p.chips
                                val card = RoundedCornerShape(14.u)
                                Column(
                                    Modifier.weight(1f).fillMaxHeight().clip(card)
                                        .background(Brush.radialGradient(listOf(Color(0xFF8A1418), Color(0xFF3A0507)), center = androidx.compose.ui.geometry.Offset(100f * ph.pusoy13.game.ui.LocalUnit.current, 150f * ph.pusoy13.game.ui.LocalUnit.current), radius = 260f * ph.pusoy13.game.ui.LocalUnit.current))
                                        .border(3.6f.u, Color(0xFFE8B340), card).padding(horizontal = 7.u, vertical = 10.u),
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Box {
                                        Txt(shopKeys(p.keys), 36, color = Color(0x99000000), modifier = Modifier.offset(y = 2.9f.u))
                                        Txt(shopKeys(p.keys), 36, color = Color(0xFFFFE9B0))
                                    }
                                    KeyPile(p.keys)
                                    Txt("▼", 22, color = Color(0xFFFFD34D), font = Body)
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.8f.u)) {
                                        ChipIcon(46)
                                        Txt("= ${fmt(p.chips)}", 39)
                                    }
                                    Txt("CHIPS", 22, color = Color(0xFFFFD34D))
                                    Row(
                                        Modifier.padding(top = 5.8f.u).fillMaxWidth().lip(5, Color(0x73000000), 999).tap(sound = null, enabled = !busy && s != null, label = "Buy ${p.keys} ${if (p.keys == 1) "Key" else "Keys"} for ${p.chips} Chips") { choose(p) }
                                            .clip(pill).background(Brush.verticalGradient(if (short) listOf(Color(0xFF6B6B6B), Color(0xFF3A3A3A)) else listOf(Color(0xFFFF4A4A), Color(0xFFA50D14))))
                                            .border(3.6f.u, if (short) Color(0x4DFFFFFF) else Color(0xFFFFD34D), pill).padding(vertical = 6.5f.u),
                                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.8f.u, Alignment.CenterHorizontally),
                                    ) {
                                        ChipIcon(32)
                                        Txt(if (short) "NEED ${fmt(p.chips)} CHIPS" else "BUY · ${fmt(p.chips)} CHIPS", 21, maxLines = 1)
                                    }
                                }
                            }
                        }
                        val box = RoundedCornerShape(11.5f.u)
                        Column(Modifier.fillMaxWidth().clip(box).background(Color(0x73000000)).border(2.9f.u, Color(0xB3FFD34D), box).padding(horizontal = 14.u, vertical = 7.u)) {
                            Txt("IMPORTANT NOTICE", 20, color = Color(0xFFFFD34D))
                            listOf(
                                "• Chips spent in the Shop are non-refundable." to "• Keys bought cannot be converted back into Chips.",
                                "• All completed exchanges are final." to "• Review and confirm each exchange before it is completed.",
                            ).forEach { (a, b) ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(22.u)) {
                                    Txt(a, 17, color = Color(0xD9FFFFFF), font = Body, modifier = Modifier.weight(1f))
                                    Txt(b, 17, color = Color(0xD9FFFFFF), font = Body, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }

            // Confirmation
            confirm?.let { p ->
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(17.u)).background(Color(0xB3000000)).tap(sound = null) {}, contentAlignment = Alignment.Center) {
                    val r = RoundedCornerShape(17.u)
                    Column(
                        Modifier.width(785.u).popIn("confirm").drawBehind { softGlow(Color(0x80FFC850), 36f * density, 17f * density) }.clip(r)
                            .background(Brush.verticalGradient(listOf(Color(0xFF5A0A10), Color(0xFF1E0204)))).border(4.3f.u, Color(0xFFFFD34D), r).padding(22.u),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Txt("Confirm exchange", 36, color = Color(0xFFFFD34D))
                        Txt("Pay ${fmt(p.chips)} CHIPS → get ${shopKeys(p.keys)}", 30, modifier = Modifier.padding(top = 7.u), align = TextAlign.Center)
                        Txt("Chips after: ${fmtWhole((chips ?: 0.0) - p.chips)} · Keys after: ${fmtWhole((keys ?: 0.0) + p.keys)} · This exchange is final.", 20, color = Color(0xBFFFFFFF), font = Body, align = TextAlign.Center, modifier = Modifier.padding(top = 4.u))
                        Row(
                            Modifier.padding(top = 14.u).fillMaxWidth(0.9f).clip(RoundedCornerShape(10.u)).background(Color(0x59000000)).tap(sound = null, label = "I understand this exchange is final and non-refundable") { agreed = !agreed }.padding(10.u),
                            horizontalArrangement = Arrangement.spacedBy(10.u),
                        ) {
                            Box(Modifier.padding(top = 3.u).size(26.u).clip(RoundedCornerShape(5.u)).background(if (agreed) Color(0xFFFFC531) else Color.White).border(2.u, Color(0xFF767676), RoundedCornerShape(5.u)), contentAlignment = Alignment.Center) {
                                if (agreed) Txt("✓", 20, color = Color(0xFF3A1405), font = Body, weight = FontWeight.Black)
                            }
                            Txt("I understand that the ${fmt(p.chips)} Chips are non-refundable, the Keys cannot be converted back into Chips, and this exchange is final.", 21, font = Body, modifier = Modifier.weight(1f))
                        }
                        Row(Modifier.padding(top = 17.u), horizontalArrangement = Arrangement.spacedBy(14.u)) {
                            Box(
                                Modifier.alpha(if (busy) 0.5f else 1f).tap(enabled = !busy) { confirm = null }.clip(pill).background(Color(0x59000000)).border(3.6f.u, Color(0x99FFFFFF), pill).padding(horizontal = 29.u, vertical = 8.6f.u),
                            ) { Txt("Cancel", 24.5f) }
                            Box(
                                Modifier.alpha(if (!agreed || busy) 0.5f else 1f).lip(5, Color(0xFF8A4A00), 999).tap(enabled = agreed && !busy) {
                                    busy = true
                                    scope.launch {
                                        try {
                                            val res = Api.post("/shop/key-exchanges", Api.body("package" to p.id, "idempotency_key" to requestKey, "confirmed" to true))
                                            Sound.play("win")
                                            note = true to "Success! ${fmt(p.chips)} Chips exchanged for ${shopKeys(p.keys).lowercase()}."
                                            res.optJSONObject("data")?.optJSONObject("balances")?.let { b -> state = state?.copy(keys = b.optDouble("keys", state?.keys ?: 0.0), chips = b.optDouble("chips", state?.chips ?: 0.0)) }
                                            Session.walletChanged()
                                        } catch (e: Exception) {
                                            Sound.play("lose")
                                            note = false to errorText(e)
                                        }
                                        confirm = null
                                        busy = false
                                        load()
                                    }
                                }.clip(pill).background(Brush.verticalGradient(listOf(Color(0xFFFFE46A), Color(0xFFE08A00)))).border(3.6f.u, Color(0xFFFFF3A0), pill).padding(horizontal = 29.u, vertical = 8.6f.u),
                            ) { Txt(if (busy) "Exchanging…" else "Confirm exchange", 24.5f, color = Color(0xFF4A1D00)) }
                        }
                    }
                }
            }

            note?.let { (ok, text) ->
                Box(
                    Modifier.align(Alignment.TopCenter).padding(top = 108.u).fillMaxWidth(0.8f).wrapContentWidth().zIndex(2f).clip(pill).background(if (ok) Color(0xFF0F2A1C) else Color(0xFF3A0D14))
                        .border(3.6f.u, if (ok) Color(0xFF4EE36B) else Color(0xFFFF8A8A), pill).padding(horizontal = 22.u, vertical = 7.u),
                ) { Txt(text, 22, color = if (ok) Color(0xFFB9FFCB) else Color(0xFFFFE4E4), align = TextAlign.Center) }
            }
        }
    }
}

/** A fan of up to six gold keys (the package art). */
@Composable
private fun KeyPile(count: Int) {
    val shown = minOf(count, 6)
    Box(Modifier.fillMaxWidth().height(122.u), contentAlignment = Alignment.Center) {
        val mid = (shown - 1) / 2f
        repeat(shown) { i ->
            Art(
                "shop-key",
                Modifier.size(122.u).graphicsLayer {
                    val unit = size.width / 122f
                    translationX = (i - mid) * 23f * unit
                    translationY = kotlin.math.abs(i - mid) * 5.8f * unit
                    rotationZ = (i - mid) * 9f
                },
                animate = false,
            )
        }
    }
}

// ------------------------------------------------------------------ Avatar + nickname

private val AVATAR_TABS = listOf("all" to "All", "boy" to "Boys", "girl" to "Girls", "animal" to "Animals")
private val GoldBtn = listOf(Color(0xFFFFE46A), Color(0xFFFFC531), Color(0xFFE08A00))

/**
 * Avatar gallery (components/AvatarPicker.tsx, its compact phone layout): filter by category, tap to
 * preview, Confirm saves it (PUT /profile/avatar). Below the preview: your Nickname with the pencil
 * (Change Nickname → ✓ saves, PUT /profile/nickname — the server validates it); Confirm also saves an
 * edited nickname. Both apply at once (the signed-in user is refreshed).
 */
@Composable
fun AvatarPicker(onClose: () -> Unit) {
    val user by Session.user.collectAsState()
    val current = avatarFor(user?.avatar, user?.id)
    val currentNick = user?.shownName ?: ""
    var sel by remember { mutableStateOf(current) }
    var tab by remember { mutableStateOf("all") }
    val nick = remember { mutableStateOf(currentNick) }
    var editingNick by remember { mutableStateOf(false) }
    var nickNote by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    if (nick.value.length > 20) nick.value = nick.value.take(20)
    val ids = if (tab == "all") AVATAR_IDS else AVATAR_IDS.filter { it.startsWith(tab) }
    val nickChanged = nick.value.trim().replace(Regex("\\s+"), " ") != currentNick
    val changed = sel != current || nickChanged
    val category = mapOf("boy" to "Boys", "girl" to "Girls", "animal" to "Animals")
    val pill = RoundedCornerShape(999.u)

    suspend fun saveNick(): Boolean = try {
        val r = Api.put("/profile/nickname", Api.body("nickname" to nick.value))
        r.optJSONObject("data")?.optString("nickname")?.takeIf { it.isNotEmpty() }?.let { nick.value = it }
        true
    } catch (e: Exception) {
        error = errorText(e)
        editingNick = true
        Sound.play("lose")
        false
    }

    val changeNick: () -> Unit = {
        if (!busy) {
            Sound.play("tap")
            when {
                !editingNick -> { editingNick = true; nickNote = null }
                !nickChanged -> editingNick = false
                else -> {
                    busy = true
                    error = null
                    scope.launch {
                        if (saveNick()) {
                            Session.refresh()
                            editingNick = false
                            nickNote = "Nickname saved"
                            Sound.play("win")
                        }
                        busy = false
                    }
                }
            }
        }
    }
    val confirm: () -> Unit = {
        if (!busy) {
            if (!changed) onClose() else {
                busy = true
                error = null
                scope.launch {
                    try {
                        if (!nickChanged || saveNick()) {
                            if (sel != current) Api.put("/profile/avatar", Api.body("avatar" to sel))
                            Session.refresh()
                            Sound.play("win")
                            onClose()
                        }
                    } catch (e: Exception) {
                        error = errorText(e)
                        Sound.play("lose")
                    }
                    busy = false
                }
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0xA6000000)).tap(sound = null) { onClose() })
        Box(Modifier.at(20, 27, 1560, 846).popIn("avatar").tap(sound = null) {}.lip(23, Color(0xFF5A2A00), 64).goldRim(64, 14).padding(14.u)) {
            Column(Modifier.fillMaxSize().clip(RoundedCornerShape(53.u)).background(Brush.verticalGradient(listOf(Color(0xFF7A0F16), Color(0xFF55070C), Color(0xFF2E0306))))) {
                // Header
                Row(Modifier.fillMaxWidth().padding(start = 46.u, end = 46.u, top = 18.u, bottom = 9.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Box {
                        Txt("Choose Your Avatar", 68, color = Color(0xFF3A1300), modifier = Modifier.offset(y = 4.6f.u))
                        Txt("Choose Your Avatar", 68, color = Color(0xFFFFD34D))
                    }
                    Box(
                        Modifier.size(100.u).lip(9, Color(0xFF6B0606), 999).tap(label = "Close") { onClose() }.clip(CircleShape)
                            .background(Brush.verticalGradient(listOf(Color(0xFFFF6B5C), Color(0xFFC0101A)))).border(9.u, Color(0xFFFFD34D), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Txt("✕", 46) }
                }
                // Category filters
                Row(Modifier.padding(horizontal = 46.u), horizontalArrangement = Arrangement.spacedBy(18.u)) {
                    AVATAR_TABS.forEach { (k, l) ->
                        val on = tab == k
                        Box(
                            Modifier.then(if (on) Modifier.lip(9, Color(0xFF8A4A00), 999) else Modifier).tap { tab = k }.clip(pill)
                                .background(Brush.verticalGradient(if (on) listOf(Color(0xFFFFE46A), Color(0xFFE08A00)) else listOf(Color(0xFF6A1218), Color(0xFF33060A))))
                                .border(7.u, if (on) Color(0xFFFFF3A0) else Color(0xFFD9A441), pill).padding(horizontal = 46.u, vertical = 12.u),
                        ) { Txt(l, 40, color = if (on) Color(0xFF4A1D00) else Color(0xFFFFE9B0)) }
                    }
                }
                Row(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 46.u, vertical = 18.u), horizontalArrangement = Arrangement.spacedBy(37.u)) {
                    // Preview + nickname
                    Column(Modifier.width(572.u), verticalArrangement = Arrangement.spacedBy(18.u)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(27.u)) {
                            Box(
                                Modifier.popIn(sel).size(133.u).drawBehind { softGlow(Color(0x99FFD34D), 30f * density, 55f * density) }.clip(RoundedCornerShape(55.u)).background(Color.White)
                                    .border(11.u, Color(0xFFFFE14D), RoundedCornerShape(55.u)),
                            ) { ph.pusoy13.game.ui.AssetImage("avatars/$sel.webp", Modifier.fillMaxSize()) }
                            Column {
                                Txt(AVATAR_NAMES[sel] ?: sel, 48)
                                Txt(if (sel == current) "Your current avatar" else category[sel.substringBefore('-')] ?: "", 30, color = Color(0x99FFFFFF), font = Body)
                            }
                        }
                        Column {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                                Txt("NICKNAME", 30, color = Color(0xFFFFD34D))
                                Txt(nickNote ?: if (editingNick) "2–20 characters" else "", 27, color = if (nickNote != null) Color(0xFF9CF08A) else Color(0x80FFFFFF), font = Body, maxLines = 1)
                            }
                            Row(Modifier.padding(top = 4.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.u)) {
                                Box(
                                    Modifier.weight(1f).height(100.u).clip(pill).background(if (editingNick) Color(0xFF1A0204) else Color(0x4D000000))
                                        .border(7.u, if (editingNick) Color(0xFFFFE14D) else Color(0xB3D9A441), pill).padding(horizontal = 37.u),
                                    contentAlignment = Alignment.CenterStart,
                                ) {
                                    if (editingNick) BareInput(nick, "Nickname", Modifier.fillMaxWidth(), size = 39) else Txt(nick.value, 39, maxLines = 1)
                                }
                                Box(
                                    Modifier.size(100.u).alpha(if (busy) 0.6f else 1f).lip(9, Color(0xFF8A4A00), 999).tap(sound = null, enabled = !busy, label = if (editingNick) "Save Nickname" else "Change Nickname", onClick = changeNick)
                                        .clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFFFFE46A), Color(0xFFE08A00)))).border(7.u, Color(0xFFFFF3A0), CircleShape),
                                    contentAlignment = Alignment.Center,
                                ) { Txt(if (editingNick) "✓" else "✎", 46, color = Color(0xFF4A1D00), font = Body, weight = FontWeight.Black) }
                            }
                        }
                    }
                    // Gallery
                    Column(Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(27.u)) {
                        ids.chunked(5).forEach { row ->
                            Row(Modifier.fillMaxWidth().padding(6.u), horizontalArrangement = Arrangement.spacedBy(27.u)) {
                                row.forEach { id ->
                                    val on = id == sel
                                    val shape = RoundedCornerShape(46.u)
                                    Box(
                                        Modifier.weight(1f).aspectRatio(1f).graphicsLayer { if (on) { scaleX = 1.04f; scaleY = 1.04f } }.tap(label = AVATAR_NAMES[id] ?: id) { sel = id }
                                            .then(if (on) Modifier.drawBehind { softGlow(Color(0xB3FFE14D), 22f * density, 46f * density) } else Modifier)
                                            .clip(shape).background(Color.White).border(9.u, if (on) Color(0xFFFFE14D) else Color(0xB3D9A441), shape),
                                    ) {
                                        ph.pusoy13.game.ui.AssetImage("avatars/$id.webp", Modifier.fillMaxSize().padding(4.u).clip(RoundedCornerShape(40.u)))
                                        if (id == current) Box(Modifier.align(Alignment.TopStart).padding(10.u).clip(pill).background(Color(0xFF13A344)).padding(horizontal = 12.u)) { Txt("Current", 25, font = Body, weight = FontWeight.Black) }
                                        if (on) Box(Modifier.align(Alignment.BottomEnd).padding(10.u).size(64.u).clip(CircleShape).background(Color(0xFF13A344)).border(4.u, Color.White, CircleShape), contentAlignment = Alignment.Center) { Txt("✓", 34, font = Body, weight = FontWeight.Black) }
                                    }
                                }
                                repeat(5 - row.size) { Box(Modifier.weight(1f)) }
                            }
                        }
                    }
                }
                error?.let {
                    Box(Modifier.padding(horizontal = 46.u).padding(bottom = 9.u).fillMaxWidth().clip(pill).background(Color(0xFF3A0D14)).padding(horizontal = 37.u, vertical = 9.u), contentAlignment = Alignment.Center) {
                        Txt(it, 34, color = Color(0xFFFFB3BD), font = Body, align = TextAlign.Center)
                    }
                }
                Row(Modifier.fillMaxWidth().padding(start = 46.u, end = 46.u, bottom = 27.u), horizontalArrangement = Arrangement.spacedBy(37.u, Alignment.CenterHorizontally)) {
                    Box(
                        Modifier.height(100.u).width(343.u).lip(11, Color(0xFF1A0204), 999).tap { onClose() }.clip(pill)
                            .background(Brush.verticalGradient(listOf(Color(0xFF6A1218), Color(0xFF33060A)))).border(9.u, Color(0xFFD9A441), pill),
                        contentAlignment = Alignment.Center,
                    ) { Txt("Cancel", 46, color = Color(0xFFFFE9B0)) }
                    Box(
                        Modifier.height(100.u).width(458.u).alpha(if (busy) 0.6f else 1f).lip(11, Color(0xFF8A4A00), 999).tap(enabled = !busy, onClick = confirm).clip(pill)
                            .background(Brush.verticalGradient(GoldBtn)).border(9.u, Color(0xFFFFF3A0), pill),
                        contentAlignment = Alignment.Center,
                    ) { Txt(if (busy) "Saving…" else if (changed) "✓ Confirm" else "Done", 50, color = Color(0xFF4A1D00)) }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Out of Gold

/**
 * "Out of Gold!" (components/OutOfGoldPopup.tsx) — Single Player only. CLAIM asks the server for the
 * free Gold (one request id per popup, so a repeated tap returns the same credit); nothing is
 * credited until it is pressed. Purple card on the gold frame, spinning rays, floating coin piles.
 */
@Composable
fun OutOfGoldPopup(initial: GoldWallet, onClose: () -> Unit, onPlay: () -> Unit) {
    var wallet by remember { mutableStateOf(initial) }
    var claimed by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val requestId = remember { idempotencyKey().replace(Regex("[^A-Za-z0-9-]"), "") }
    val scope = rememberCoroutineScope()
    val clock = LocalClock.current
    val amount = fmt(wallet.claimAmount)
    val claim: () -> Unit = {
        if (!busy) {
            busy = true
            error = null
            scope.launch {
                try {
                    val r = Api.post("/practice/gold/claim", Api.body("request_id" to requestId))
                    wallet = GoldWallet.of(r.data())
                    notice = r.text("message", "Free Gold claimed!")
                    claimed = true
                    Sound.play("win")
                    Session.walletChanged()
                } catch (e: Exception) {
                    error = errorText(e)
                    Sound.play("lose")
                }
                busy = false
            }
        }
    }
    val display = TextStyle(fontFamily = ph.pusoy13.game.ui.Display, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)

    Box(Modifier.fillMaxSize().background(Color(0xA6000000)).tap(sound = null) { if (claimed) onClose() }, contentAlignment = Alignment.Center) {
        Box(Modifier.width(860.u).popIn("oog").tap(sound = null) {}) {
            // Glowing rays behind the coins
            Box(
                Modifier.align(Alignment.TopCenter).offset(y = 40.u).size(460.u).graphicsLayer { rotationZ = ((clock?.floatValue ?: 0f) % 18f) / 18f * 360f }.drawBehind {
                    val ray = Brush.radialGradient(0f to Color(0x61FFE15A), 0.25f to Color(0x61FFE15A), 0.68f to Color.Transparent, center = center, radius = size.minDimension / 2)
                    for (i in 0 until 15) drawArc(ray, i * 24f - 90f, 10f, useCenter = true)
                },
            )
            Box(Modifier.fillMaxWidth().lip(14, Color(0xFF7A3E00), 48).goldRim(48, 12).padding(12.u)) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(38.u)).background(Brush.verticalGradient(listOf(Color(0xFF7A1FD1), Color(0xFF4A0F96), Color(0xFF24064F))))
                        .drawBehind { softGlow(Color(0x26FFFFFF), 60f * density, 999f * density) }.padding(start = 56.u, end = 56.u, bottom = 44.u, top = 30.u),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CandyText(if (claimed) "Gold Claimed!" else "Out of Gold!", 700, 110, 86)
                    // Reward: a glowing pile of gold with sparkles
                    Box(Modifier.offset(y = (-8).u).size(420.u, 190.u)) {
                        listOf(Triple(46, 60, 110), Triple(150, 8, 150), Triple(264, 60, 110)).forEachIndexed { i, (x, y, s) ->
                            Art(
                                if (i == 1 && !claimed) "og-coins-q" else "og-coins-g",
                                Modifier.at(x, y, s, s).graphicsLayer {
                                    val t = clock?.floatValue ?: 0f
                                    val p = ((t - i * 0.4f + 2.6f * 4) % 2.6f) / 2.6f
                                    translationY = -12f * (0.5f - 0.5f * kotlin.math.cos(p * 2 * Math.PI.toFloat())) * size.width / s
                                }.drawBehind { softGlow(Color(0x80FFD250), 16f * density, 999f * density, circle = true) },
                                animate = false,
                            )
                        }
                        listOf(30 to 20, 380 to 30, 90 to 150, 330 to 150, 210 to 0).forEachIndexed { i, (x, y) ->
                            Box(
                                Modifier.at(x, y).graphicsLayer {
                                    val t = clock?.floatValue ?: 0.9f
                                    val p = ((t - i * 0.35f + 1.8f * 4) % 1.8f) / 1.8f
                                    val k = 0.5f - 0.5f * kotlin.math.cos(p * 2 * Math.PI.toFloat())
                                    alpha = 0.2f + 0.8f * k
                                    scaleX = 0.7f + 0.45f * k; scaleY = scaleX
                                },
                            ) { Txt("✦", 34, color = Color(0xFFFFF6B0), font = Body) }
                        }
                    }
                    val pulse = Modifier.graphicsLayer {
                        val p = ((clock?.floatValue ?: 0f) % 1.6f) / 1.6f
                        val s = 1f + 0.05f * (0.5f - 0.5f * kotlin.math.cos(p * 2 * Math.PI.toFloat()))
                        scaleX = s; scaleY = s
                    }
                    val green = Brush.verticalGradient(listOf(Color(0xFF7DFF8A), Color(0xFF2FD14A), Color(0xFF108A2A)))
                    if (!claimed) {
                        BasicText(
                            buildAnnotatedString {
                                append("Your Gold Wallet balance has reached zero! Don't worry! Claim your ")
                                withStyle(SpanStyle(color = Color(0xFFFFE14D))) { append("FREE $amount Gold") }
                                append(" to replenish your wallet and continue enjoying Single Player!")
                            },
                            Modifier.padding(top = 8.u).width(680.u),
                            style = display.copy(color = Color.White, fontSize = 30.ts, lineHeight = 41.ts, shadow = androidx.compose.ui.graphics.Shadow(Color(0x73000000), androidx.compose.ui.geometry.Offset(0f, 3f * ph.pusoy13.game.ui.LocalUnit.current), 0f)),
                        )
                        BasicText(
                            buildAnnotatedString {
                                append("Reward: ")
                                withStyle(SpanStyle(color = Color(0xFFFFE14D))) { append("$amount Gold") }
                                append(" · Single Player only")
                            },
                            Modifier.padding(top = 12.u),
                            style = display.copy(color = Color(0xB3FFFFFF), fontSize = 22.ts, fontWeight = FontWeight.Bold),
                        )
                        Box(
                            Modifier.padding(top = 24.u).then(pulse).alpha(if (busy) 0.6f else 1f)
                                .drawBehind { softGlow(Color(0xB378FF8C), 40f * density, 999f * density) }.lip(10, Color(0xFF0A5A1A), 999)
                                .tap(sound = null, enabled = !busy, label = "Claim $amount Gold", onClick = claim).clip(RoundedCornerShape(999.u)).background(green)
                                .border(6.u, Color.White, RoundedCornerShape(999.u)).padding(horizontal = 54.u, vertical = 18.u),
                        ) { Txt(if (busy) "CLAIMING…" else "CLAIM $amount GOLD", 40, stroke = Color(0xFF0A5A1A), strokeWidth = 5) }
                    } else {
                        Txt(notice ?: "", 34, color = Color(0xFFB9FFCB), align = TextAlign.Center, modifier = Modifier.padding(top = 8.u))
                        Box(Modifier.padding(top = 16.u).clip(RoundedCornerShape(999.u)).background(Color(0x66000000)).padding(horizontal = 32.u, vertical = 8.u)) {
                            Txt("Gold: ${fmtWhole(wallet.total)}", 28, color = Color(0xFFFFE14D))
                        }
                        Box(
                            Modifier.padding(top = 24.u).then(pulse).drawBehind { softGlow(Color(0xB378FF8C), 40f * density, 999f * density) }.lip(10, Color(0xFF0A5A1A), 999)
                                .tap(label = "Play Single Player", onClick = onPlay).clip(RoundedCornerShape(999.u)).background(green)
                                .border(6.u, Color.White, RoundedCornerShape(999.u)).padding(horizontal = 54.u, vertical = 16.u),
                        ) { Txt("PLAY SINGLE PLAYER", 38, stroke = Color(0xFF0A5A1A), strokeWidth = 5) }
                        Txt("Later", 24, color = Color(0xB3FFFFFF), modifier = Modifier.padding(top = 16.u).tap { onClose() })
                    }
                    error?.let {
                        Txt(it, 24, color = Color(0xFFFECACA), align = TextAlign.Center, modifier = Modifier.padding(top = 16.u))
                        Txt("Close", 24, color = Color(0xB3FFFFFF), modifier = Modifier.padding(top = 8.u).tap { onClose() })
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Single Player picker

private data class TierTheme(val from: Color, val to: Color, val edge: Color, val glow: Color, val dark: Color)

private val TIER_THEMES = mapOf(
    "beginner" to TierTheme(Color(0xFF5FE07A), Color(0xFF0C7A2E), Color(0xFF7DFFA0), Color(0xFF7DFFA0), Color(0xFF0D4A1F)),
    "intermediate" to TierTheme(Color(0xFF4FA6FF), Color(0xFF0B38B0), Color(0xFF8CCAFF), Color(0xFF78BEFF), Color(0xFF0B2A74)),
    "advanced" to TierTheme(Color(0xFFC77DFF), Color(0xFF5A12B0), Color(0xFFE2ADFF), Color(0xFFD28CFF), Color(0xFF3C0D78)),
    "mastery" to TierTheme(Color(0xFFFF6464), Color(0xFFA20A14), Color(0xFFFFA0A0), Color(0xFFFF7878), Color(0xFF6A0812)),
)

/**
 * Single Player — Select Difficulty Level (components/SinglePlayerPicker.tsx): four tier cards with
 * their shield, name, minimum Gold and bet options. Tapping a card checks the Gold and goes to that
 * game (the bet is picked at the table); a locked card shakes and says why. The server checks again.
 */
@Composable
fun SinglePlayerPicker(onClose: () -> Unit, onContinue: (String, Int?) -> Unit) {
    var tiers by remember { mutableStateOf<List<PracticeTier>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var chosen by remember { mutableStateOf<String?>(null) }
    var denied by remember { mutableStateOf<Pair<String, String>?>(null) }
    val scope = rememberCoroutineScope()
    val load: () -> Unit = { scope.launch { try { tiers = Api.get("/practice/tiers").dataList().map(PracticeTier::of); error = null } catch (e: Exception) { error = errorText(e) } } }
    LaunchedEffect(Unit) { load() }
    val choose: (PracticeTier) -> Unit = { t ->
        if (chosen == null) {
            if (!t.eligible) {
                Sound.play("tap")
                denied = t.key to "Not enough gold for ${t.name}. You need at least ${fmt(t.minGold)} gold."
                scope.launch { delay(3200); if (denied?.first == t.key) denied = null }
            } else {
                denied = null
                chosen = t.key
                Sound.play("start")
                scope.launch { delay(450); onContinue(t.key, null) }
            }
        }
    }
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0xB30A0420)).tap(sound = null) { if (chosen == null) onClose() })
        Box(Modifier.at(150, 150, 1300, 730).popIn("picker").lip(14, Color(0xFF7A3E00), 56).goldRim(56, 12).padding(12.u)) {
            Box(Modifier.fillMaxSize().clip(RoundedCornerShape(46.u)).background(Brush.radialGradient(listOf(Color(0xFF4A2390), Color(0xFF1D0B4A), Color(0xFF120630)), center = androidx.compose.ui.geometry.Offset(1276 * 0.5f * ph.pusoy13.game.ui.LocalUnit.current, 0f), radius = 1300f * ph.pusoy13.game.ui.LocalUnit.current)).border(4.u, Color(0xFFFFD95E), RoundedCornerShape(46.u))) {
                Glitter(14, 9)
            }
        }
        // Title: "◆ Select Difficulty Level ◆"
        Row(Modifier.at(150, 242).width(1300.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.u, Alignment.CenterHorizontally)) {
            Box(Modifier.size(120.u, 3.u).background(Brush.horizontalGradient(listOf(Color.Transparent, Color(0xFFFFD13A)))))
            Txt("◆", 22, color = Color(0xFFFFD13A), font = Body)
            Txt("Select Difficulty Level", 42, stroke = Color(0x99000000), strokeWidth = 4)
            Txt("◆", 22, color = Color(0xFFFFD13A), font = Body)
            Box(Modifier.size(120.u, 3.u).background(Brush.horizontalGradient(listOf(Color(0xFFFFD13A), Color.Transparent))))
        }
        // The tier cards (grid of 4)
        Box(Modifier.at(192, 328, 1216, 500)) {
            val list = tiers
            when {
                list == null && error == null -> Txt("Loading levels…", 32, modifier = Modifier.align(Alignment.Center))
                list == null -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.u)) {
                    Txt(error ?: "", 30, align = TextAlign.Center)
                    CandyButton("Try again", Modifier.size(300.u, 76.u), size = 30, onClick = load)
                }
                else -> Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(24.u)) {
                    list.forEachIndexed { i, t -> TierCard(t, i, Modifier.weight(1f).fillMaxHeight(), if (chosen != null) (if (chosen == t.key) "selected" else "dimmed") else if (denied?.first == t.key) "denied" else "idle") { choose(t) } }
                }
            }
        }
        denied?.let { (_, text) ->
            Box(Modifier.align(Alignment.TopCenter).padding(top = 826.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF3A0D14)).border(4.u, Color(0xFFFF8A8A), RoundedCornerShape(999.u)).padding(horizontal = 32.u, vertical = 12.u)) {
                Txt(text, 28, color = Color(0xFFFFE4E4), maxLines = 1)
            }
        }
        // The title crest above the panel
        Box(Modifier.at(430, 52, 740, 210).bob(5f)) {
            Art("sp-title-crest", Modifier.fillMaxSize())
            Art("sp-title", Modifier.at(110, 86, 520, 96))
        }
        Box(
            Modifier.at(1390, 120, 96, 96).popIn("close").tap(label = "Close") { if (chosen == null) onClose() }.lip(7, Color(0xFF6B0606), 999).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(Color(0xFFFF6B6B), Color(0xFFC0101A)))).border(6.u, Color(0xFFFFC531), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Txt("✕", 44) }
    }
}

@Composable
private fun TierCard(tier: PracticeTier, index: Int, modifier: Modifier, state: String, onClick: () -> Unit) {
    val t = TIER_THEMES[tier.key] ?: TIER_THEMES.getValue("beginner")
    val locked = !tier.eligible
    val clock = LocalClock.current
    val shake = remember(state) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(state) { if (state == "denied") shake.animateTo(1f, androidx.compose.animation.core.tween(450)) }
    Box(
        modifier.graphicsLayer {
            if (state == "denied") {
                val k = shake.value
                translationX = (when { k < 0.2f -> -12 * k / 0.2f; k < 0.4f -> -12 + 22 * (k - 0.2f) / 0.2f; k < 0.6f -> 10 - 17 * (k - 0.4f) / 0.2f; k < 0.8f -> -7 + 12 * (k - 0.6f) / 0.2f; else -> 5 - 5 * (k - 0.8f) / 0.2f }) * density
            }
            if (state == "selected") { scaleX = 1.04f; scaleY = 1.04f }
        }.alpha(if (state == "dimmed") 0.72f else if (locked) 0.8f else 1f).tap(sound = null, label = "${tier.name} — minimum gold ${fmt(tier.minGold)}", onClick = onClick),
    ) {
        Box(Modifier.fillMaxSize().padding(top = 22.u).then(if (state == "selected") Modifier.drawBehind { softGlow(t.glow.copy(alpha = 0.9f), 40f * density, 40f * density) } else Modifier).lip(10, Color(0xFF7A3E00), 40).goldRim(40, 8).padding(8.u)) {
            Column(
                Modifier.fillMaxSize().clip(RoundedCornerShape(32.u))
                    .background(Brush.radialGradient(listOf(t.from, t.to), center = androidx.compose.ui.geometry.Offset(120f * ph.pusoy13.game.ui.LocalUnit.current, 70f * ph.pusoy13.game.ui.LocalUnit.current), radius = 420f * ph.pusoy13.game.ui.LocalUnit.current))
                    .border(4.u, t.edge, RoundedCornerShape(32.u)).gloss(index * 0.4f).padding(start = 16.u, end = 16.u, bottom = 16.u, top = 4.u),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.height(70.u))
                Art("sp-name-${tier.key}", Modifier.size(256.u, 60.u).offset(y = (-4).u), animate = false)
                Row(Modifier.padding(top = 4.u).fillMaxWidth().height(70.u).clip(RoundedCornerShape(18.u)).background(t.dark).padding(horizontal = 8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                    Art("icon-gold", Modifier.size(58.u), animate = false)
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Txt("Minimum Gold:", 17)
                        Txt(fmt(tier.minGold), 30, color = C.Gold, stroke = Color(0xFF7A3E00), strokeWidth = 3)
                    }
                }
                Txt("Bet Options:", 19, modifier = Modifier.padding(top = 8.u), stroke = Color(0x80000000), strokeWidth = 3)
                Column(Modifier.padding(top = 4.u).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.u)) {
                    tier.bets.forEach { b ->
                        Row(
                            Modifier.fillMaxWidth().height(44.u).lip(4, Color(0xFF6A3600), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF3B2410), Color(0xFF1A0E04))))
                                .border(4.u, Color(0xFFFFC531), RoundedCornerShape(999.u)),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u, Alignment.CenterHorizontally),
                        ) {
                            Art("icon-gold", Modifier.size(30.u), animate = false)
                            Txt(fmt(b), 25)
                        }
                    }
                }
            }
            if (locked) {
                Row(Modifier.align(Alignment.TopEnd).padding(12.u).clip(RoundedCornerShape(999.u)).background(Color(0x99000000)).padding(horizontal = 12.u, vertical = 4.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.u)) {
                    Art("ic-lock-tier", Modifier.size(16.u, 20.u), animate = false)
                    Txt("Locked", 16)
                }
            }
        }
        // The shield with the tier's stars (sways and twinkles in the web app)
        Box(Modifier.align(Alignment.TopCenter).size(210.u, 128.u).alpha(if (locked) 0.7f else 1f)) { Art("sp-shield-${tier.key}", Modifier.fillMaxSize()) }
        if (state == "selected") {
            Box(Modifier.align(Alignment.BottomCenter).offset(y = 20.u).lip(4, Color(0xFF0B6B2A), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(Color(0xFF5EF08A), Color(0xFF13A344)))).border(4.u, Color.White, RoundedCornerShape(999.u)).padding(horizontal = 16.u, vertical = 2.u)) {
                Txt("Let's go!", 20)
            }
        }
    }
}


/** Pull the element up by `units` and give that space back to the layout (a CSS negative margin). */
@Composable
private fun Modifier.overlapUp(units: Int): Modifier {
    val px = (units * ph.pusoy13.game.ui.LocalUnit.current).toInt()
    return this.then(Modifier.layout { m, c ->
        val p = m.measure(c)
        layout(p.width, (p.height - px).coerceAtLeast(0)) { p.place(0, -px) }
    })
}
