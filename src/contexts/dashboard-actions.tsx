'use client'

import { createContext, useContext } from 'react'

/**
 * Exposes the dialog openers owned by the dashboard layout so page-level headers
 * can trigger them.
 *
 * Presentation wiring only. The dialogs, their submit handlers, the POST to
 * /api/orders, the toasts, and the `orderCreated` / `paymentAdded` events all
 * remain in the layout, unchanged.
 */
export interface DashboardActions {
  openOrderDialog: () => void
  openPaymentDialog: () => void
}

const DashboardActionsContext = createContext<DashboardActions | null>(null)

export const DashboardActionsProvider = DashboardActionsContext.Provider

/**
 * Returns the layout's dialog openers, or null when rendered outside the
 * dashboard layout. Callers should treat null as "hide the actions" rather than
 * throwing, so primitives stay usable in isolation and in tests.
 */
export function useDashboardActions(): DashboardActions | null {
  return useContext(DashboardActionsContext)
}
