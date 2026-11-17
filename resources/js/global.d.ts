import type Echo from 'laravel-echo';
import type Pusher from 'pusher-js';

declare global {
  interface Window {
    Echo?: Echo<'reverb'>;
    Pusher: typeof Pusher;
    axios: typeof import('axios').default;
  }
}

declare module '*.jsx' {
  // Baseplate components are untyped JSX.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: any;
  export default component;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const IconGrid: any, IconUsers: any, IconMenuDots: any, IconChevronRight: any;
}

export {};
