package ph.pusoy13.game.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import ph.pusoy13.game.core.Api
import ph.pusoy13.game.core.Friend
import ph.pusoy13.game.core.FriendsData
import ph.pusoy13.game.core.Session
import ph.pusoy13.game.core.Sound
import ph.pusoy13.game.core.data
import ph.pusoy13.game.core.errorText
import ph.pusoy13.game.core.instant
import ph.pusoy13.game.ui.Art
import ph.pusoy13.game.ui.Body
import ph.pusoy13.game.ui.C
import ph.pusoy13.game.ui.Glitter
import ph.pusoy13.game.ui.LocalClock
import ph.pusoy13.game.ui.LocalUnit
import ph.pusoy13.game.ui.Txt
import ph.pusoy13.game.ui.avatarFor
import ph.pusoy13.game.ui.AssetImage
import ph.pusoy13.game.ui.bob
import ph.pusoy13.game.ui.gloss
import ph.pusoy13.game.ui.goldRim
import ph.pusoy13.game.ui.lip
import ph.pusoy13.game.ui.shineBrush
import ph.pusoy13.game.ui.spring
import ph.pusoy13.game.ui.tap
import ph.pusoy13.game.ui.ts
import ph.pusoy13.game.ui.u

/** "Last seen 2h ago" style label (FriendsPanel.tsx seenAgo). */
fun seenAgo(iso: String?): String {
    val ms = instant(iso) ?: return "Never online"
    val mins = maxOf(1L, Math.round((System.currentTimeMillis() - ms) / 60000.0))
    if (mins < 60) return "Last seen ${mins}m ago"
    val hours = Math.round(mins / 60.0)
    if (hours < 24) return "Last seen ${hours}h ago"
    return "Last seen ${Math.round(hours / 24.0)}d ago"
}

/** An avatar in a gold ring (game.tsx `Avatar` with its default `gold-rim p-[3px]`). */
@Composable
fun RimAvatar(avatar: String?, userId: Int?, size: Number, modifier: Modifier = Modifier) {
    Box(modifier.size(size.u).goldRim(999, 3, avatar = true, glint = false).padding(3.u).clip(CircleShape).background(Color.White)) {
        AssetImage("avatars/${avatarFor(avatar, userId)}.webp", Modifier.fillMaxSize())
    }
}

/** A 24-unit icon exported from the web app (assets/art/ic-*), tinted by its own colours. */
@Composable
fun Icon(name: String, size: Number, modifier: Modifier = Modifier) = Art(name, modifier.size(size.u), animate = false)

/**
 * Friends List panel (components/FriendsPanel.tsx): search, add by username, accept / decline
 * requests, online status and last seen, and invite an online friend to your table. Shows names,
 * level and status only — never balances.
 */
