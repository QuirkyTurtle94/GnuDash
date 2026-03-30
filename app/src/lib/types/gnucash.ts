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

export interface GnuCashBudget {
  guid: string;
  name: string;
  description: string;
  num_periods: number;
}

export interface GnuCashBudgetAmount {
  budget_guid: string;
  account_guid: string;
  period_num: number;
  amount_num: number;
  amount_denom: number;
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

export interface MonthlyInvestmentValue {
  month: string; // YYYY-MM
  ticker: string;
  value: number; // market value = shares held at month end × price at month end
  costBasis: number; // cumulative cost basis at month end
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

export interface ExpenseTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  accountName: string; // leaf expense account name
  fullPath: string; // e.g. "Food:Groceries"
  pathParts: string[];
  amount: number;
}

export interface BudgetInfo {
  guid: string;
  name: string;
  description: string;
  numPeriods: number;
}

export interface BudgetCategoryRow {
  accountGuid: string;
  accountName: string;
  fullPath: string;
  budgeted: number; // total budgeted for the selected period
  actual: number; // actual spending for the selected period
  variance: number; // budgeted - actual (positive = under budget)
  variancePct: number; // variance / budgeted * 100
  periods: { period: number; budgeted: number; actual: Record<string, number> }[]; // actual keyed by year
}

export interface BudgetData {
  budgets: BudgetInfo[];
  expenseCategories: BudgetCategoryRow[];
  incomeCategories: BudgetCategoryRow[];
  availableYears: number[];
}

export interface DashboardData {
  currency: string; // ISO 4217 code detected from GNUCash (e.g. "GBP", "USD")
  accounts: AccountNode[];
  netWorthSeries: MonthlyNetWorth[];
  cashFlowSeries: MonthlyCashFlow[];
  expenseBreakdown: ExpenseCategory[];
  monthlyExpensesByCategory: MonthlyExpenseByCategory[];
  expenseCategoryColors: Record<string, string>;
  expenseTransactions: ExpenseTransaction[];
  monthlyIncomeByCategory: MonthlyExpenseByCategory[];
  incomeCategoryColors: Record<string, string>;
  incomeTransactions: ExpenseTransaction[];
  investments: InvestmentHolding[];
  investmentValueSeries: MonthlyInvestmentValue[];
  topBalances: TopBalance[];
  recentTransactions: RecentTransaction[];
  upcomingBills: UpcomingBill[];
  currentNetWorth: number;
  currentMonthIncome: number;
  currentMonthExpenses: number;
  savingsRate: number;
  budgetData: BudgetData | null;
}
