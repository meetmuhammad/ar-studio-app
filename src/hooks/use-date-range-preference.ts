'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  parseDateRangeSelection,
  selectionToBounds,
  type DateRangeSelection,
} from '@/lib/date-range'
import { getUserPreference, setUserPreference } from '@/lib/user-preferences'

/**
 * A date-range filter remembered per signed-in user (in their Supabase Auth
 * user_metadata, so it survives sign-out and other devices).
 *
 * `ready` is false until the saved value has been read, so callers can hold
 * their queries instead of fetching the default range and then refetching.
 * Presets are stored by name and re-resolved on load: "This Month" saved in
 * October means November's month when opened in November.
 */
export function useDateRangePreference(key: string, fallback: DateRangeSelection) {
  const [selection, setSelectionState] = useState<DateRangeSelection>(fallback)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUserPreference(key)
      .then((saved) => {
        const parsed = parseDateRangeSelection(saved)
        if (!cancelled && parsed) setSelectionState(parsed)
      })
      .catch((error) => console.error(`Failed to load preference ${key}:`, error))
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [key])

  const setSelection = useCallback((next: DateRangeSelection) => {
    setSelectionState(next)
    // Fire and forget: a failed save only means the choice is not remembered.
    setUserPreference(key, next).catch((error) => console.error(`Failed to save preference ${key}:`, error))
  }, [key])

  return { selection, setSelection, ready, ...selectionToBounds(selection) }
}
