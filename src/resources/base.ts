import type { FizClient } from '../client.js';

export abstract class Resource {
  constructor(protected readonly client: FizClient) {}
}

/** List query without the paging parameters, which `listAll` drives itself. */
export type ListAllQuery<Q> = Omit<Q, 'offset' | 'limit'> & {
  /** Records per request while walking the pages (default 100). */
  pageSize?: number;
};

export const DEFAULT_PAGE_SIZE = 100;
