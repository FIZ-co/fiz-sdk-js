import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Fiz,
  FizApiError,
  FizAuthenticationError,
  FizBadRequestError,
  FizConflictError,
  FizConnectionError,
  FizError,
  FizNotFoundError,
  FizRateLimitError,
  FizServerError,
  FizTimeoutError,
} from '../src/index.js';
import { mockFiz } from './helpers.js';

const customer = { name: 'Example customer', country: 'PT' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('credentials', () => {
  it('sends the API key as x-api-key', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }]);
    await fiz.company.retrieve();
    expect(requests[0]!.headers['x-api-key']).toBe('fiz_live_key');
    expect(requests[0]!.headers.authorization).toBeUndefined();
    expect(requests[0]!.url.href).toBe('https://api.fiz.co/company');
  });

  it('sends an access token as a bearer token', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }], {
      apiKey: undefined,
      accessToken: 'fiz_oat_token',
    });
    await fiz.company.retrieve();
    expect(requests[0]!.headers.authorization).toBe('Bearer fiz_oat_token');
    expect(requests[0]!.headers['x-api-key']).toBeUndefined();
  });

  it('reads FIZ_API_KEY when no credential is passed', async () => {
    vi.stubEnv('FIZ_API_KEY', 'fiz_test_from_env');
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }], { apiKey: undefined });
    await fiz.company.retrieve();
    expect(requests[0]!.headers['x-api-key']).toBe('fiz_test_from_env');
    expect(fiz.environment).toBe('sandbox');
  });

  it.each(['', '   '])('refuses a blank OAuth token even with an environment key', (accessToken) => {
    vi.stubEnv('FIZ_API_KEY', 'fiz_test_from_env');
    const fetch = vi.fn();
    expect(() => new Fiz({ accessToken, fetch })).toThrow(/accessToken/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses both credentials, and none', () => {
    vi.stubEnv('FIZ_API_KEY', '');
    expect(() => new Fiz({ apiKey: 'a', accessToken: 'b', fetch })).toThrow(FizError);
    expect(() => new Fiz({ fetch })).toThrow(/FIZ_API_KEY/);
  });

  it('refuses to run in a browser unless explicitly allowed', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    try {
      expect(() => new Fiz({ apiKey: 'fiz_live_x', fetch })).toThrow(/for servers/);
      expect(() => new Fiz({ accessToken: 'fiz_oat_x', fetch })).toThrow(/for servers/);
      expect(new Fiz({ apiKey: 'fiz_live_x', fetch, dangerouslyAllowBrowser: true }).environment).toBe(
        'production',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports the environment from the key prefix', () => {
    expect(new Fiz({ apiKey: 'fiz_test_x', fetch }).environment).toBe('sandbox');
    expect(new Fiz({ apiKey: 'fiz_live_x', fetch }).environment).toBe('production');
    expect(new Fiz({ accessToken: 'fiz_oat_x', fetch }).environment).toBe('production');
  });

  it('identifies itself and the integration in the User-Agent', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }], {
      appInfo: { name: 'acme-shop', version: '2.1.0' },
    });
    await fiz.company.retrieve();
    expect(requests[0]!.headers['user-agent']).toMatch(/^fiz-sdk-js\/\d+\.\d+\.\d+ node\/\S+ acme-shop\/2\.1\.0$/);
  });
});

describe('requests', () => {
  it('expands path parameters and encodes them', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }]);
    await fiz.invoices.retrieve('a/b');
    expect(requests[0]!.url.pathname).toBe('/invoices/a%2Fb');
  });

  it('serialises query parameters, repeating arrays and skipping undefined', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: [] }]);
    await fiz.bank.transactions({
      connectionId: 'c1',
      types: ['INCOME', 'EXPENSE'] as never,
      searchString: undefined,
    });
    const query = requests[0]!.url.searchParams;
    expect(query.getAll('types')).toEqual(['INCOME', 'EXPENSE']);
    expect(query.get('connectionId')).toBe('c1');
    expect(query.has('searchString')).toBe(false);
  });

  it('sends a JSON body', async () => {
    const { fiz, requests } = mockFiz([{ status: 201, body: { id: 'c1' } }]);
    const created = await fiz.customers.create(customer);
    expect(created).toEqual({ id: 'c1' });
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.headers['content-type']).toBe('application/json');
    expect(requests[0]!.body).toEqual(customer);
  });

  it('uses another base URL', async () => {
    const { fiz, requests } = mockFiz([{ status: 200, body: {} }], { baseUrl: 'http://localhost:8080/' });
    await fiz.company.retrieve();
    expect(requests[0]!.url.href).toBe('http://localhost:8080/company');
  });
});

