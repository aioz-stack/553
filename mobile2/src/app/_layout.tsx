import { Baloo2_700Bold, Baloo2_800ExtraBold, useFonts } from '@expo-google-fonts/baloo-2';
import { Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { router, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { setToken } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { resetEcho } from '@/lib/echo';
import { on } from '@/lib/events';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Shell() {
  const { ready, refresh } = useAuth();
  const [fonts] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold, Nunito_700Bold, Nunito_800ExtraBold });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (ready && fonts) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, fonts]);

  // One active login per player: another device signed in, so this one is signed out.
  useEffect(
    () =>
      on('disconnected', ({ title, message }) => {
        Alert.alert(title, message || 'Your account was signed in on another device.', [
          {
            text: 'OK',
            onPress: async () => {
              await setToken(null);
              resetEcho();
              await refresh();
              router.replace('/login');
            },
          },
        ]);
      }),
    [refresh],
  );

  if (!ready || !fonts) return null;
  return (
    <>
      <StatusBar hidden />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#170a3a' } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#170a3a' }}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
