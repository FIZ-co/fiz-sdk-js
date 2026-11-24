import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, Fiz, FizApiError, FizNotFoundError } from '../../src/index.js';
import { contractFetch, type ContractFailure } from './contract.js';

/**
 * End to end against the FIZ API sandbox, and a contract test: every
 * response the API sends is validated against the API document
 * (test/sandbox/contract.ts), so a schema that rejects what the API really
 * returns fails here instead of in a client's code.
 *
 * Runs only with a sandbox key (FIZ_TEST_API_KEY=fiz_test_…):
 * `npm run test:sandbox`. Sandbox documents go to the AT test services and
 * have no fiscal effect; a production key is refused before any request.
 */
const apiKey = process.env.FIZ_TEST_API_KEY;
const run = apiKey ? describe : describe.skip;

run('sandbox', () => {
  // describe.skip still runs this body to collect the tests: build the
  // client only when there is a key.
  if (apiKey && !apiKey.startsWith('fiz_test_')) {
    throw new Error('FIZ_TEST_API_KEY must be a sandbox key (fiz_test_…)');
  }
  const baseUrl = process.env.FIZ_BASE_URL ?? DEFAULT_BASE_URL;
  const failures: ContractFailure[] = [];
  const fiz = apiKey
    ? new Fiz({
        apiKey,
        baseUrl,
        fetch: contractFetch(new URL(baseUrl).origin, failures),
        appInfo: { name: 'fiz-sdk-js-ci' },
      })
    : (undefined as unknown as Fiz);
  const tag = `${Date.now()}`;
  const key = (step: string) => `sdk-ci-${tag}-${step}`;
  const state: { customerId?: string; itemId?: string; invoiceId?: string } = {};

  afterAll(() => {
    // Every response of every test above, against the API document.
    expect(failures).toEqual([]);
  });

  it('reaches the sandbox', async () => {
    const company = await fiz.company.retrieve();
    expect(fiz.environment).toBe('sandbox');
    expect(company.environment).toBe('sandbox');
  });

  it('reads the lists', async () => {
    await fiz.invoices.list({ limit: 5 });
    await fiz.customers.list({ limit: 5 });
    await fiz.items.list({ limit: 5 });
    await fiz.proposals.list({ limit: 5 });
    await fiz.recurringInvoices.list({ limit: 5 });
    await fiz.transportDocuments.list({ limit: 5 });
    await fiz.series.list();
    await fiz.templates.list();
  });

  it('creates, updates, prints and issues an invoice', async () => {
    const company = await fiz.company.retrieve();
    const cae = company.cae[0];
    if (!cae) throw new Error('The sandbox company has no CAE');
    const customer = await fiz.customers.create(
      { name: `SDK sandbox customer ${tag}`, country: 'PT' },
      { idempotencyKey: key('customer') },
    );
    const item = await fiz.items.create(
      { name: `SDK sandbox service ${tag}`, type: 'SERVICE', unitPrice: 10, vatRate: 'NORMAL' },
      { idempotencyKey: key('item') },
    );
    state.customerId = customer.id;
    state.itemId = item.id;
    await fiz.customers.retrieve(customer.id);
    await fiz.items.retrieve(item.id);

    const created = await fiz.invoices.create(
      { type: 'INVOICE', cae, customerId: customer.id, items: [{ id: item.id, quantity: 2 }] },
      { idempotencyKey: key('draft') },
    );
    expect(created.number).toBeNull();
    const updated = await fiz.invoices.update(created.id, { notes: 'Updated by the SDK sandbox test' });
    await fiz.invoices.retrieve(created.id);
    const pdf = await fiz.invoices.downloadPdf(created.id);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');

    if (!company.readiness.ready) {
      console.warn('The sandbox company is not ready to issue; issuing skipped.');
      return;
    }
    // A revision is required: issuing without one would skip the check
    // that the draft is the one just updated.
    expect(updated.updatedAt).toBeTruthy();
    const issued = await fiz.invoices.issue(created.id, { expectedUpdatedAt: updated.updatedAt ?? 'missing' });
    expect(issued.number).toBeTruthy();
    expect(issued.atcud).toBeTruthy();
    state.invoiceId = created.id;
    await fiz.invoices.retrieve(created.id);
  });

  it('raises and issues a partial credit note', async () => {
    if (!state.invoiceId || !state.itemId) return;
    const note = await fiz.creditNotes.create(
      {
        parentInvoiceId: state.invoiceId,
        reasonCode: 'RETURN_GOODS_SERVICES',
        items: [{ itemId: state.itemId, quantity: 1 }],
        issue: false,
      },
      { idempotencyKey: key('credit-note') },
    );
    expect(note.number).toBeNull();
    const draft = await fiz.invoices.retrieve(note.id);
    expect(draft.updatedAt).toBeTruthy();
    const issued = await fiz.invoices.issue(note.id, { expectedUpdatedAt: draft.updatedAt ?? 'missing' });
    expect(issued.number).toBeTruthy();
    await fiz.invoices.retrieve(note.id);
  });

  it('answers a missing record with the documented 404', async () => {
    const error = await fiz.invoices.retrieve('000000000000000000000000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FizNotFoundError);
    expect((error as FizApiError).requestId).toBeTruthy();
  });

  it('archives the customer and the item it created', async () => {
    if (state.customerId) await fiz.customers.delete(state.customerId);
    if (state.itemId) await fiz.items.delete(state.itemId);
  });
});
