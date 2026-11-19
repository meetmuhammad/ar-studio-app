/**
 * Read every page of a PostgREST query. One response is capped (1,000 rows by
 * default on Supabase), so a single read of a list that can grow past that
 * silently drops rows. Use this only where a full row list is genuinely needed
 * (exports, legacy "return everything" endpoints); totals belong in SQL.
 *
 * `build(from, to)` must apply a TOTAL order (end with a unique column such as
 * id), so pages neither skip nor repeat rows.
 */
export const READ_ALL_PAGE = 1000

export async function readAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += READ_ALL_PAGE) {
    const { data, error } = await build(from, from + READ_ALL_PAGE - 1)
    if (error) throw new Error(`Failed to read ${label}: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < READ_ALL_PAGE) return out
  }
}
