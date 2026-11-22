/**
 * The brand: name, assets and colours. Everything user-facing reads from here
 * (sidebar, sign-in, page titles, manifest, print sheets, the antd accent).
 *
 * Assets are produced by `npm run brand:assets` (scripts/brand/generate-assets.mjs)
 * from the owner's originals in brand-src/. Without the originals the script
 * writes placeholders to the same paths, so the app works either way.
 *
 * Accent colours must keep these contrast ratios (check with
 * `node scripts/brand/contrast.mjs`, which reads this file):
 *   - primary button text on the accent        >= 4.5:1
 *   - accent as link / text on the theme's page >= 4.5:1
 * Gold that is readable on white is too dark to carry dark text, and gold that
 * carries dark text is too light for text on white, so each theme has its own
 * accent and its own text-on-accent colour.
 */
export const BRAND = {
  name: 'Ahsan Tariq Studio',
  /** Where space is short: collapsed sidebar, small badges, PWA short_name. */
  shortName: 'ATS',
  description: 'Customers, orders, measurements and accounts for Ahsan Tariq Studio',

  assets: {
    /** Gold lion mascot on black (trimmed, up to 1024px). */
    lion: '/brand/lion.png',
    /** Square lion mark on black, 256px (logo, small sizes). */
    lionMark: '/brand/lion-mark.png',
    /** "AHSAN TARIQ" wordmark, gold on transparent: for light backgrounds. */
    wordmark: '/brand/wordmark.png',
    /** The same wordmark, lighter gold: for dark backgrounds. */
    wordmarkDark: '/brand/wordmark-dark.png',
    appleTouchIcon: '/icons/apple-touch-icon.png',
    icon192: '/icons/icon-192.png',
    icon512: '/icons/icon-512.png',
    iconMaskable512: '/icons/icon-maskable-512.png',
    favicon32: '/icons/favicon-32.png',
    favicon16: '/icons/favicon-16.png',
  },

  colors: {
    /** Brand black: icon grounds, PWA background and theme colour. */
    black: '#0B0B0B',
    /** Brand gold: artwork and decorative gold on black. */
    gold: '#D4AF37',
    /** antd accent (colorPrimary / colorLink) per theme. */
    accentLight: '#8A6A12',
    accentDark: '#D4AF37',
    /** Text on a solid accent background (primary buttons, avatars) per theme. */
    onAccentLight: '#FFFFFF',
    onAccentDark: '#141414',
  },
} as const

export type Brand = typeof BRAND
