import { describe, expectTypeOf, it } from 'vitest';
import type { Fiz, Invoice, InvoiceListItem, ApiErrorBody } from '../src/index.js';

// Compile-time checks: these fail `npm run typecheck`, not at runtime.
describe('types follow the API document', () => {
  it('types responses', () => {
    expectTypeOf<Awaited<ReturnType<Fiz['invoices']['retrieve']>>>().toEqualTypeOf<Invoice>();
    expectTypeOf<Awaited<ReturnType<Fiz['invoices']['list']>>>().toEqualTypeOf<InvoiceListItem[]>();
    expectTypeOf<ApiErrorBody['statusCode']>().toEqualTypeOf<number>();
  });

  it('types request bodies', () => {
    type CreateCustomer = Parameters<Fiz['customers']['create']>[0];
    expectTypeOf<{ name: string; country: string }>().toMatchTypeOf<CreateCustomer>();
    // @ts-expect-error — `issue` takes expectedUpdatedAt, not arbitrary fields
    const wrong: Parameters<Fiz['invoices']['issue']>[1] = { notAField: true };
    void wrong;
  });
});
