import { FizClient, type CallArgs, type FizOptions } from './client.js';
import type { OperationId } from './generated/operations.js';
import { Bank, Company as CompanyResource, Exports, Expenses, Vat } from './resources/account.js';
import { Customers, Items, Series, Templates } from './resources/catalog.js';
import { Proposals, TransportDocuments } from './resources/documents.js';
import { CreditNotes, Invoices, RecurringInvoices } from './resources/invoices.js';
import type { RequestOptions, ResponseBody, Schemas } from './types.js';

/**
 * Client for the FIZ API: certified invoicing in Portugal.
 *
 * ```ts
 * const fiz = new Fiz(); // reads FIZ_API_KEY
 * const draft = await fiz.invoices.create({ type: 'INVOICE', customerId, items });
 * ```
 */
export class Fiz {
  readonly invoices: Invoices;
  readonly creditNotes: CreditNotes;
  readonly recurringInvoices: RecurringInvoices;
  readonly proposals: Proposals;
  readonly transportDocuments: TransportDocuments;
  readonly customers: Customers;
  readonly items: Items;
  readonly series: Series;
  readonly templates: Templates;
  readonly company: CompanyResource;
  readonly vat: Vat;
  readonly expenses: Expenses;
  readonly bank: Bank;
  readonly exports: Exports;
  private readonly client: FizClient;

  constructor(options?: FizOptions) {
    this.client = new FizClient(options);
    this.invoices = new Invoices(this.client);
    this.creditNotes = new CreditNotes(this.client);
    this.recurringInvoices = new RecurringInvoices(this.client);
    this.proposals = new Proposals(this.client);
    this.transportDocuments = new TransportDocuments(this.client);
    this.customers = new Customers(this.client);
    this.items = new Items(this.client);
    this.series = new Series(this.client);
    this.templates = new Templates(this.client);
    this.company = new CompanyResource(this.client);
    this.vat = new Vat(this.client);
    this.expenses = new Expenses(this.client);
    this.bank = new Bank(this.client);
    this.exports = new Exports(this.client);
  }

  /** `sandbox` when the key starts with `fiz_test_` (no fiscal effect). */
  get environment(): 'production' | 'sandbox' {
    return this.client.environment;
  }

  /** Calls any operation by its OpenAPI `operationId`, typed from the spec. */
  call<K extends OperationId>(
    operationId: K,
    args?: CallArgs<K>,
    options?: RequestOptions,
  ): Promise<ResponseBody<K>> {
    return this.client.call(operationId, args, options);
  }
}

export { FizClient, DEFAULT_BASE_URL } from './client.js';
export type { CallArgs, FizOptions, FizResponseInfo } from './client.js';
export * from './errors.js';
export { OPERATIONS, API_VERSION } from './generated/operations.js';
export type { OperationId } from './generated/operations.js';
export type { components, operations, paths } from './generated/openapi.js';
export type {
  PathParams,
  QueryParams,
  RequestBody,
  RequestOptions,
  ResponseBody,
  Schemas,
} from './types.js';
export { VERSION } from './version.js';

/** A document as `invoices.retrieve` returns it. */
export type Invoice = Schemas['InvoiceResponseDto'];
/** A document as `invoices.list` returns it. */
export type InvoiceListItem = Schemas['InvoiceListItemResponseDto'];
export type CreateInvoiceParams = Schemas['CreateInvoiceDto'];
export type Customer = Schemas['CreateCustomerResponseDto'];
export type CreateCustomerParams = Schemas['CreateCustomerDto'];
export type Item = Schemas['CreateItemResponseDto'];
export type CreateItemParams = Schemas['CreateItemDto'];
export type Company = Schemas['CompanyResponseDto'];
export type ApiErrorBody = Schemas['ErrorResponseDto'];
