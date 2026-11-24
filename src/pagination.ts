/** Records per request while `listAll` walks the pages. */
export const DEFAULT_PAGE_SIZE = 100;

/** List query without the paging parameters, which `listAll` drives itself. */
export type ListAllQuery<Q> = Omit<Q, 'offset' | 'limit'> & {
  /** Records per request while walking the pages (default 100). */
  pageSize?: number;
};

/** Same as `ListAllQuery`, for endpoints that number pages from 1. */
export type PagedListAllQuery<Q> = Omit<Q, 'page' | 'pageSize'> & {
  /** Records per request while walking the pages (default 100). */
  pageSize?: number;
};

/**
 * List endpoints answer one page as a plain array. These walk the pages until
 * an empty one: stopping at a short page would be one request cheaper, but a
 * server-side cap below the requested size would then end the walk early and
 * silently drop records.
 */
export async function* paginateByOffset<Q, T>(
  list: (query: Q) => Promise<T[]>,
  query: ListAllQuery<Q>,
): AsyncGenerator<T, void, undefined> {
  const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
  let offset = 0;
  for (;;) {
    const page = await list({ ...filters, offset, limit: pageSize } as Q);
    if (page.length === 0) return;
    yield* page;
    offset += page.length;
  }
}

/** Same as `paginateByOffset`, for endpoints that number pages from 1. */
export async function* paginateByPage<Q, T>(
  list: (query: Q) => Promise<T[]>,
  query: PagedListAllQuery<Q>,
): AsyncGenerator<T, void, undefined> {
  const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
  for (let page = 1; ; page++) {
    const items = await list({ ...filters, page, pageSize } as Q);
    if (items.length === 0) return;
    yield* items;
  }
}
