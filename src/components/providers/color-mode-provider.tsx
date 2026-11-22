'use client'

import '@ant-design/v5-patch-for-react-19'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { useTheme } from 'next-themes'
import { getAntdTheme, type ColorMode } from '@/lib/refine/theme'

/**
 * Light / dark mode for both UI kits.
 *
 * next-themes is the single source of truth: it persists the choice in
 * localStorage ("theme"), follows prefers-color-scheme while nothing is saved,
 * and sets the `dark` class the legacy shadcn pages style against. This
 * provider feeds the same resolved mode to antd's ConfigProvider
 * (defaultAlgorithm / darkAlgorithm), so the Refine shell and the legacy
 * pages always switch together.
 */

interface ColorModeContextValue {
  mode: ColorMode
  toggle: () => void
}

const ColorModeContext = createContext<ColorModeContextValue>({ mode: 'light', toggle: () => {} })

export const useColorMode = () => useContext(ColorModeContext)

export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme()
  // resolvedTheme is only known on the client; render light until mounted so
  // server and first client render agree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const mode: ColorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light'
  const toggle = useCallback(() => setTheme(mode === 'dark' ? 'light' : 'dark'), [mode, setTheme])
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle])
  const themeConfig = useMemo(() => getAntdTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ColorModeContext.Provider>
  )
}
