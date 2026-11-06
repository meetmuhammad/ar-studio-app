'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { ALL_BUSINESSES, type Business, type MyBusinessesResponse } from '@/lib/business-shared'
import { setActiveBusiness } from '@/lib/business-store'
import { getUserPreference, setUserPreference } from '@/lib/user-preferences'

/**
 * Which business the dashboard shows, and the switcher's options.
 *
 * - Options are the caller's memberships only (GET /api/me/businesses): staff
 *   see Ahsan Tariq Couture, admins see ATC and Techlink Co.
 * - The last choice is remembered in user_metadata.preferences (via
 *   src/lib/user-preferences.ts). It is a convenience only; the server checks
 *   membership on every request regardless of what the browser sends.
 * - Switching cancels in-flight queries, drops the whole React Query cache and
 *   remounts the page (see `generation`), so nothing from the previous
 *   business can linger on screen -- including pages that fetch with plain
 *   useEffect rather than React Query.
 * - "All businesses" (admins with more than one) is the read-only combined
 *   view: authFetch refuses writes while it is selected.
 */

const PREF_KEY = 'activeBusinessId'

interface BusinessContextValue {
  businesses: Business[]
  /** The selected business; null while loading or in the combined view. */
  business: Business | null
  /** True in the admin combined (read-only) view. */
  isAll: boolean
  canViewAll: boolean
  ready: boolean
  /** No membership at all: nothing can be shown. */
  noAccess: boolean
  /** Bumped on every switch; used as a React key to remount the page. */
  generation: number
  switchBusiness: (id: string) => Promise<void>
}

const BusinessContext = createContext<BusinessContextValue | null>(null)

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  // Keyed on the id, not the user object: saving the preference below fires
  // Supabase's USER_UPDATED, which hands out a new user object. Re-running on
  // that would briefly clear the selection, and requests made in that window
  // carry no header -- which the server answers with ATC data.
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const [data, setData] = useState<MyBusinessesResponse | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) {
      setActiveBusiness(null)
      setData(null)
      setActive(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        // Runs once per signed-in user. Nothing is selected yet, so this call
        // carries no header (the endpoint does not need one).
        setActiveBusiness(null)
        const res = await authFetch('/api/me/businesses')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as MyBusinessesResponse
        const remembered = await getUserPreference(PREF_KEY).catch(() => undefined)

        const choice: string | null =
          remembered === ALL_BUSINESSES && body.canViewAll
            ? ALL_BUSINESSES
            : body.businesses.find((b) => b.id === remembered)?.id ??
              body.defaultBusinessId ??
              body.businesses[0]?.id ??
              null

        if (cancelled) return
        setActiveBusiness(choice)
        setData(body)
        setActive(choice)
      } catch (error) {
        console.error('Failed to load businesses:', error)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const switchBusiness = useCallback(
    async (id: string) => {
      if (!data || id === active) return
      const allowed = id === ALL_BUSINESSES ? data.canViewAll : data.businesses.some((b) => b.id === id)
      if (!allowed) return

      await queryClient.cancelQueries()
      setActiveBusiness(id)
      queryClient.clear()
      setActive(id)
      setGeneration((g) => g + 1)
      setUserPreference(PREF_KEY, id).catch((error) => console.error('Failed to save business preference:', error))
    },
    [active, data, queryClient]
  )

  const value = useMemo<BusinessContextValue>(() => {
    const businesses = data?.businesses ?? []
    const isAll = active === ALL_BUSINESSES
    return {
      businesses,
      business: isAll ? null : businesses.find((b) => b.id === active) ?? null,
      isAll,
      canViewAll: !!data?.canViewAll,
      ready: !!data && (active !== null || businesses.length === 0),
      noAccess: failed || (!!data && businesses.length === 0),
      generation,
      switchBusiness,
    }
  }, [active, data, failed, generation, switchBusiness])

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness must be used inside BusinessProvider')
  return ctx
}

/** Display name for page headers: the business, or "All businesses". */
export function useBusinessLabel(): string {
  const { business, isAll } = useBusiness()
  return isAll ? 'All businesses' : business?.name ?? ''
}
