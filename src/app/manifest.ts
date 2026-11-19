import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

/**
 * Web app manifest: lets a phone or tablet add the dashboard to the home screen
 * and open it standalone (no browser chrome).
 *
 * Launch behaviour is deliberately ordinary: start_url is "/", so the normal
 * guards apply. A signed-out launch goes to /sign-in, an admin lands on the
 * dashboard, and staff are redirected to /customers by the dashboard's access check.
 * Nothing here bypasses authentication, and there is no service worker, so no
 * private data is cached for offline use.
 *
 * Name, colours and icons come from src/lib/brand.ts: brand black for the
 * splash and status bar, the gold lion icons from `npm run brand:assets`
 * (scripts/brand/generate-assets.mjs).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND.colors.black,
    theme_color: BRAND.colors.black,
    icons: [
      { src: BRAND.assets.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: BRAND.assets.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: BRAND.assets.iconMaskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
