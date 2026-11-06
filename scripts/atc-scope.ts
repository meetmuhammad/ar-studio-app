import { createAdminSupabaseClient } from '../src/lib/supabase'

/** The ATC business scope, for local checks written before multi-business. */
export async function atcScope(): Promise<{ businessIds: string[] }> {
  const { data, error } = await createAdminSupabaseClient()
    .from('businesses').select('id').eq('slug', 'atc').single()
  if (error || !data) throw new Error('ATC business not found: apply the multi-business migration locally')
  return { businessIds: [data.id] }
}
