import type { FizClient } from '../client.js';
import { FizError } from '../errors.js';

export abstract class Resource {
  constructor(protected readonly client: FizClient) {}
}

/** The link a `pdf` call returned, or an error when the API sent none. */
export function requireUrl(url: string | null | undefined, id: string): string {
  if (!url) throw new FizError(`The API returned no PDF link for ${id}`);
  return url;
}
