/**
 * The quickstart: company check → customer and item → draft and PDF → issue.
 *
 *   FIZ_API_KEY=fiz_test_… npx tsx examples/quickstart.ts
 *
 * With a sandbox key (fiz_test_…) the invoice goes to the AT test services
 * and has no fiscal effect. With a production key, issuing is a fiscal act:
 * this script stops before it unless you pass --issue.
 */
import { writeFile } from 'node:fs/promises';
import { Fiz, FizApiError } from '../src/index.js';

const fiz = new Fiz(); // reads FIZ_API_KEY

async function main() {
  // 1. Which company is this key for, and can it issue yet?
  const company = await fiz.company.retrieve();
  console.log(`${company.name} (${company.environment}), ready to issue: ${company.readiness.ready}`);
  for (const reason of company.readiness.reasons) console.log(`  - ${reason.code}: ${reason.actionUrl}`);

  // 2. A customer and an item. A fixed Idempotency-Key per record makes a
  //    re-run return the same records instead of creating new ones.
  const customer = await fiz.customers.create(
    { name: 'Example customer', country: 'PT' },
    { idempotencyKey: 'quickstart-customer' },
  );
  const item = await fiz.items.create(
    { name: 'Example service', type: 'SERVICE', unitPrice: 10, vatRate: 'NORMAL' },
    { idempotencyKey: 'quickstart-item' },
  );

  // 3. A draft: no number, no fiscal effect. Then its PDF.
  const created = await fiz.invoices.create({
    type: 'INVOICE',
    cae: company.cae[0] ?? '62010',
    customerId: customer.id,
    items: [{ id: item.id, quantity: 1 }],
  });
  const draft = await fiz.invoices.retrieve(created.id);
  await writeFile('draft.pdf', Buffer.from(await fiz.invoices.downloadPdf(created.id)));
  console.log(`Draft ${created.id} saved to draft.pdf`);

  // 4. Issue: numbered, ATCUD and QR code, reported to the AT.
  if (fiz.environment === 'production' && !process.argv.includes('--issue')) {
    console.log('Production key: not issuing. Re-run with --issue to issue this draft.');
    return;
  }
  if (!company.readiness.ready) return;
  const issued = await fiz.invoices.issue(created.id, { expectedUpdatedAt: draft.updatedAt });
  console.log(`Issued ${issued.number}, ATCUD ${issued.atcud}`);
}

main().catch((error: unknown) => {
  if (error instanceof FizApiError) {
    console.error(`${error.status} ${error.code ?? ''}: ${error.messages.join('; ')}`);
    console.error(`Request id for support: ${error.requestId}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
