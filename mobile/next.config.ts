import type { NextConfig } from 'next';

/**
 * Static export: the native app bundles plain HTML/JS/CSS (webDir "out"),
 * so no Next.js server is needed at runtime. Dynamic data comes from the
 * Laravel API; routes use query strings (e.g. /play?table=12) instead of
 * dynamic segments so every page can be pre-rendered.
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // This app lives inside the Laravel repo; keep Turbopack rooted here.
  turbopack: { root: __dirname },
};

export default nextConfig;