describe('Idempotency-Key', () => {
  it('is generated for a write', async () => {
    const { fiz, requests } = mockFiz([{ status: 201, body: {} }]);
    await fiz.customers.create(customer);
    expect(requests[0]!.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is the caller’s when given', async () => {
    const { fiz, requests } = mockFiz([{ status: 201, body: {} }]);
    await fiz.customers.create(customer, { idempotencyKey: 'order-1042-customer' });
    expect(requests[0]!.headers['idempotency-key']).toBe('order-1042-customer');
  });

  it('takes a caller’s Idempotency-Key header, in any case, as the key', async () => {
    const { fiz, requests } = mockFiz([{ status: 201, body: {} }]);
    await fiz.customers.create(customer, { headers: { 'Idempotency-Key': 'order-7' } });
    expect(requests[0]!.headers['idempotency-key']).toBe('order-7');
  });

  it.each([
    ['an empty option', { idempotencyKey: '' }],
    ['a blank header', { headers: { 'Idempotency-Key': '   ' } }],
    ['a key with a space', { idempotencyKey: 'order 7' }],
    ['a key over 128 characters', { idempotencyKey: 'k'.repeat(129) }],
  ])('refuses %s before sending anything', async (_label, options) => {
    const { fiz, requests } = mockFiz([{ status: 201, body: {} }]);
    await expect(fiz.customers.create(customer, options)).rejects.toThrow(/idempotencyKey/);
    expect(requests).toHaveLength(0);
  });

  it('is not sent on a read, nor on an operation that does not take one', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: [] },
      { status: 200, body: {} },
    ]);
    await fiz.invoices.list();
    await fiz.templates.validate({} as never);
    expect(requests.map((r) => r.headers['idempotency-key'])).toEqual([undefined, undefined]);
  });
});

