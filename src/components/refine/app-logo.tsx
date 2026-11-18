'use client'

import { theme } from 'antd'

/** Small round mark shown next to "AR Studio" in the sidebar title. */
export function AppLogo() {
  const { token } = theme.useToken()
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: token.colorPrimary,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      }}
    >
      AR
    </span>
  )
}
