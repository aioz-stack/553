import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import NativeShell from '@/components/NativeShell';
import PushRegistration from '@/components/PushRegistration';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

// Fonts are downloaded at build time and bundled into the static export.
const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display-face', display: 'swap' });
const body = Nunito({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pusoy 13',
  description: 'Four-player Chinese Poker',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#170a3a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <NativeShell />
          <PushRegistration />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