@Composable
fun FriendsPanel(modifier: Modifier) {
    var data by remember { mutableStateOf<FriendsData?>(null) }
    val query = remember { mutableStateOf("") }
    val username = remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    val scope = rememberCoroutineScope()
    val reload: () -> Unit = { scope.launch { runCatching { data = FriendsData.of(Api.get("/friends").data()) } } }
    LaunchedEffect(Session.user.value?.id) {
        while (true) {
            reload()
            delay(30_000)
        }
    }
    val run: (suspend () -> JSONObject) -> Unit = { fn ->
        Sound.play("tap")
        scope.launch {
            note = try {
                val r = fn()
                r.optString("message").takeIf { it.isNotBlank() }?.let { true to it }
            } catch (e: Exception) {
                false to errorText(e)
            }
            reload()
        }
    }
    val f = data
    val match = { x: Friend -> query.value.isBlank() || "${x.name} ${x.username}".lowercase().contains(query.value.trim().lowercase()) }
    val friends = f?.friends?.filter(match) ?: emptyList()
    val incoming = f?.incoming?.filter(match) ?: emptyList()
    val clock = LocalClock.current
    val unit = LocalUnit.current

    Box(modifier.lip(10, Color(0xFF9A5B03), 34).goldRim(34, 7).padding(7.u)) {
        Column(Modifier.fillMaxSize().clip(RoundedCornerShape(28.u)).background(Brush.verticalGradient(listOf(Color(0xF23A2142), Color(0xF21E1026)))).padding(12.u)) {
            // header
            Row(
                Modifier.fillMaxWidth().height(80.u).clip(RoundedCornerShape(20.u)).background(Brush.verticalGradient(listOf(Color(0xFF5A2F63), Color(0xFF2A1530)))).gloss(0f, dome = false).padding(horizontal = 16.u),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
            ) {
                Box(Modifier.size(44.u).bob()) { Icon("ic-friends", 44) }
                Box(Modifier.weight(1f)) {
                    // The shine is painted over the text in the draw phase (SrcIn keeps it inside the
                    // glyphs), so the moving gradient no longer recomposes the whole panel each frame.
                    androidx.compose.foundation.text.BasicText(
                        "Friends List (${f?.friends?.size ?: 0})",
                        Modifier.graphicsLayer(compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen).drawWithContent {
                            drawContent()
                            drawRect(shineBrush(Color(0xFFFFE9A8), clock?.floatValue ?: 0f, 238 * unit), blendMode = androidx.compose.ui.graphics.BlendMode.SrcIn)
                        },
                        style = TextStyle(fontFamily = ph.pusoy13.game.ui.Display, fontWeight = FontWeight.ExtraBold, fontSize = 34.ts, color = Color(0xFFFFE9A8)),
                        maxLines = 1,
                    )
                }
                Box(
                    Modifier.size(64.u).spring("add-friend", "tile", 2.8f, 1f).tap(label = "Add friend") { adding = !adding; note = null }
                        .lip(4, Color(0xFF8A4A00), 16).clip(RoundedCornerShape(16.u)).background(Brush.verticalGradient(listOf(Color(0xFFFFD75A), Color(0xFFE89A00))))
                        .border(4.u, Color(0xFFFFF3A6), RoundedCornerShape(16.u)).gloss(0.9f),
                    contentAlignment = Alignment.Center,
                ) { Icon("ic-addfriend", 40) }
            }
            Box(Modifier.height(12.u))
            if (adding) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.u)) {
                    PillInput(username, "Friend's username", Modifier.weight(1f))
                    Box(
                        Modifier.height(64.u).tap(label = "Add") {
                            val n = username.value.trim()
                            if (n.isNotEmpty()) run { Api.post("/friends", Api.body("username" to n)).also { username.value = ""; adding = false } }
                        }.lip(4, Color(0xFF0D6B47), 999).clip(RoundedCornerShape(999.u)).background(Brush.verticalGradient(listOf(C.MintTop, C.MintBottom))).padding(horizontal = 24.u),
                        contentAlignment = Alignment.Center,
                    ) { Txt("ADD", 26) }
                }
            } else {
                Row(
                    Modifier.fillMaxWidth().height(64.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF1B1030)).border(4.u, Color(0xFF8D6BD8), RoundedCornerShape(999.u)).padding(horizontal = 20.u),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
                ) {
                    Icon("ic-search", 32)
                    BareInput(query, "Search friend...", Modifier.weight(1f), Color(0x99FFFFFF))
                }
            }
            Box(Modifier.height(12.u))
            note?.let { (ok, t) -> Txt(t, 22, color = if (ok) C.MintTop else Color(0xFFFF6FB1), font = Body, weight = FontWeight.Bold, modifier = Modifier.padding(start = 8.u, bottom = 8.u)) }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(end = 4.u), verticalArrangement = Arrangement.spacedBy(8.u)) {
                incoming.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.u)).background(Color(0x26FFC531)).border(2.u, Color(0x99FFC531), RoundedCornerShape(18.u)).padding(8.u),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
                    ) {
                        RimAvatar(r.avatar, r.userId, 72)
                        Column(Modifier.weight(1f)) {
                            Txt(r.name, 28, font = Body, weight = FontWeight.Black, maxLines = 1)
                            Txt("wants to be friends", 20, color = Color(0xFFFFE9A8), font = Body, weight = FontWeight.Bold)
                        }
                        Box(Modifier.size(56.u).tap(label = "Accept ${r.name}") { run { Api.post("/friends/${r.id}/accept") } }.clip(CircleShape).background(Color(0xFF18C587)), contentAlignment = Alignment.Center) { Icon("ic-check", 32) }
                        Box(Modifier.size(56.u).tap(label = "Decline ${r.name}") { run { Api.delete("/friends/${r.id}") } }.clip(CircleShape).background(Color(0x26FFFFFF)), contentAlignment = Alignment.Center) { Icon("ic-close", 32) }
                    }
                }
                friends.forEach { fr ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.u)).background(Brush.verticalGradient(listOf(Color(0x1AFFFFFF), Color(0x4D000000)))).border(2.u, Color(0x0DFFFFFF), RoundedCornerShape(18.u)).padding(8.u),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u),
                    ) {
                        Box(Modifier.size(76.u, 80.u)) {
                            RimAvatar(fr.avatar, fr.userId, 76)
                            Box(Modifier.align(Alignment.BottomEnd).clip(RoundedCornerShape(999.u)).background(Color(0xFFFFC531)).padding(horizontal = 6.u)) { Txt("${fr.level}", 16, color = Color(0xFF5A2600)) }
                        }
                        Column(Modifier.weight(1f)) {
                            Txt(fr.name, 28, font = Body, weight = FontWeight.Black, maxLines = 1)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.u)) {
                                Box(Modifier.size(16.u).clip(CircleShape).background(if (fr.online) Color(0xFF2FD14F) else Color(0x80FFFFFF)).then(if (fr.online) Modifier.border(3.u, Color(0x592FD14F), CircleShape) else Modifier))
                                Txt(if (fr.online) (if (fr.inGame) "Playing${fr.roomName?.let { " · $it" } ?: ""}" else "Online") else "Offline", 22, color = if (fr.online) Color(0xFF4EE36B) else Color(0xB3FFFFFF), font = Body, weight = FontWeight.Bold, maxLines = 1)
                            }
                            if (!fr.online) Txt(seenAgo(fr.lastSeenAt), 18, color = Color(0x99FFFFFF), font = Body, weight = FontWeight.Bold)
                        }
                        if (fr.online && !fr.inGame) {
                            Box(
                                Modifier.size(56.u).spring("f${fr.id}", "tile", 2.6f, 1.4f).tap(label = "Invite ${fr.name}") { run { Api.post("/friends/${fr.userId}/invite") } }
                                    .lip(3, Color(0xFF0B3A80), 999).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFF4CC3FF), Color(0xFF3641F5)))).border(3.u, Color(0xFFFFC531), CircleShape),
                                contentAlignment = Alignment.Center,
                            ) { Icon("ic-send", 28) }
                        }
                    }
                }
                f?.outgoing?.filter(match)?.forEach { r ->
                    Row(Modifier.fillMaxWidth().alpha(0.7f).padding(8.u), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.u)) {
                        RimAvatar(r.avatar, r.userId, 60)
                        Txt("${r.name} · request sent", 22, font = Body, weight = FontWeight.Bold, maxLines = 1)
                    }
                }
                if (f != null && friends.size + incoming.size == 0) {
                    Txt(if (query.value.isNotBlank()) "No friends match your search." else "No friends yet. Tap the add button to invite someone by username.", 22, color = Color(0xA6FFFFFF), font = Body, weight = FontWeight.Bold, align = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 24.u, horizontal = 12.u))
                }
            }
        }
    }
}

