package ph.pusoy13.game.core

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/**
 * Game sound effects and background music, synthesised in code like the web apps' Web Audio
 * versions (mobile/src/lib/sound.ts, music.ts) — no audio files. Effects are rendered once into
 * PCM and played on a small worker; the 16-bar festival tune is rendered once and looped.
 */
object Sound {
    private const val RATE = 22050
    private val worker = Executors.newSingleThreadExecutor()
    private val cache = mutableMapOf<String, ShortArray>()

    @Volatile var sfxOn = true
        private set
    @Volatile var musicOn = true
        private set

    fun init() {
        sfxOn = Store.flag("pusoy.sound", true)
        musicOn = Store.flag("pusoy.bgm", true)
    }

    fun setSfx(on: Boolean) {
        sfxOn = on
        Store.setFlag("pusoy.sound", on)
        if (on) play("tap")
    }

    fun setMusic(on: Boolean) {
        musicOn = on
        Store.setFlag("pusoy.bgm", on)
        if (on) Music.start() else Music.stop()
    }

    fun play(name: String) {
        if (!sfxOn) return
        worker.execute {
            val pcm = synchronized(cache) { cache.getOrPut(name) { render(name) } }
            if (pcm.isEmpty()) return@execute
            runCatching {
                val track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.size * 2)
                    .build()
                track.write(pcm, 0, pcm.size)
                track.play()
                Thread.sleep(pcm.size * 1000L / RATE + 60)
                track.release()
            }
        }
    }

    // ---- synthesis ----

    private class Mix(seconds: Double) {
        val buf = FloatArray((seconds * RATE).toInt())

        fun tone(freq: Double, start: Double, dur: Double, wave: String = "sine", gain: Double = 0.18, endFreq: Double? = null) {
            val s0 = (start * RATE).toInt()
            val n = ((dur + 0.02) * RATE).toInt()
            var phase = 0.0
            for (i in 0 until n) {
                val idx = s0 + i
                if (idx >= buf.size) break
                val t = i.toDouble() / RATE
                val f = if (endFreq == null) freq else freq * (endFreq / freq).pow(minOf(1.0, t / dur))
                phase += f / RATE
                val p = phase - floor(phase)
                val v = when (wave) {
                    "triangle" -> 1 - 4 * abs(p - 0.5)
                    "square" -> if (p < 0.5) 1.0 else -1.0
                    "sawtooth" -> 2 * p - 1
                    else -> sin(2 * PI * p)
                }
                // linear attack (10 ms), exponential decay to ~0 at `dur`
                val env = if (t < 0.01) t / 0.01 * gain else gain * exp(ln(0.0001 / gain) * ((t - 0.01) / maxOf(0.001, dur - 0.01)).coerceIn(0.0, 1.0))
                buf[idx] += (v * env).toFloat()
            }
        }

        fun noise(start: Double, dur: Double, gain: Double = 0.12, lowpass: Boolean = false) {
            val s0 = (start * RATE).toInt()
            val n = (dur * RATE).toInt()
            var lp = 0.0
            var prev = 0.0
            for (i in 0 until n) {
                val idx = s0 + i
                if (idx >= buf.size) break
                val raw = (Random.nextDouble() * 2 - 1) * (1 - i.toDouble() / n)
                val v = if (lowpass) {
                    lp += 0.18 * (raw - lp); lp
                } else {
                    val hp = raw - prev; prev = raw; hp * 0.7
                }
                buf[idx] += (v * gain).toFloat()
            }
        }

        fun pcm(volume: Double = 1.0): ShortArray = ShortArray(buf.size) { (buf[it] * volume).coerceIn(-1.0, 1.0).let { v -> (v * 32000).toInt().toShort() } }
    }

    private fun render(name: String): ShortArray {
        val m = Mix(1.0)
        when (name) {
            "tap" -> m.tone(660.0, 0.0, 0.06, "triangle", 0.12)
            "deal" -> { m.noise(0.0, 0.07); m.noise(0.08, 0.07) }
            "chip" -> { m.tone(1250.0, 0.0, 0.05, "square", 0.06); m.tone(1650.0, 0.05, 0.08, "square", 0.05) }
            "tick" -> m.tone(1000.0, 0.0, 0.03, "square", 0.04)
            "start" -> listOf(523.0, 659.0, 784.0).forEachIndexed { i, f -> m.tone(f, i * 0.08, 0.16, "triangle") }
            "win" -> listOf(523.0, 659.0, 784.0, 1047.0).forEachIndexed { i, f -> m.tone(f, i * 0.1, 0.28, "triangle") }
            "lose" -> listOf(392.0, 330.0, 262.0).forEachIndexed { i, f -> m.tone(f, i * 0.12, 0.25, "sawtooth", 0.08) }
            "flip" -> { m.noise(0.0, 0.045, 0.1); m.tone(1400.0, 0.0, 0.03, "triangle", 0.05) }
            "boom" -> { m.tone(140.0, 0.0, 0.6, "sine", 0.4, endFreq = 38.0); m.noise(0.0, 0.7, 0.35, lowpass = true) }
            "zap" -> { listOf(0.0, 0.09, 0.2).forEach { m.noise(it, 0.08, 0.16) }; m.tone(880.0, 0.0, 0.25, "sawtooth", 0.05); m.tone(220.0, 0.05, 0.3, "square", 0.04) }
            "lucky" -> listOf(784.0, 988.0, 1175.0, 1568.0, 1976.0).forEachIndexed { i, f -> m.tone(f, i * 0.07, 0.3, "sine", 0.16) }
            else -> return ShortArray(0)
        }
        // trim trailing silence
        var end = m.buf.size
        while (end > 0 && abs(m.buf[end - 1]) < 0.0005f) end--
        return m.pcm(1.6).copyOf(end)
    }

    /** Background music: a gentle pentatonic festival tune (~84 bpm), rendered once and looped. */
    object Music {
        private const val BPM = 84.0
        private val MELODY = intArrayOf(
            76, 0, 79, 81, 79, 76, 74, 0, 72, 74, 76, 79, 76, 0, 0, 0,
            81, 0, 79, 76, 74, 76, 79, 0, 76, 74, 72, 0, 74, 0, 0, 0,
            76, 79, 81, 84, 81, 79, 76, 0, 79, 76, 74, 72, 74, 76, 0, 0,
            72, 0, 74, 76, 79, 76, 74, 72, 69, 72, 74, 0, 72, 0, 0, 0,
        )
        private val BASS = intArrayOf(48, 45, 43, 48, 48, 45, 43, 43, 45, 48, 43, 45, 48, 45, 43, 48)
        private var track: AudioTrack? = null
        private var wanted = false

        private fun hz(m: Int) = 440.0 * 2.0.pow((m - 69) / 12.0)

        @Synchronized
        fun start() {
            wanted = true
            if (!musicOn || track != null) return
            worker.execute {
                val pcm = synchronized(cache) { cache.getOrPut("bgm") { renderTune() } }
                synchronized(this) {
                    if (!wanted || !musicOn || track != null) return@execute
                    runCatching {
                        val t = AudioTrack.Builder()
                            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                            .setTransferMode(AudioTrack.MODE_STATIC)
                            .setBufferSizeInBytes(pcm.size * 2)
                            .build()
                        t.write(pcm, 0, pcm.size)
                        t.setLoopPoints(0, pcm.size, -1)
                        t.play()
                        track = t
                    }
                }
            }
        }

        /** Pause (app in the background) or switch off. */
        @Synchronized
        fun stop() {
            wanted = false
            track?.let { runCatching { it.stop(); it.release() } }
            track = null
        }

        private fun renderTune(): ShortArray {
            val eighth = 60.0 / BPM / 2
            val steps = BASS.size * 8
            val m = Mix(steps * eighth)
            for (step in 0 until steps) {
                val t = step * eighth
                val note = MELODY[step % MELODY.size]
                if (note != 0) m.tone(hz(note), t, eighth * 1.8, "triangle", 0.09)
                if (step % 4 == 0) {
                    val bar = (step / 8) % BASS.size
                    m.tone(hz(BASS[bar]), t, eighth * 3.8, "sine", 0.12)
                    if (step % 8 == 0) m.tone(hz(BASS[bar] + 19), t, eighth * 7.5, "sine", 0.025)
                }
            }
            return m.pcm(0.35 * 2.2)
        }
    }
}