describe('errors', () => {
  it('carries status, code, messages and the request id', async () => {
    const { fiz } = mockFiz([
      {
        status: 404,
        body: { statusCode: 404, message: 'Invoice not found', code: 'ENTITY_NOT_FOUND' },
        headers: { 'x-request-id': 'req-1' },
      },
    ]);
    const error = await fiz.invoices.retrieve('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizNotFoundError);
    expect(error).toBeInstanceOf(FizApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'ENTITY_NOT_FOUND',
      messages: ['Invoice not found'],
      requestId: 'req-1',
    });
    expect((error as Error).message).toBe('GET /invoices/x failed with 404: Invoice not found');
  });

  it('lists every validation message', async () => {
    const { fiz } = mockFiz([
      {
        status: 400,
        body: { statusCode: 400, message: ['name must be a string', 'property x should not exist'], error: 'Bad Request' },
      },
    ]);
    const error = await fiz.customers.create(customer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizBadRequestError);
    expect((error as FizApiError).messages).toHaveLength(2);
    expect((error as FizApiError).code).toBeUndefined();
    expect((error as FizApiError).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps 401 and 5xx', async () => {
    const { fiz } = mockFiz([
      { status: 401, body: { statusCode: 401, message: 'API key is missing' } },
      { status: 500, body: { statusCode: 500, message: 'boom' } },
    ]);
    await expect(fiz.company.retrieve()).rejects.toBeInstanceOf(FizAuthenticationError);
    await expect(fiz.customers.create(customer)).rejects.toBeInstanceOf(FizServerError);
  });
});

describe('retries', () => {
  it('retries a 429 after Retry-After', async () => {
    vi.useFakeTimers();
    const { fiz, requests } = mockFiz([
      { status: 429, body: { statusCode: 429, message: 'slow down' }, headers: { 'retry-after': '2' } },
      { status: 201, body: { id: 'c1' } },
    ]);
    const result = fiz.customers.create(customer);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ id: 'c1' });
    expect(requests[1]!.headers['idempotency-key']).toBe(requests[0]!.headers['idempotency-key']);
  });

  it('does not wait out a Retry-After longer than a minute', async () => {
    const { fiz, requests } = mockFiz([
      { status: 429, body: { statusCode: 429, message: 'slow down' }, headers: { 'retry-after': '3600' } },
    ]);
    await expect(fiz.company.retrieve()).rejects.toBeInstanceOf(FizRateLimitError);
    expect(requests).toHaveLength(1);
  });

  it('reports a timeout, after retrying it', async () => {
    vi.useFakeTimers();
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const { fiz, requests } = mockFiz([timeout, timeout, timeout]);
    const result = fiz.customers.create(customer, { idempotencyKey: 'k1' }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const error = await result;
    expect(error).toBeInstanceOf(FizTimeoutError);
    expect(error).toMatchObject({ idempotencyKey: 'k1' });
    expect(requests).toHaveLength(3);
  });

  it('throws the conflict when a write is still in progress after every retry', async () => {
    vi.useFakeTimers();
    const busy = { status: 409, body: { statusCode: 409, message: 'still being processed' }, headers: { 'retry-after': '1' } };
    const { fiz, requests } = mockFiz([busy, busy, busy]);
    const result = fiz.invoices.issue('inv1').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(FizConflictError);
    expect(requests).toHaveLength(3);
  });

  it('gives up after maxRetries', async () => {
    const limited = { status: 429, body: { statusCode: 429, message: 'slow down' }, headers: { 'retry-after': '0' } };
    const { fiz, requests } = mockFiz([limited, limited, limited]);
    await expect(fiz.company.retrieve()).rejects.toBeInstanceOf(FizRateLimitError);
    expect(requests).toHaveLength(3);
  });

  it('repeats a write that got no response with the SAME key', async () => {
    vi.useFakeTimers();
    const { fiz, requests } = mockFiz([new TypeError('fetch failed'), { status: 201, body: { id: 'c1' } }]);
    const result = fiz.customers.create(customer);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 'c1' });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.headers['idempotency-key']).toBe(requests[0]!.headers['idempotency-key']);
  });

  it('waits for a write still in progress (409 with Retry-After)', async () => {
    vi.useFakeTimers();
    const { fiz, requests } = mockFiz([
      { status: 409, body: { statusCode: 409, message: 'still being processed' }, headers: { 'retry-after': '1' } },
      { status: 200, body: { id: 'inv1', number: 'FT 2026/1' }, headers: { 'idempotent-replayed': 'true' } },
    ]);
    const result = fiz.invoices.issue('inv1', { expectedUpdatedAt: '2026-11-24T10:00:00.000Z' });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ number: 'FT 2026/1' });
    expect(requests).toHaveLength(2);
  });

  it('repeats a write whose response body was cut off, with the SAME key', async () => {
    vi.useFakeTimers();
    const cutOff = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    const { fiz, requests } = mockFiz([cutOff, { status: 201, body: { id: 'c1' } }]);
    const result = fiz.customers.create(customer, { idempotencyKey: 'order-9' });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 'c1' });
    expect(requests.map((r) => r.headers['idempotency-key'])).toEqual(['order-9', 'order-9']);
  });

  it('repeats an issue whose JSON body arrived broken, with the SAME key', async () => {
    vi.useFakeTimers();
    const broken = () =>
      new Response('{"number":', { status: 200, headers: { 'content-type': 'application/json' } });
    const { fiz, requests } = mockFiz([broken, { status: 200, body: { id: 'inv1', number: 'FT 2026/1' } }]);
    const result = fiz.invoices.issue('inv1', {}, { idempotencyKey: 'issue-1' });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ number: 'FT 2026/1' });
    expect(requests.map((r) => r.headers['idempotency-key'])).toEqual(['issue-1', 'issue-1']);
  });

  it.each([
    ['broken JSON', '{"number":'],
    ['an empty body announced as JSON', ''],
  ])('never returns a success with %s: it raises with the key', async (_label, text) => {
    const broken = () => new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
    const { fiz } = mockFiz([broken], { maxRetries: 0 });
    const error = await fiz.invoices.issue('inv1', {}, { idempotencyKey: 'issue-1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizConnectionError);
    expect(error).toMatchObject({ idempotencyKey: 'issue-1' });
  });

  it('parses a success as JSON whatever the Content-Type spelling', async () => {
    const reply = () =>
      new Response('{"id":"inv1","number":"FT 2026/1"}', {
        status: 200,
        headers: { 'content-type': 'Application/JSON; charset=UTF-8' },
      });
    const { fiz } = mockFiz([reply]);
    await expect(fiz.invoices.issue('inv1')).resolves.toMatchObject({ number: 'FT 2026/1' });
  });

  it('never returns an HTML page as a success', async () => {
    const html = () =>
      new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const { fiz } = mockFiz([html], { maxRetries: 0 });
    const error = await fiz.invoices.issue('inv1', {}, { idempotencyKey: 'issue-1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizConnectionError);
    expect(error).toMatchObject({ idempotencyKey: 'issue-1' });
  });

  it('keeps a broken error body as text and lets the status decide', async () => {
    const broken = () =>
      new Response('upstream <html> error', { status: 400, headers: { 'content-type': 'application/json' } });
    const { fiz, requests } = mockFiz([broken]);
    const error = await fiz.customers.create(customer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizBadRequestError);
    expect(error).toMatchObject({ messages: ['upstream <html> error'] });
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['a 503 on a write', 503, {}, 1],
    ['a 429 with a Retry-After longer than a minute', 429, { 'retry-after': '120' }, 1],
  ])('keeps the status rules when the body of %s is cut off', async (_label, status, extra, calls) => {
    const cutOff = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status, headers: { 'content-type': 'application/json', ...extra } },
      );
    const { fiz, requests } = mockFiz([cutOff, { status: 201, body: { id: 'c1' } }]);
    const error = await fiz.customers.create(customer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizApiError);
    expect(error).toMatchObject({ status });
    expect(requests).toHaveLength(calls);
  });

  it('waits out the Retry-After of a 429 whose body is cut off', async () => {
    vi.useFakeTimers();
    const cutOff = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status: 429, headers: { 'retry-after': '2' } },
      );
    const { fiz, requests } = mockFiz([cutOff, { status: 201, body: { id: 'c1' } }]);
    const result = fiz.customers.create(customer);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ id: 'c1' });
  });

  it('reports a cut-off body with the key when it cannot retry', async () => {
    const cutOff = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    const { fiz } = mockFiz([cutOff], { maxRetries: 0 });
    const error = await fiz.customers.create(customer, { idempotencyKey: 'order-9' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizConnectionError);
    expect(error).toMatchObject({ idempotencyKey: 'order-9' });
  });

  it('does not retry a 409 whose outcome is unknown', async () => {
    const { fiz, requests } = mockFiz([
      { status: 409, body: { statusCode: 409, message: 'may have taken effect' } },
    ]);
    await expect(fiz.invoices.issue('inv1')).rejects.toBeInstanceOf(FizConflictError);
    expect(requests).toHaveLength(1);
  });

  it('retries a 503 on a read but not on a write', async () => {
    vi.useFakeTimers();
    const unavailable = { status: 503, body: { statusCode: 503, message: 'unavailable' } };
    const { fiz, requests } = mockFiz([unavailable, { status: 200, body: {} }, unavailable]);
    const read = fiz.company.retrieve();
    await vi.runAllTimersAsync();
    await expect(read).resolves.toEqual({});
    await expect(fiz.customers.create(customer)).rejects.toBeInstanceOf(FizServerError);
    expect(requests).toHaveLength(3);
  });

  it('does not repeat a non-idempotent POST that got no response', async () => {
    const { fiz, requests } = mockFiz([new TypeError('fetch failed')]);
    await expect(fiz.vat.calculate({} as never)).rejects.toBeInstanceOf(FizConnectionError);
    expect(requests).toHaveLength(1);
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const { fiz } = mockFiz([
      { status: 429, body: { statusCode: 429, message: 'slow' }, headers: { 'retry-after': '30' } },
    ]);
    const result = fiz.company.retrieve({ signal: controller.signal });
    setTimeout(() => controller.abort(new Error('cancelled')), 10);
    await expect(result).rejects.toThrow('cancelled');
  });
});

