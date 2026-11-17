import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import NativeShell from '@/components/NativeShell';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

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
  themeColor: '#161950',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <NativeShell />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
