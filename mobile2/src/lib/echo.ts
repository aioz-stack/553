import Echo from 'laravel-echo';
import Pusher from 'pusher-js/react-native';
import { getToken } from './api';
import { config } from './config';

/**
 * Laravel Echo over Reverb, authorising private/presence channels with the Sanctum bearer token
 * at /api/v1/broadcasting/auth. Events are only signals: screens re-fetch the server's state.
 */
let instance: Echo<'reverb'> | null = null;

export async function getEcho(): Promise<Echo<'reverb'> | null> {
  if (!config.reverb.key) return null;
  if (instance) return instance;

  const token = await getToken();
  instance = new Echo({
    broadcaster: 'reverb',
    Pusher: Pusher as never,
    key: config.reverb.key,
    wsHost: config.reverb.host,
    wsPort: config.reverb.port,
    wssPort: config.reverb.port,
    forceTLS: config.reverb.scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: (error: Error | null, data: { auth: string; channel_data?: string } | null) => void) => {
        fetch(`${config.apiUrl}/api/v1/broadcasting/auth`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
        })
          .then(async (r) => (r.ok ? callback(null, await r.json()) : callback(new Error(`Auth ${r.status}`), null)))
          .catch((e) => callback(e, null));
      },
    }),
  } as never);

  return instance;
}

export function resetEcho() {
  instance?.disconnect();
  instance = null;
}
