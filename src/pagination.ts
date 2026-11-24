/**
 * List endpoints answer one page as a plain array. These walk the pages until
 * an empty one: stopping at a short page would be one request cheaper, but a
 * server-side cap below the requested size would then end the walk early and
 * silently drop records.
 */
export async function* paginateByOffset<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  options: { offset?: number; limit: number },
): AsyncGenerator<T, void, undefined> {
  let offset = options.offset ?? 0;
  for (;;) {
    const page = await fetchPage(offset, options.limit);
    if (page.length === 0) return;
    yield* page;
    offset += page.length;
  }
}

/** Same as `paginateByOffset`, for endpoints that number pages from 1. */
export async function* paginateByPage<T>(
  fetchPage: (page: number, pageSize: number) => Promise<T[]>,
  options: { page?: number; pageSize: number },
): AsyncGenerator<T, void, undefined> {
  let page = options.page ?? 1;
  for (;;) {
    const items = await fetchPage(page, options.pageSize);
    if (items.length === 0) return;
    yield* items;
    page += 1;
  }
}
