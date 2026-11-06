import { supabase } from './supabase-client'

/**
 * Per-user UI preferences, stored in the signed-in user's Supabase Auth
 * `user_metadata.preferences`. Unlike localStorage this survives sign-out,
 * another browser and another device, and needs no table or migration.
 *
 * user_metadata is writable by the user themselves, so it is only for harmless
 * display preferences, never for anything the server trusts.
 */
export type UserPreferences = Record<string, unknown>

export async function getUserPreference(key: string): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession()
  const prefs = session?.user?.user_metadata?.preferences as UserPreferences | undefined
  return prefs?.[key]
}

/**
 * Set one preference key. GoTrue merges user_metadata only at the top level,
 * so the whole `preferences` object is read and rewritten with the key set.
 */
export async function setUserPreference(key: string, value: unknown): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return
  const prefs = (user.user_metadata?.preferences as UserPreferences | undefined) ?? {}
  const { error: updateError } = await supabase.auth.updateUser({
    data: { preferences: { ...prefs, [key]: value } },
  })
  if (updateError) throw updateError
}
