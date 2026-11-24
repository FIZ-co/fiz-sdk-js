/**
 * The quickstart in two runs, so that what gets issued is the draft you looked at.
 *
 *   FIZ_API_KEY=fiz_test_… npx tsx examples/quickstart.ts
 *     → checks the company, creates a customer, an item and a draft, saves
 *       draft.pdf and prints the draft's id and revision.
 *
 *   FIZ_API_KEY=fiz_test_… npx tsx examples/quickstart.ts --issue <draft id> <revision>
 *     → issues THAT draft at THAT revision (its updatedAt when the PDF was
 *       made): if anyone changed it since, the API refuses instead of issuing
 *       a version you have not seen.
 *
 * With a sandbox key (fiz_test_…) the invoice goes to the AT test services
 * and has no fiscal effect. With a production key, issuing is fiscal and
 * irreversible, so the second run asks you to add --production as well.
 */
import { writeFile } from 'node:fs/promises';
import { Fiz, FizApiError, FizConflictError } from '../src/index.js';

const fiz = new Fiz(); // reads FIZ_API_KEY

async function createDraft() {
  // 1. Which company is this key for, and can it issue yet?
  const company = await fiz.company.retrieve();
  console.log(`${company.name} (${company.environment}), ready to issue: ${company.readiness.ready}`);
  for (const reason of company.readiness.reasons) console.log(`  - ${reason.code}: ${reason.actionUrl}`);
  // Every invoice states one of the company's activity codes (CAE).
  const cae = company.cae[0];
  if (!cae) {
    console.log('The company has no CAE yet: add its activity in FIZ first.');
    return;
  }

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

  // 3. A draft: no number, no fiscal effect. Then its PDF, to look at.
  const draft = await fiz.invoices.create({
    type: 'INVOICE',
    cae,
    customerId: customer.id,
    items: [{ id: item.id, quantity: 1 }],
  });
  await writeFile('draft.pdf', Buffer.from(await fiz.invoices.downloadPdf(draft.id)));
  console.log(`Draft ${draft.id} saved to draft.pdf. Look at it, then issue it with:`);
  console.log(`  npx tsx examples/quickstart.ts --issue ${draft.id} ${draft.updatedAt}`);
}

async function issueDraft(id: string, revision: string) {
  if (!id || !revision) {
    console.log('Usage: --issue <draft id> <revision>, as the first run printed them.');
    return;
  }
  if (fiz.environment === 'production' && !process.argv.includes('--production')) {
    console.log('This is a production key: issuing reports a real invoice to the AT.');
    console.log(`Add --production to issue draft ${id}.`);
    return;
  }
  // 4. Issue the draft at the revision you looked at: numbered, ATCUD and QR
  //    code, reported to the AT. Not re-read here on purpose: the revision
  //    from the first run is what makes a later change refuse the issue.
  try {
    const issued = await fiz.invoices.issue(id, { expectedUpdatedAt: revision });
    console.log(`Issued ${issued.number}, ATCUD ${issued.atcud}`);
  } catch (error) {
    if (error instanceof FizConflictError && error.code === 'INVOICE_DRAFT_MODIFIED') {
      console.log('The draft changed after its PDF was made, so it was not issued. Run the first step again.');
      return;
    }
    throw error;
  }
}

const issueAt = process.argv.indexOf('--issue');
const run =
  issueAt === -1
    ? createDraft()
    : issueDraft(process.argv[issueAt + 1] ?? '', process.argv[issueAt + 2] ?? '');

run.catch((error: unknown) => {
  if (error instanceof FizApiError) {
    console.error(`${error.status} ${error.code ?? ''}: ${error.messages.join('; ')}`);
    console.error(`Request id for support: ${error.requestId}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
