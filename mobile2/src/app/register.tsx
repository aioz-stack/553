import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parseRegistrationLink } from '@/lib/registration';
import { CandyButton, Toast } from '@/ui/kit';
import { font } from '@/ui/theme';
import { Field } from './login';

/**
 * Registration: creates a PENDING account (an administrator approves it before sign-in), exactly
 * like the web app. Registration needs an agent's referral code or link (the server checks it).
 */
export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', password_confirmation: '', referral_code: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      // The referral field takes a code or a whole registration link (…/register/agent?ref=CODE).
      const { referral_code, account_type } = parseRegistrationLink(form.referral_code);
      const message = await register({ ...form, referral_code, account_type });
      setToast({ ok: true, text: message || 'Registered. You can log in once your account is approved.' });
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/img/login-art.webp')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.center}>
        <LinearGradient colors={['rgba(40,8,30,0.94)', 'rgba(20,4,16,0.94)']} style={styles.card}>
          <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Create account</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field icon="🙂" placeholder="Full name" value={form.name} onChange={set('name')} />
              </View>
              <View style={{ flex: 1 }}>
                <Field icon="👤" placeholder="Username" value={form.username} onChange={set('username')} />
              </View>
            </View>
            <Field icon="✉️" placeholder="Email" value={form.email} onChange={set('email')} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field icon="🔒" placeholder="Password" value={form.password} onChange={set('password')} secure />
              </View>
              <View style={{ flex: 1 }}>
                <Field icon="🔒" placeholder="Confirm password" value={form.password_confirmation} onChange={set('password_confirmation')} secure />
              </View>
            </View>
            <Field icon="🎟️" placeholder="Referral code or registration link" value={form.referral_code} onChange={set('referral_code')} />
            <CandyButton title={busy ? 'SENDING…' : 'REGISTER'} onPress={submit} disabled={busy} w={300} h={54} size={22} style={{ alignSelf: 'center' }} />
            <Pressable onPress={() => router.back()} style={{ alignSelf: 'center' }}>
              <Text style={styles.link}>Back to login</Text>
            </Pressable>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
      <Toast toast={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14040f' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: 560, maxHeight: '92%', padding: 16, borderRadius: 22, borderWidth: 2, borderColor: '#f5ad14' },
  title: { fontFamily: font.display, fontSize: 26, color: '#ffe14d', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  link: { fontFamily: font.bodyHeavy, color: '#ffe14d', fontSize: 14 },
});
