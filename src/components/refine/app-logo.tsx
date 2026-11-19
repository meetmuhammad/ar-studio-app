'use client'

/* eslint-disable @next/next/no-img-element -- small static brand images of unknown aspect ratio; next/image needs fixed dimensions and would add nothing here */
import { useState } from 'react'
import { BRAND } from '@/lib/brand'
import { useColorMode } from '@/components/providers/color-mode-provider'

/**
 * Brand pieces for the shell and sign-in, all from src/lib/brand.ts.
 * Each image falls back to text when the asset is missing (before
 * `npm run brand:assets` has run), so the app never shows a broken image.
 */

/** The lion mark on its black ground, square. Used as the logo (and alone when the sider is collapsed). */
export function AppLogo({ size = 28 }: { size?: number }) {
  const [failed, setFailed] = useState(false)
  const box: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.22),
    background: BRAND.colors.black,
    overflow: 'hidden',
    flex: 'none',
  }
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="brand-font"
        style={{ ...box, color: BRAND.colors.gold, fontSize: Math.round(size * 0.34), fontWeight: 400, letterSpacing: '0.02em' }}
      >
        {BRAND.shortName}
      </span>
    )
  }
  return (
    <span style={box}>
      <img src={BRAND.assets.lionMark} alt="" width={size} height={size} onError={() => setFailed(true)} style={{ display: 'block', width: size, height: size }} />
    </span>
  )
}

/**
 * The "AHSAN TARIQ" wordmark, light or dark variant to match the theme. Falls
 * back to the brand name in the brand font. `label` is its accessible name.
 */
export function BrandWordmark({ height = 16, maxWidth = 132, label = BRAND.name }: { height?: number; maxWidth?: number; label?: string }) {
  const { mode } = useColorMode()
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className="brand-font"
        style={{ fontSize: Math.max(12, Math.round(height * 0.85)), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth, display: 'inline-block', verticalAlign: 'middle' }}
      >
        {label}
      </span>
    )
  }
  return (
    <img
      src={mode === 'dark' ? BRAND.assets.wordmarkDark : BRAND.assets.wordmark}
      alt={label}
      onError={() => setFailed(true)}
      style={{ display: 'block', height, width: 'auto', maxWidth, objectFit: 'contain' }}
    />
  )
}

/** Sider title text (expanded): the wordmark, named "Ahsan Tariq Studio" for screen readers. */
export function BrandTitle() {
  return <BrandWordmark height={15} maxWidth={130} />
}
