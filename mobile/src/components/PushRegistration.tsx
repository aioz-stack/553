'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * On a native device with a signed-in user: ask for notification permission,
 * register with FCM/APNs and send the token to Laravel
 * (PUT /api/v1/auth/devices/push-token). Tapping a notification opens the
 * relevant screen. Needs google-services.json (Android) / push capability
 * (iOS) — see DEVELOPMENT.md. Does nothing in the browser.
 */
export default function PushRegistration() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only enable after Firebase is configured (android/app/google-services.json,
    // APNs key for iOS). Calling register() without it crashes the Android app.
    if (!user || process.env.NEXT_PUBLIC_PUSH_ENABLED !== 'true') {
      return undefined;
    }

    const handles: Array<{ remove: () => Promise<void> }> = [];

    (async () => {
      const { Capacitor } = await import('@capacitor/core');

      if (!Capacitor.isNativePlatform()) {
        return;
      }

      const { PushNotifications } = await import('@capacitor/push-notifications');
      const platform = Capacitor.getPlatform();

      handles.push(
        await PushNotifications.addListener('registration', ({ value }) => {
          api('/auth/devices/push-token', { method: 'PUT', body: { token: value, platform } }).catch(() => undefined);
        }),
        await PushNotifications.addListener('registrationError', () => undefined),
        await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
          const data = notification.data as Record<string, string>;

          if (data.type === 'game_started' && data.table_id) {
            router.push(`/play/?table=${data.table_id}`);
          } else if (data.type === 'points_received') {
            router.push('/wallet/');
          } else {
            router.push('/notifications/');
          }
        }),
      );

      let permission = await PushNotifications.checkPermissions();

      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive === 'granted') {
        await PushNotifications.register();
      }
    })().catch(() => undefined);

    return () => {
      handles.forEach((h) => h.remove());
    };
  }, [user, router]);

  return null;
}
