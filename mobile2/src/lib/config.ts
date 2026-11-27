/**
 * Backend addresses, inlined at build time from EXPO_PUBLIC_* variables (.env — see README).
 * The phone talks to the same Laravel API and Reverb server as the web app; no game rules here.
 */
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\/$/, ''),
  reverb: {
    key: process.env.EXPO_PUBLIC_REVERB_APP_KEY ?? '',
    host: process.env.EXPO_PUBLIC_REVERB_HOST ?? '10.0.2.2',
    port: Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 8080),
    scheme: process.env.EXPO_PUBLIC_REVERB_SCHEME ?? 'http',
  },
};
