package ph.pusoy13.game.core

import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Laravel Reverb client (the Pusher protocol, v7) over an OkHttp WebSocket — the native
 * counterpart of laravel-echo + pusher-js in the web apps. Private (`private-…`) and presence
 * (`presence-…`) channels are authorised with the Sanctum bearer token at
 * /api/v1/broadcasting/auth, exactly like the web apps. Events are only signals: every screen
 * re-reads the authoritative state from the REST API when one arrives.
 *
 * Listeners run on the main thread. Each [listen] returns a handle; a channel is unsubscribed
 * when its last listener is removed. The socket reconnects with backoff and re-subscribes.
 */
object Echo {
    fun interface Listener {
        fun onEvent(event: String, data: JSONObject?)
    }

    class Handle internal constructor(private val channel: String, private val listener: Listener) {
        fun remove() = Echo.remove(channel, listener)
    }

    private class Channel(val name: String) {
        val listeners = mutableListOf<Pair<String, Listener>>()
        var subscribed = false
    }

    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val channels = mutableMapOf<String, Channel>()
    private var socket: WebSocket? = null
    private var socketId: String? = null
    private var connecting = false
    private var attempt = 0

    private val _connected = MutableStateFlow(false)
    /** True while the socket is connected (screens poll less often then). */
    val connected: StateFlow<Boolean> = _connected

    val enabled: Boolean get() = Config.reverbKey.isNotBlank()

    /** Listen to `event` (or "*" for every event) on a channel, e.g. "presence-table.12", "private-user.3", "lobbies". */
    @Synchronized
    fun listen(channel: String, event: String, listener: Listener): Handle {
        val ch = channels.getOrPut(channel) { Channel(channel) }
        ch.listeners += event to listener
        if (enabled) {
            if (socket == null) connect() else if (!ch.subscribed && socketId != null) subscribe(ch)
        }
        return Handle(channel, listener)
    }

    fun presence(name: String) = "presence-$name"
    fun private(name: String) = "private-$name"

    @Synchronized
    private fun remove(channel: String, listener: Listener) {
        val ch = channels[channel] ?: return
        ch.listeners.removeAll { it.second === listener }
        if (ch.listeners.isEmpty()) {
            channels.remove(channel)
            if (ch.subscribed) send("pusher:unsubscribe", JSONObject().put("channel", channel))
        }
    }

    /** Sign-out: close the socket and forget every channel. */
    @Synchronized
    fun reset() {
        channels.clear()
        socket?.close(1000, "bye")
        socket = null
        socketId = null
        connecting = false
        _connected.value = false
    }

    /** The network came back or the app returned to the foreground: reconnect at once if needed. */
    @Synchronized
    fun wake() {
        if (enabled && socket == null && channels.isNotEmpty()) {
            attempt = 0
            connect()
        }
    }

    @Synchronized
    private fun connect() {
        if (connecting || socket != null) return
        connecting = true
        val scheme = if (Config.reverbTls) "wss" else "ws"
        val url = "$scheme://${Config.reverbHost}:${Config.reverbPort}/app/${Config.reverbKey}?protocol=7&client=pusoy-android&version=2.0&flash=false"
        socket = Api.http.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) = handle(webSocket, text)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = dropped(webSocket)
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = dropped(webSocket)
        })
    }

    @Synchronized
    private fun dropped(ws: WebSocket) {
        if (socket !== ws) return
        socket = null
        socketId = null
        connecting = false
        _connected.value = false
        channels.values.forEach { it.subscribed = false }
        if (channels.isEmpty()) return
        val delay = minOf(15_000L, 1_000L shl minOf(attempt, 4))
        attempt++
        main.postDelayed({ synchronized(this) { if (socket == null && channels.isNotEmpty()) connect() } }, delay)
    }

    private fun handle(ws: WebSocket, text: String) {
        val msg = runCatching { JSONObject(text) }.getOrNull() ?: return
        val event = msg.optString("event")
        val channel = msg.str("channel")
        val data = msg.opt("data").let { d ->
            when (d) {
                is JSONObject -> d
                is String -> runCatching { JSONObject(d) }.getOrNull()
                else -> null
            }
        }
        when (event) {
            "pusher:connection_established" -> synchronized(this) {
                if (socket !== ws) return
                socketId = data?.optString("socket_id")
                connecting = false
                attempt = 0
                _connected.value = true
                channels.values.forEach { subscribe(it) }
            }
            "pusher:ping" -> send("pusher:pong", JSONObject())
            "pusher:error" -> Unit
            "pusher_internal:subscription_succeeded" -> synchronized(this) { channels[channel]?.subscribed = true }
            else -> if (channel != null) dispatch(channel, event, data)
        }
    }

    private fun dispatch(channel: String, event: String, data: JSONObject?) {
        val targets = synchronized(this) { channels[channel]?.listeners?.filter { it.first == "*" || it.first == event }?.map { it.second } ?: emptyList() }
        if (targets.isEmpty()) return
        main.post { targets.forEach { it.onEvent(event, data) } }
    }

    private fun subscribe(ch: Channel) {
        val id = socketId ?: return
        if (!ch.name.startsWith("private-") && !ch.name.startsWith("presence-")) {
            send("pusher:subscribe", JSONObject().put("channel", ch.name))
            return
        }
        scope.launch {
            try {
                val auth = Api.post("/broadcasting/auth", Api.body("socket_id" to id, "channel_name" to ch.name))
                val payload = JSONObject().put("channel", ch.name).put("auth", auth.optString("auth"))
                auth.str("channel_data")?.let { payload.put("channel_data", it) }
                synchronized(this@Echo) { if (socketId == id && channels[ch.name] === ch) send("pusher:subscribe", payload) }
            } catch (_: Exception) {
                // Not allowed (e.g. no longer seated) or offline: screens keep polling the API.
            }
        }
    }

    private fun send(event: String, data: JSONObject) {
        socket?.send(JSONObject().put("event", event).put("data", data).toString())
    }
}
