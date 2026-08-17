/**
 * Read every row a PostgREST query matches, not just the first page.
 *
 * PostgREST caps a response at `db-max-rows` (1000 on this project) and returns
 * the truncated page with a 200 and no error. Every "fetch everything" query in
 * this codebase was therefore correct only while the table stayed small -- the
 * staging ledger has 79 rows, so a truncating export looked perfect. This
 * helper makes the truncation impossible instead of unlikely.
 *
 * Termination is on an *empty* page, not on `page.length < pageSize`. That
 * distinction matters: if the server's cap is ever lower than the page size we
 * ask for, every page comes back short, and a `< pageSize` test would stop
 * after the first one and silently truncate -- the exact bug being fixed. The
 * cost is one extra empty request per call, which is the right price.
 */

/** Matches PostgREST's default `db-max-rows`. Asking for more gains nothing. */
export const DEFAULT_PAGE_SIZE = 1000

/**
 * Refuse to buffer an unbounded result set into memory. A serverless function
 * dying on OOM is a much worse failure than an explicit error, and 200k ledger
 * rows is far beyond anything this business will produce.
 */
export const DEFAULT_MAX_ROWS = 200_000

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

export interface FetchAllRowsOptions {
  /** Rows per request. Must be >= 1 and should not exceed the server cap. */
  pageSize?: number
  /** Throw rather than buffer more than this many rows. */
  maxRows?: number
}

/**
 * @param fetchPage receives an inclusive `[from, to]` row range, exactly as
 *   `PostgrestFilterBuilder.range()` takes it.
 * @returns every matching row, in the order the query returned them.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: FetchAllRowsOptions = {}
): Promise<{ rows: T[]; total: number | null; requests: number }> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE))
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS

  const rows: T[] = []
  let from = 0
  let requests = 0
  let total: number | null = null

  for (;;) {
    const { data, error, count } = await fetchPage(from, from + pageSize - 1)
    requests++

    if (error) throw new Error(error.message)
    if (count !== null && count !== undefined) total = count

    const page = data ?? []
    if (page.length === 0) break

    rows.push(...page)
    if (rows.length > maxRows) {
      throw new Error(
        `Result set exceeds the ${maxRows}-row limit; narrow the filters and retry.`
      )
    }

    from += page.length
  }

  return { rows, total, requests }
}
