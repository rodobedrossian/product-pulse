/**
 * Supabase/PostgREST returns at most 1000 rows per request unless you paginate.
 * Call `rangeQuery(from, to)` with inclusive bounds; it must end with `.range(from, to)`.
 */
export async function fetchAllPages(rangeQuery, { pageSize = 1000 } = {}) {
  const rows = []
  let from = 0
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await rangeQuery(from, to)
    if (error) return { data: null, error }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return { data: rows, error: null }
}
