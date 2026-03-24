// Types matching the GNUCash SQLite schema
// See docs/gnucash-sql-schema.md for full reference

export interface GnuCashAccount {
  guid: string;
  name: string;
  account_type: string;
  commodity_guid: string;
  parent_guid: string | null;
  code: string;
  description: string;
  hidden: number;
  placeholder: number;
}

export interface GnuCashTransaction {
  guid: string;
  currency_guid: string;
  num: string;
  post_date: string;
  enter_date: string;
  description: string;
}

export interface GnuCashSplit {
  guid: string;
  tx_guid: string;
  account_guid: string;
  memo: string;
  action: string;
  reconcile_state: string;
  value_num: number;
  value_denom: number;
  quantity_num: number;
  quantity_denom: number;
  lot_guid: string | null;
}

export interface GnuCashCommodity {
  guid: string;
  namespace: string;
  mnemonic: string;
  fullname: string;
  cusip: string;
  fraction: number;
}

export interface GnuCashPrice {
  guid: string;
  commodity_guid: string;
  currency_guid: string;
  date: string;
  source: string;
  type: string;
  value_num: number;
  value_denom: number;
}

export interface GnuCashScheduledTransaction {
  guid: string;
  name: string;
  enabled: number;
  start_date: string;
  end_date: string | null;
  last_occur: string | null;
  num_occur: number;
  rem_occur: number;
  auto_create: number;
}

// Derived types for the dashboard

export interface AccountNode {
  guid: string;
  name: string;
  fullPath: string;
  type: string;
  commodityMnemonic: string;
  parentGuid: string | null;
  hidden: boolean;
  placeholder: boolean;
  balance: number;
  children: AccountNode[];
}

export interface MonthlyNetWorth {
  month: string; // YYYY-MM
  netWorth: number;
  assets: number;
  liabilities: number;
}

export interface MonthlyCashFlow {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export interface ExpenseCategory {
  name: string;
  fullPath: string;
  amount: number;
  color?: string;
  children?: ExpenseCategory[];
}

export interface MonthlyExpenseByCategory {
  month: string; // YYYY-MM
  category: string; // leaf account name
  fullPath: string; // e.g. "Food:Groceries:Supermarket"
  pathParts: string[]; // ["Food", "Groceries", "Supermarket"]
  amount: number;
}

export interface InvestmentHolding {
  accountName: string;
  ticker: string;
  sharesHeld: number;
  costBasis: number;
  marketValue: number;
  gainLoss: number;
  gainLossPct: number;
  change12m: number | null;
  change12mPct: number | null;
}

export interface RecentTransaction {
  date: string;
  description: string;
  amount: number;
  accountName: string;
  categoryName: string;
  reconciled: boolean;
}

export interface UpcomingBill {
  name: string;
  nextDate: string;
  amount: number | null;
  enabled: boolean;
}

export interface TopBalance {
  accountName: string;
  fullPath: string;
  type: string; // BANK, CASH, STOCK, MUTUAL, ASSET, etc.
  value: number; // market value for investments, balance for others
  commodityMnemonic: string;
}

export interface DashboardData {
  currency: string; // ISO 4217 code detected from GNUCash (e.g. "GBP", "USD")
  accounts: AccountNode[];
  netWorthSeries: MonthlyNetWorth[];
  cashFlowSeries: MonthlyCashFlow[];
  expenseBreakdown: ExpenseCategory[];
  monthlyExpensesByCategory: MonthlyExpenseByCategory[];
  expenseCategoryColors: Record<string, string>;
  investments: InvestmentHolding[];
  topBalances: TopBalance[];
  recentTransactions: RecentTransaction[];
  upcomingBills: UpcomingBill[];
  currentNetWorth: number;
  currentMonthIncome: number;
  currentMonthExpenses: number;
  savingsRate: number;
}
