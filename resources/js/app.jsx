import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './lib/ThemeContext';

const appName = import.meta.env.VITE_APP_NAME || 'Pusoy 13';

createInertiaApp({
  title: (title) => (title ? `${title} | ${appName}` : appName),
  resolve: (name) => {
    // Baseplate pages are .jsx; new platform pages are written in TypeScript (.tsx).
    // Pages are code-split and loaded on demand.
    const pages = import.meta.glob('./Pages/**/*.{jsx,tsx}');
    const page = pages[`./Pages/${name}.tsx`] ?? pages[`./Pages/${name}.jsx`];

    if (!page) {
      throw new Error(`Inertia page not found: ${name}`);
    }

    return page();
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <ThemeProvider>
        <App {...props} />
      </ThemeProvider>,
    );
  },
  progress: {
    color: '#465fff',
  },
});
