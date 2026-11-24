import { paginateByOffset, paginateByPage } from '../pagination.js';
import type { QueryParams, RequestBody, RequestOptions } from '../types.js';
import { DEFAULT_PAGE_SIZE, Resource, type ListAllQuery } from './base.js';

/** The connected company. */
export class Company extends Resource {
  /**
   * The company and its issuance readiness (`readiness`): check it before
   * issuing. `environment` says whether the key reaches production or the
   * sandbox.
   */
  retrieve(options?: RequestOptions) {
    return this.client.call('CompanyController_getCompany', {}, options);
  }
}

export class Vat extends Resource {
  /** The VAT rate and exemption that apply to an item for a customer. */
  calculate(body: RequestBody<'VatController_calculate'>, options?: RequestOptions) {
    return this.client.call('VatController_calculate', { body }, options);
  }

  validateClient(body: RequestBody<'VatController_validateClient'>, options?: RequestOptions) {
    return this.client.call('VatController_validateClient', { body }, options);
  }
}

type ExpenseListQuery = QueryParams<'ExpensesController_findAll'>;

/** Purchase documents imported from e-Fatura. Read-only. */
export class Expenses extends Resource {
  list(query?: ExpenseListQuery, options?: RequestOptions) {
    return this.client.call('ExpensesController_findAll', { query }, options);
  }

  listAll(query: ListAllQuery<ExpenseListQuery> = {}, options?: RequestOptions) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByOffset(
      (offset, limit) => this.list({ ...filters, offset, limit } as ExpenseListQuery, options),
      { limit: pageSize },
    );
  }

  stats(query?: QueryParams<'ExpensesController_stats'>, options?: RequestOptions) {
    return this.client.call('ExpensesController_stats', { query }, options);
  }
}

type TransactionQuery = QueryParams<'BankController_getTransactions'>;

/** Bank connections and transactions (open banking). Production only. */
export class Bank extends Resource {
  connections(options?: RequestOptions) {
    return this.client.call('BankController_getConnections', {}, options);
  }

  transactions(query: TransactionQuery, options?: RequestOptions) {
    return this.client.call('BankController_getTransactions', { query }, options);
  }

  transactionsAll(
    query: Omit<TransactionQuery, 'page' | 'pageSize'> & { pageSize?: number },
    options?: RequestOptions,
  ) {
    const { pageSize = DEFAULT_PAGE_SIZE, ...filters } = query;
    return paginateByPage(
      (page, size) => this.transactions({ ...filters, page, pageSize: size } as TransactionQuery, options),
      { pageSize },
    );
  }
}

export class Exports extends Resource {
  /**
   * Generates the company's SAF-T PT for a month or a period and returns a
   * temporary download link.
   */
  saftPt(query: QueryParams<'ExportsController_exportSaftPt'>, options?: RequestOptions) {
    return this.client.call('ExportsController_exportSaftPt', { query }, options);
  }
}
