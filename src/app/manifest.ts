import type { MetadataRoute } from 'next'

/**
 * Web app manifest: lets a phone or tablet add the dashboard to the home screen
 * and open it standalone (no browser chrome).
 *
 * Launch behaviour is deliberately ordinary: start_url is "/", so the normal
 * guards apply. A signed-out launch goes to /sign-in, an admin lands on the
 * dashboard, and staff are redirected to /customers by the dashboard's RoleGuard.
 * Nothing here bypasses authentication, and there is no service worker, so no
 * private data is cached for offline use.
 *
 * Colours come from the app's own dark and light background tokens (the app
 * defaults to dark). Icons are placeholders until brand artwork exists; see
 * scripts/pwa/generate-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AR Studio Dashboard',
    short_name: 'AR Studio',
    description: 'Customer & Order Management System',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0c0d',
    theme_color: '#0b0c0d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
