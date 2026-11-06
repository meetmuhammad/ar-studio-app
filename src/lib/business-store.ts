import { ALL_BUSINESSES } from './business-shared'

/**
 * The business the browser is acting on: a businesses.id, ALL_BUSINESSES for
 * the admin combined (read-only) view, or null before one is chosen.
 *
 * A plain module value (not React state) so authFetch can read it for every
 * request without a hook. BusinessProvider owns writes to it. This is a UI
 * selection only: the server re-checks membership on every request.
 */
let active: string | null = null

export function getActiveBusiness(): string | null {
  return active
}

export function setActiveBusiness(value: string | null): void {
  active = value
}

export const isCombinedView = () => active === ALL_BUSINESSES
