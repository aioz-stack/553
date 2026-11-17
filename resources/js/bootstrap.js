import axios from 'axios';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
// Laravel sets the XSRF-TOKEN cookie; axios sends it back automatically on same-origin requests.
window.axios.defaults.withCredentials = true;
window.axios.defaults.withXSRFToken = true;

/*
 * Laravel Echo over Laravel Reverb. Private/presence channel auth goes to
 * /api/v1/broadcasting/auth using the web session cookie (Sanctum stateful).
 */
window.Pusher = Pusher;

if (import.meta.env.VITE_REVERB_APP_KEY) {
  window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        axios
          .post('/api/v1/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
          .then((response) => callback(null, response.data))
          .catch((error) => callback(error, null));
      },
    }),
  });
}