/** A borderless text input (placeholder + text in the web app's 26 px). */
@Composable
fun BareInput(state: MutableState<String>, hint: String, modifier: Modifier, hintColor: Color = Color(0x73FFFFFF), size: Number = 26, color: Color = Color.White, password: Boolean = false, shown: Boolean = false) {
    Box(modifier, contentAlignment = Alignment.CenterStart) {
        if (state.value.isEmpty()) Txt(hint, size, color = hintColor, font = Body, weight = FontWeight.Bold, maxLines = 1)
        BasicTextField(
            state.value, { state.value = it }, Modifier.fillMaxWidth(), singleLine = true,
            textStyle = TextStyle(fontFamily = Body, fontWeight = FontWeight.Bold, fontSize = size.ts, color = color),
            cursorBrush = SolidColor(C.Gold),
            visualTransformation = if (password && !shown) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        )
    }
}

/** The purple-rimmed pill input of the friends panel. */
@Composable
fun PillInput(state: MutableState<String>, hint: String, modifier: Modifier) {
    Box(modifier.height(64.u).clip(RoundedCornerShape(999.u)).background(Color(0xFF1B1030)).border(4.u, Color(0xFF8D6BD8), RoundedCornerShape(999.u)).padding(horizontal = 24.u), contentAlignment = Alignment.CenterStart) {
        BareInput(state, hint, Modifier.fillMaxWidth())
    }
}
