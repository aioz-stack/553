import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { config } from './config';
import { getToken } from './api';

/**
 * Laravel Echo over Reverb, authorising private/presence channels with the
 * Sanctum bearer token at /api/v1/broadcasting/auth.
 */
let instance: Echo<'reverb'> | null = null;

export async function getEcho(): Promise<Echo<'reverb'> | null> {
  if (!config.reverb.key || typeof window === 'undefined') {
    return null;
  }

  if (instance) {
    return instance;
  }

  const token = await getToken();
  (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

  instance = new Echo({
    broadcaster: 'reverb',
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
  });

  return instance;
}

export function resetEcho() {
  instance?.disconnect();
  instance = null;
}
