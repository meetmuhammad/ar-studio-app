import { RefineThemes } from '@refinedev/antd'
import { theme, type ThemeConfig } from 'antd'

/**
 * Ant Design theme for the Refine shell.
 *
 * The base is RefineThemes.Blue. To change the accent colour across the shell,
 * tables, buttons and charts, change ACCENT below (or point it at another
 * preset, e.g. RefineThemes.Purple.token?.colorPrimary). Nothing else in the
 * app hardcodes the accent.
 */
export const ACCENT: string = RefineThemes.Blue.token?.colorPrimary ?? '#1677FF'

export type ColorMode = 'light' | 'dark'

const FONT_FAMILY = 'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

/** Light page background behind the white cards (CRM-style). */
const LIGHT_LAYOUT_BG = '#f5f7fa'

export function getAntdTheme(mode: ColorMode): ThemeConfig {
  const dark = mode === 'dark'
  return {
    ...RefineThemes.Blue,
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      ...RefineThemes.Blue.token,
      colorPrimary: ACCENT,
      colorLink: ACCENT,
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
    },
  }
}

/** Soft card shadow per mode (cards also get a hairline border in dark mode). */
export const cardShadow = (mode: ColorMode) =>
  mode === 'dark' ? 'none' : '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)'
