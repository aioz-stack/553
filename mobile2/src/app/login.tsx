import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CandyButton, Toast } from '@/ui/kit';
import { font } from '@/ui/theme';

/** Login over the login artwork (same art as the web app). */
export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!username || !password) {
      setToast({ ok: false, text: 'Enter your username and password.' });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      await login(username.trim(), password);
      router.replace('/home');
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
        <LinearGradient colors={['rgba(40,8,30,0.92)', 'rgba(20,4,16,0.92)']} style={styles.card}>
          <Field icon="👤" placeholder="Username" value={username} onChange={setUsername} />
          <Field icon="🔒" placeholder="Password" value={password} onChange={setPassword} secure={!show} onToggle={() => setShow((s) => !s)} />
          <CandyButton title={busy ? 'LOGGING IN…' : 'LOG IN'} onPress={submit} disabled={busy} w={300} h={56} size={24} style={{ alignSelf: 'center', marginTop: 6 }} />
          <Pressable onPress={() => router.push('/register')} style={{ alignSelf: 'center', marginTop: 10 }}>
            <Text style={styles.link}>No account? Register</Text>
          </Pressable>
        </LinearGradient>
      </KeyboardAvoidingView>
      <Toast toast={toast} />
    </View>
  );
}

export function Field({ icon, placeholder, value, onChange, secure, onToggle }: { icon: string; placeholder: string; value: string; onChange: (v: string) => void; secure?: boolean; onToggle?: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.icon}>{icon}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#c9b8a6"
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {onToggle && (
        <Pressable onPress={onToggle} hitSlop={10} accessibilityLabel={secure ? 'Show password' : 'Hide password'}>
          <Text style={styles.icon}>{secure ? '👁' : '🙈'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14040f' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: 380, padding: 18, gap: 12, borderRadius: 22, borderWidth: 2, borderColor: '#f5ad14', marginTop: 40 },
  field: { flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#a86204', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, gap: 10 },
  icon: { fontSize: 18 },
  input: { flex: 1, color: '#fff', fontFamily: font.body, fontSize: 16, paddingVertical: 0 },
  link: { fontFamily: font.bodyHeavy, color: '#ffe14d', fontSize: 14 },
});
