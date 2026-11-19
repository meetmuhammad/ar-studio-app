import { RefineThemes } from '@refinedev/antd'
import { theme, type ThemeConfig } from 'antd'
import { BRAND } from '@/lib/brand'

/**
 * Ant Design theme for the Refine shell.
 *
 * The accent is the brand gold, and ACCENT below is the one place the shell
 * takes it from (values live in src/lib/brand.ts with their contrast rules).
 * Gold needs a different shade per theme to stay readable: a deep gold with
 * white text on light backgrounds, a bright gold with dark text on dark ones.
 * Tables, buttons, links, menus, focus rings and charts all read the antd
 * token, so nothing else in the app hardcodes the accent.
 */
export const ACCENT = {
  light: BRAND.colors.accentLight,
  dark: BRAND.colors.accentDark,
  onLight: BRAND.colors.onAccentLight,
  onDark: BRAND.colors.onAccentDark,
} as const

export type ColorMode = 'light' | 'dark'

const FONT_FAMILY = 'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

/** Light page background behind the white cards (CRM-style). */
const LIGHT_LAYOUT_BG = '#f5f7fa'

export function getAntdTheme(mode: ColorMode): ThemeConfig {
  const dark = mode === 'dark'
  const accent = dark ? ACCENT.dark : ACCENT.light
  const onAccent = dark ? ACCENT.onDark : ACCENT.onLight
  return {
    ...RefineThemes.Blue,
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      ...RefineThemes.Blue.token,
      colorPrimary: accent,
      colorLink: accent,
      // Text and icons on solid accent surfaces (primary buttons, avatars,
      // checked boxes, current step): dark on the bright gold of dark mode.
      colorTextLightSolid: onAccent,
      fontFamily: FONT_FAMILY,
      borderRadius: 8,
      ...(dark ? {} : { colorBgLayout: LIGHT_LAYOUT_BG }),
    },
    components: {
      Layout: {
        headerBg: dark ? '#141414' : '#ffffff',
        siderBg: dark ? '#141414' : '#ffffff',
        headerPadding: '0 24px',
      },
      Menu: {
        itemBorderRadius: 8,
        itemMarginInline: 8,
      },
      Card: {
        headerFontSize: 15,
      },
      // Danger buttons keep white text on red, as before the gold accent.
      Button: {
        primaryColor: onAccent,
        dangerColor: '#ffffff',
      },
    },
  }
}

/** Soft card shadow per mode (cards also get a hairline border in dark mode). */
export const cardShadow = (mode: ColorMode) =>
  mode === 'dark' ? 'none' : '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)'
