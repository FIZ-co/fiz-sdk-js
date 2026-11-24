import { describe, expect, it } from 'vitest';
import { Fiz } from '../../src/index.js';

/**
 * The quickstart, end to end, against the FIZ API sandbox. Runs only with a
 * sandbox key (FIZ_TEST_API_KEY=fiz_test_…): `npm run test:sandbox`.
 * Sandbox documents go to the AT test services and have no fiscal effect;
 * a production key is refused before any request.
 */
const apiKey = process.env.FIZ_TEST_API_KEY;
const run = apiKey ? describe : describe.skip;

run('sandbox walk-through', () => {
  // describe.skip still runs this body to collect the tests: build the
  // client only when there is a key.
  if (apiKey && !apiKey.startsWith('fiz_test_')) {
    throw new Error('FIZ_TEST_API_KEY must be a sandbox key (fiz_test_…)');
  }
  const fiz = apiKey
    ? new Fiz({ apiKey, baseUrl: process.env.FIZ_BASE_URL, appInfo: { name: 'fiz-sdk-js-ci' } })
    : (undefined as unknown as Fiz);
  const run = `${Date.now()}`;

  it('reaches the sandbox', async () => {
    const company = await fiz.company.retrieve();
    expect(fiz.environment).toBe('sandbox');
    expect(company.environment).toBe('sandbox');
  });

  it('creates a customer, an item and a draft, reads its PDF and issues it', async () => {
    const company = await fiz.company.retrieve();
    const customer = await fiz.customers.create(
      { name: `SDK sandbox customer ${run}`, country: 'PT' },
      { idempotencyKey: `sdk-ci-${run}-customer` },
    );
    const item = await fiz.items.create(
      { name: `SDK sandbox service ${run}`, type: 'SERVICE', unitPrice: 10, vatRate: 'NORMAL' },
      { idempotencyKey: `sdk-ci-${run}-item` },
    );
    const created = await fiz.invoices.create(
      {
        type: 'INVOICE',
        cae: company.cae[0] ?? '62010',
        customerId: customer.id,
        items: [{ id: item.id, quantity: 1 }],
      },
      { idempotencyKey: `sdk-ci-${run}-draft` },
    );
    expect(created.number).toBeNull();

    const draft = await fiz.invoices.retrieve(created.id);
    const pdf = await fiz.invoices.downloadPdf(created.id);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');

    if (!company.readiness.ready) {
      console.warn('Sandbox company not ready to issue:', company.readiness.reasons);
      return;
    }
    const issued = await fiz.invoices.issue(created.id, { expectedUpdatedAt: draft.updatedAt });
    expect(issued.number).toBeTruthy();
    expect(issued.atcud).toBeTruthy();
  });
});