describe('pagination', () => {
  it('walks the pages until an empty one', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: [{ id: '1' }, { id: '2' }] },
      { status: 200, body: [{ id: '3' }] },
      { status: 200, body: [] },
    ]);
    const ids: string[] = [];
    for await (const invoice of fiz.invoices.listAll({ status: 'ISSUED' as never, pageSize: 2 })) {
      ids.push(invoice.id!);
    }
    expect(ids).toEqual(['1', '2', '3']);
    expect(requests.map((r) => [r.url.searchParams.get('offset'), r.url.searchParams.get('limit')])).toEqual([
      ['0', '2'],
      ['2', '2'],
      ['3', '2'],
    ]);
    expect(requests.every((r) => r.url.searchParams.get('status') === 'ISSUED')).toBe(true);
  });

  it('walks numbered pages for bank transactions', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: [{ id: 't1' }] },
      { status: 200, body: [] },
    ]);
    const all = [];
    for await (const t of fiz.bank.transactionsAll({ connectionId: 'c1', pageSize: 1 })) all.push(t);
    expect(all).toHaveLength(1);
    expect(requests.map((r) => r.url.searchParams.get('page'))).toEqual(['1', '2']);
  });
});

describe('onResponse', () => {
  it('reports every response, retries included', async () => {
    vi.useFakeTimers();
    const seen: unknown[] = [];
    const { fiz } = mockFiz(
      [
        { status: 429, body: { statusCode: 429, message: 'slow' }, headers: { 'retry-after': '1', 'x-request-id': 'r1' } },
        { status: 200, body: { id: 'inv1' }, headers: { 'x-request-id': 'r2', 'idempotent-replayed': 'true' } },
      ],
      { onResponse: (info) => seen.push(info) },
    );
    const result = fiz.invoices.issue('inv1', {}, { idempotencyKey: 'issue-1' });
    await vi.runAllTimersAsync();
    await result;
    expect(seen).toEqual([
      expect.objectContaining({
        operationId: 'InvoicesController_issue',
        method: 'POST',
        path: '/invoices/{id}/issue',
        status: 429,
        requestId: 'r1',
        idempotencyKey: 'issue-1',
        replayed: false,
        attempt: 1,
      }),
      expect.objectContaining({ status: 200, requestId: 'r2', replayed: true, attempt: 2 }),
    ]);
  });

  it('never fails the call, nor leaves a rejection, when an async hook rejects', async () => {
    const { fiz } = mockFiz([{ status: 200, body: { id: 'inv1' } }], {
      onResponse: async () => {
        throw new Error('logger down');
      },
    });
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      await expect(fiz.invoices.issue('inv1')).resolves.toEqual({ id: 'inv1' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('does not wait for an async hook', async () => {
    let finished = false;
    const { fiz } = mockFiz([{ status: 200, body: {} }], {
      onResponse: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 50),
        ),
    });
    await fiz.company.retrieve();
    expect(finished).toBe(false);
  });

  it('never fails the call when the hook throws', async () => {
    const { fiz } = mockFiz([{ status: 200, body: {} }], {
      onResponse: () => {
        throw new Error('logger down');
      },
    });
    await expect(fiz.company.retrieve()).resolves.toEqual({});
  });
});

describe('redirects', () => {
  it('are never followed on an API call', async () => {
    const { fiz, requests } = mockFiz([
      { status: 302, headers: { location: 'https://elsewhere.example.com/company' } },
    ]);
    await expect(fiz.company.retrieve()).rejects.toThrow(/redirect to https:\/\/elsewhere/);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.redirect).toBe('manual');
  });
});

describe('PDF download', () => {
  it('sends credentials to a link on the API origin only', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: { id: 'f1', name: 'FT.pdf', url: 'https://api.fiz.co/files/FT.pdf' } },
      { status: 200, body: 'pdf-bytes' },
    ]);
    await fiz.invoices.downloadPdf('inv1');
    expect(requests[1]!.headers['x-api-key']).toBe('fiz_live_key');
  });

  it('drops the credentials when a redirect leaves the API origin', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: { id: 'f1', name: 'FT.pdf', url: 'https://api.fiz.co/files/FT.pdf' } },
      { status: 302, headers: { location: 'https://storage.example.com/FT.pdf?sig=1' } },
      { status: 200, body: 'pdf-bytes' },
    ]);
    await fiz.invoices.downloadPdf('inv1');
    expect(requests.map((r) => [r.url.host, r.headers['x-api-key'] ?? null, r.redirect])).toEqual([
      ['api.fiz.co', 'fiz_live_key', 'manual'],
      ['api.fiz.co', 'fiz_live_key', 'manual'],
      ['storage.example.com', null, 'manual'],
    ]);
  });

  it('stops after five redirects', async () => {
    const hop = { status: 302, headers: { location: 'https://storage.example.com/next' } };
    const { fiz } = mockFiz([
      { status: 200, body: { id: 'f1', name: 'FT.pdf', url: 'https://storage.example.com/FT.pdf' } },
      hop, hop, hop, hop, hop, hop,
    ]);
    await expect(fiz.invoices.downloadPdf('inv1')).rejects.toThrow(/more than 5 redirects/);
  });

  it('raises a FizError when the API gives no link', async () => {
    const { fiz } = mockFiz([{ status: 200, body: { id: 'f1', name: null, url: null } }]);
    await expect(fiz.invoices.downloadPdf('inv1')).rejects.toBeInstanceOf(FizError);
  });

  it('fetches a foreign link without credentials', async () => {
    const { fiz, requests } = mockFiz([
      { status: 200, body: { id: 'f1', name: 'FT.pdf', url: 'https://files.example.com/FT.pdf?sig=1' } },
      { status: 200, body: 'pdf-bytes' },
    ]);
    const bytes = await fiz.invoices.downloadPdf('inv1');
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(requests[1]!.url.host).toBe('files.example.com');
    expect(requests[1]!.headers['x-api-key']).toBeUndefined();
  });
});
