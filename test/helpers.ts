import { vi } from 'vitest';
import { Fiz } from '../src/index.js';

export interface Recorded {
  redirect: RequestRedirect | undefined;
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

type Reply =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | Error
  | (() => Response);

/** A Fiz client whose fetch answers from `replies` in order and records every request. */
export function mockFiz(replies: Reply[], options: ConstructorParameters<typeof Fiz>[0] = {}) {
  const requests: Recorded[] = [];
  const queue = [...replies];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      redirect: init?.redirect,
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    });
    const reply = queue.shift();
    if (!reply) throw new Error('No reply queued for this request');
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply();
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  });
  const fiz = new Fiz({ apiKey: 'fiz_live_key', fetch, ...options });
  // Files on another origin go through the global fetch: answered by the same
  // queue, so a test reads every request in order.
  setFileFetch(fiz, fetch);
  return { fiz, fetch, requests };
}

/** Replaces the fetch a Fiz client downloads files on another origin with. */
export function setFileFetch(fiz: Fiz, fetch: typeof globalThis.fetch): void {
  (fiz as unknown as { client: { fileFetch: typeof globalThis.fetch } }).client.fileFetch = fetch;
}
