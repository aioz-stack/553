import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errorText } from '@/lib/api';
import { QUALITIES, useMotion, type Quality } from '@/lib/motion';
import { CandyButton, Overlay, Panel } from './kit';
import { font } from './theme';

const LABEL: Record<Quality, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** Settings: Motion Effects (follows the account) and Change Password. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [quality, setQuality] = useMotion();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = (q: Quality) => {
    setQuality(q);
    api('/profile/preferences', { method: 'PUT', body: { motion: q } }).catch(() => undefined);
  };

  const updatePassword = async () => {
    if (form.next.length < 8 || !/[A-Za-z]/.test(form.next) || !/\d/.test(form.next)) {
      setMessage({ ok: false, text: 'Password must be at least 8 characters and include letters and numbers.' });
      return;
    }
    if (form.next !== form.confirm) {
      setMessage({ ok: false, text: 'The new passwords do not match.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api('/profile/password', { method: 'PUT', body: { current_password: form.current, password: form.next, password_confirmation: form.confirm } });
      setForm({ current: '', next: '', confirm: '' });
      setMessage({ ok: true, text: 'Your password has been changed.' });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <Panel x={270} y={60} w={1060} h={800} title="Settings" onClose={onClose}>
        <Text style={styles.section}>🎞 MOTION EFFECTS</Text>
        <Text style={styles.help}>Graphics and animation quality for a smoother gaming experience.</Text>
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
          {QUALITIES.map((q) => (
            <CandyButton key={q} title={`${quality === q ? '✓ ' : ''}${LABEL[q]}`} tone={quality === q ? 'green' : 'dark'} w={280} h={70} size={30} onPress={() => pick(q)} />
          ))}
        </View>

        <Text style={[styles.section, { marginTop: 30 }]}>🔒 CHANGE PASSWORD</Text>
        {(
          [
            ['current', 'Current Password'],
            ['next', 'New Password'],
            ['confirm', 'Confirm New Password'],
          ] as const
        ).map(([k, label]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <TextInput secureTextEntry value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} style={styles.input} placeholderTextColor="#9c8aa8" placeholder={label} autoCapitalize="none" />
          </View>
        ))}
        {message && <Text style={[styles.help, { color: message.ok ? '#7dffa0' : '#ff9aa8', marginTop: 8 }]}>{message.text}</Text>}
        <CandyButton title={busy ? 'UPDATING…' : 'UPDATE PASSWORD'} tone="green" w={480} h={76} size={30} onPress={updatePassword} disabled={busy} style={{ alignSelf: 'center', marginTop: 16 }} />
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.display, fontSize: 34, color: '#ffe14d' },
  help: { fontFamily: font.body, fontSize: 22, color: '#e8dcf2' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 },
  label: { width: 330, fontFamily: font.display, fontSize: 28, color: '#fff' },
  input: { flex: 1, height: 64, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 2, borderColor: '#a86204', color: '#fff', fontFamily: font.body, fontSize: 24, paddingHorizontal: 18 },
});
