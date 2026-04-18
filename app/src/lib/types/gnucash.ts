// Types matching the GNUCash SQLite schema
// See docs/gnucash-sql-schema.md for full reference

/** Raw account record from the GNUCash `accounts` table. */
export interface GnuCashAccount {
  guid: string;
  name: string;
  /** One of: ROOT, ASSET, BANK, CASH, CREDIT, EQUITY, EXPENSE, INCOME, LIABILITY, MUTUAL, PAYABLE, RECEIVABLE, STOCK, TRADING */
  account_type: string;
  /** GUID of the commodity (currency or security) this account is denominated in */
  commodity_guid: string;
  /** GUID of the parent account, or null for the root account */
  parent_guid: string | null;
  code: string;
  description: string;
  /** 1 = hidden in GNUCash UI */
  hidden: number;
  /** 1 = placeholder account (cannot hold transactions directly) */
  placeholder: number;
}

/** Raw transaction record from the GNUCash `transactions` table. */
export interface GnuCashTransaction {
  guid: string;
  /** GUID of the currency this transaction is denominated in */
  currency_guid: string;
  /** Check number or reference string */
  num: string;
  /** Date the transaction was posted, in compact GNUCash format (YYYYMMDDHHmmss) */
  post_date: string;
  /** Date the transaction was entered into the system */
  enter_date: string;
  description: string;
}

/** Raw split record from the GNUCash `splits` table. Every transaction has 2+ splits (double-entry). */
export interface GnuCashSplit {
  guid: string;
  /** GUID of the parent transaction */
  tx_guid: string;
  /** GUID of the account this split belongs to */
  account_guid: string;
  memo: string;
  /** e.g. "Buy", "Sell", "Deposit" — often empty */
  action: string;
  /** "y" = reconciled, "c" = cleared, "n" = unreconciled */
  reconcile_state: string;
  /** Numerator of the value in the transaction's currency. Amount = value_num / value_denom. */
  value_num: number;
  /** Denominator of the value. Typically 100 for currencies with 2 decimal places. */
  value_denom: number;
  /** Numerator of the quantity in the account's native commodity. For same-currency accounts, equals value_num. For stocks, this is the number of shares. */
  quantity_num: number;
  /** Denominator of the quantity */
  quantity_denom: number;
  /** GUID of the lot (used for capital gains tracking), or null */
  lot_guid: string | null;
}

/** Raw commodity/currency record from the GNUCash `commodities` table. */
export interface GnuCashCommodity {
  guid: string;
  /** "CURRENCY" for fiat currencies, or an exchange name (e.g. "NASDAQ") for securities */
  namespace: string;
  /** Ticker symbol or ISO 4217 code (e.g. "GBP", "AAPL") */
  mnemonic: string;
  /** Human-readable name (e.g. "British Pound Sterling") */
  fullname: string;
  /** ISIN or CUSIP identifier for securities, empty for currencies */
  cusip: string;
  /** Smallest fractional unit (e.g. 100 for GBP = 2 decimal places, 10000 for stocks = 4 decimal places) */
  fraction: number;
}

/** Raw price record from the GNUCash `prices` table. Stores historical prices for commodities. */
export interface GnuCashPrice {
  guid: string;
  /** GUID of the commodity being priced (e.g. AAPL stock) */
  commodity_guid: string;
  /** GUID of the currency the price is expressed in (e.g. USD) */
  currency_guid: string;
  /** Date of the price quote, in GNUCash format */
  date: string;
  /** Source of the price (e.g. "user:price-editor", "Finance::Quote") */
  source: string;
  /** Type of price (e.g. "last", "nav") */
  type: string;
  /** Numerator of the price. Price = value_num / value_denom. */
  value_num: number;
  value_denom: number;
}

/** Raw scheduled transaction record from the GNUCash `schedxactions` table. */
export interface GnuCashScheduledTransaction {
  guid: string;
  name: string;
  /** 1 = enabled, 0 = disabled */
  enabled: number;
  /** First occurrence date in GNUCash format */
  start_date: string;
  /** Last possible occurrence date, or null for no end date */
  end_date: string | null;
  /** Date of the last created instance, or null if none yet */
  last_occur: string | null;
  /** Total number of occurrences (0 = unlimited) */
  num_occur: number;
  /** Remaining occurrences */
  rem_occur: number;
  /** 1 = auto-create transactions, 0 = prompt user */
  auto_create: number;
}

/** Raw budget record from the GNUCash `budgets` table. */
export interface GnuCashBudget {
  guid: string;
  name: string;
  description: string;
  /** Number of budget periods, typically 12 (one per month) */
  num_periods: number;
}

/** Raw budget amount record from the GNUCash `budget_amounts` table. One row per account per period. */
export interface GnuCashBudgetAmount {
  /** GUID of the budget this amount belongs to */
  budget_guid: string;
  /** GUID of the account being budgeted */
  account_guid: string;
  /** 0-indexed period number (0 = January, 11 = December) */
  period_num: number;
  /** Numerator of the budgeted amount. Amount = amount_num / amount_denom. */
  amount_num: number;
  /** Denominator of the budgeted amount, typically 100 */
  amount_denom: number;
}

// ----- Derived types for the dashboard -----

/** Hierarchical account node used in the accounts tree view. Balances are converted to base currency. */
export interface AccountNode {
  guid: string;
  name: string;
  /** Colon-separated account path excluding the root, e.g. "Assets:Bank:Checking" */
  fullPath: string;
  /** GNUCash account type (BANK, CASH, EXPENSE, etc.) */
  type: string;
  /** GUID of the commodity this account is denominated in */
  commodityGuid: string;
  /** Ticker/currency code of the commodity (e.g. "GBP", "AAPL") */
  commodityMnemonic: string;
  parentGuid: string | null;
  hidden: boolean;
  placeholder: boolean;
  /** Account balance in base currency, including all descendant accounts */
  balance: number;
  /** Account balance in native commodity (for parents: children converted to parent's commodity) */
  nativeBalance: number;
  /** Currency mnemonic for nativeBalance display (e.g. "USD" for a USD brokerage; for stocks: the trading currency) */
  nativeCurrencyMnemonic: string;
  children: AccountNode[];
}

/** Subset of commodity fields exposed to the UI. */
export interface CommodityInfo {
  guid: string;
  namespace: string;
  mnemonic: string;
  fullname: string;
  fraction: number;
}

/** One data point in the net worth time series. All values are in base currency. */
export interface MonthlyNetWorth {
  month: string; // YYYY-MM
  netWorth: number;
  /** Total assets including investments at market value */
  assets: number;
  /** Total liabilities as a positive number */
  liabilities: number;
}

/** One data point in the income/expense cash flow series. All values are positive. */
export interface MonthlyCashFlow {
  month: string; // YYYY-MM
  /** Total income for this month (positive) */
  income: number;
  /** Total expenses for this month (positive) */
  expenses: number;
  /** income - expenses */
  net: number;
}

/** Hierarchical expense category with nested children. Used for tree-structured breakdowns. */
export interface ExpenseCategory {
  /** Leaf account name (e.g. "Groceries") */
  name: string;
  /** Colon-separated path from expense root (e.g. "Food:Groceries") */
  fullPath: string;
  /** Total amount spent in this category (positive) */
  amount: number;
  /** Assigned color for charts */
  color?: string;
  children?: ExpenseCategory[];
}

/** Flat row of expense/income data per category per month. Used for pie/bar charts with drill-down. */
export interface MonthlyExpenseByCategory {
  month: string; // YYYY-MM
  /** Leaf account name (e.g. "Supermarket") */
  category: string;
  /** Colon-separated path from top-level category (e.g. "Food:Groceries:Supermarket") */
  fullPath: string;
  /** Path split into segments for hierarchical drill-down (e.g. ["Food", "Groceries", "Supermarket"]) */
  pathParts: string[];
  /** Amount spent (positive) in base currency */
  amount: number;
}

/** Current holdings for a single investment account (STOCK or MUTUAL). */
export interface InvestmentHolding {
  accountName: string;
  /** Commodity ticker/mnemonic (e.g. "AAPL") */
  ticker: string;
  sharesHeld: number;
  /** Total cost of shares purchased (sum of all buy transactions) */
  costBasis: number;
  /** Current market value (sharesHeld × latest price) */
  marketValue: number;
  /** marketValue - costBasis */
  gainLoss: number;
  /** Gain/loss as a percentage of cost basis */
  gainLossPct: number;
  /** Change in market value over the past 12 months, or null if insufficient price history */
  change12m: number | null;
  /** 12-month change as a percentage, or null */
  change12mPct: number | null;
}

/** Monthly snapshot of an investment's value. Used for the portfolio value-over-time chart. */
export interface MonthlyInvestmentValue {
  month: string; // YYYY-MM
  ticker: string;
  /** Market value at month end = shares held × price at month end */
  value: number;
  /** Cumulative cost basis at month end */
  costBasis: number;
}

/** A recent transaction from a BANK/CASH/ASSET/CREDIT/LIABILITY account. */
export interface RecentTransaction {
  date: string;
  description: string;
  /** Transaction amount in the account's currency (positive = debit, negative = credit) */
  amount: number;
  /** Name of the account the split belongs to */
  accountName: string;
  /** Name of the counter-account (other side of the split), or "Split" for multi-split transactions */
  categoryName: string;
  reconciled: boolean;
}

/** An upcoming scheduled transaction (bill). */
export interface UpcomingBill {
  name: string;
  /** ISO date string of the next occurrence */
  nextDate: string;
  /** Estimated amount from the template splits, or null if unavailable */
  amount: number | null;
  enabled: boolean;
}

/** Balance of a single non-placeholder account, converted to base currency. */
export interface TopBalance {
  accountName: string;
  /** Colon-separated path (e.g. "Assets:Bank:Checking") */
  fullPath: string;
  /** GNUCash account type: BANK, CASH, STOCK, MUTUAL, ASSET, LIABILITY, CREDIT, etc. */
  type: string;
  /** Balance in base currency. For investments: shares × latest price. For others: sum of quantity splits × FX rate. */
  value: number;
  /** Ticker or currency code of the account's commodity */
  commodityMnemonic: string;
}

/** A single expense or income transaction row for the transactions table. */
export interface ExpenseTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  /** Leaf account name (e.g. "Groceries") */
  accountName: string;
  /** Colon-separated category path (e.g. "Food:Groceries") */
  fullPath: string;
  /** Path split into segments for filtering */
  pathParts: string[];
  /** Amount in base currency (positive for expenses, negative for income — then abs'd in income view) */
  amount: number;
}

/** A single split within a ledger transaction. */
export interface LedgerSplit {
  accountGuid: string;
  accountName: string;
  /** Full colon-separated account path (e.g. "Assets:Bank:Checking") */
  accountFullPath: string;
  accountType: string;
  memo: string;
  /** "y" = reconciled, "c" = cleared, "n" = unreconciled */
  reconcileState: string;
  /** Split amount in the transaction's currency (value_num / value_denom) */
  amount: number;
  /** Split amount in the account's native commodity (quantity_num / quantity_denom). Differs from amount for FX or stock transactions. */
  quantity: number;
  commodityMnemonic: string;
}

/** A full ledger transaction with all its splits. */
export interface LedgerTransaction {
  guid: string;
  date: string; // YYYY-MM-DD
  description: string;
  /** Check number or reference */
  num: string;
  splits: LedgerSplit[];
}

/** GnuCash recurrence period type. Stored on the `recurrences` row attached to a budget. */
export type BudgetPeriodType = "day" | "week" | "month" | "year";

/** Metadata about a GNUCash budget. */
export interface BudgetInfo {
  guid: string;
  name: string;
  description: string;
  /** Number of budget periods (typically 12 for monthly budgets) */
  numPeriods: number;
  /**
   * Recurrence period type from the `recurrences` row (`obj_guid = budget.guid`).
   * Falls back to "month" when no recurrence row is present so the view layer
   * always has a valid type to render. Writers always emit a recurrence row.
   */
  periodType: BudgetPeriodType;
  /**
   * Recurrence multiplier — e.g. periodType="month" + mult=3 means quarterly periods.
   * Defaults to 1 when the recurrence row is missing.
   */
  recurrenceMult: number;
  /**
   * First period's start date (ISO YYYY-MM-DD). Derived from
   * `recurrences.recurrence_period_start` (GnuCash stores it as YYYYMMDD or
   * YYYY-MM-DD HH:MM:SS depending on backend). Empty string when no
   * recurrence row is present.
   */
  recurrenceStart: string;
}

/** A single row in the budget view, representing one account's budgeted vs actual amounts. */
export interface BudgetCategoryRow {
  accountGuid: string;
  accountName: string;
  /** Colon-separated path within the budget hierarchy */
  fullPath: string;
  /** Total budgeted amount for the selected period (always positive) */
  budgeted: number;
  /** Total actual amount for the selected period (always positive) */
  actual: number;
  /** budgeted - actual (positive = under budget, negative = over budget) */
  variance: number;
  /** (variance / budgeted) × 100 */
  variancePct: number;
  /** Per-period data. `actual` is keyed by year string (e.g. "2025") to support year-over-year comparison. */
  periods: { period: number; budgeted: number; actual: Record<string, number> }[];
  /** Nearest ancestor in the budget hierarchy, or null for top-level categories */
  parentAccountGuid: string | null;
  /** 0 = top-level budget category, 1 = first sub-level, etc. */
  depth: number;
  /** True if child accounts also appear as rows in the budget hierarchy */
  hasChildren: boolean;
  /** True if this account has an explicit entry in the budget_amounts table (vs. synthesised from children) */
  hasExplicitBudget: boolean;
  /** Sum of direct children's budgeted amounts */
  childBudgetTotal: number;
  /** budgeted - childBudgetTotal. Only non-zero for accounts with both an explicit budget AND budgeted children. */
  imbalance: number;
  /** True for synthetic "Unbudgeted" rows that show the gap between a parent's budget and its children's budgets */
  isUnbudgeted?: boolean;
}

/** Budget data for a single GNUCash budget, split into expense and income categories. */
export interface BudgetDataForBudget {
  expenseCategories: BudgetCategoryRow[];
  incomeCategories: BudgetCategoryRow[];
}

/**
 * One row from the `budget_amounts` table. Amounts are in the account's own
 * commodity (no FX conversion), stored as an exact rational so the editor
 * can round-trip values without precision loss.
 */
export interface RawBudgetCell {
  accountGuid: string;
  /** 0-indexed period (period 0 = first period). */
  periodNum: number;
  amountNum: number;
  amountDenom: number;
}

/** All budget data across all GNUCash budgets in the file. */
export interface BudgetData {
  budgets: BudgetInfo[];
  /** Categories keyed by budget guid */
  categoriesByBudget: Record<string, BudgetDataForBudget>;
  /** @deprecated Use categoriesByBudget instead — kept for convenience as alias to first budget */
  expenseCategories: BudgetCategoryRow[];
  incomeCategories: BudgetCategoryRow[];
  /** Years that have actual transaction data, sorted descending (most recent first) */
  availableYears: number[];
  /**
   * Raw `budget_amounts` rows keyed by budget guid, in the account's own
   * commodity (no FX). Feeds the special-functions budget editor, which
   * needs exact rational amounts to round-trip edits without precision loss.
   */
  rawAmountsByBudget: Record<string, RawBudgetCell[]>;
}

export interface CashFlowBudgetForBudget {
  outflowCategories: BudgetCategoryRow[];
  inflowCategories: BudgetCategoryRow[];
}

export interface CashFlowBudgetData {
  budgets: BudgetInfo[];
  categoriesByBudget: Record<string, CashFlowBudgetForBudget>;
  availableYears: number[];
}

/**
 * The complete data model passed from the worker to the UI.
 * Computed once when a GNUCash file is loaded and cached in React context.
 * All monetary values are converted to the base currency unless otherwise noted.
 */
export interface DashboardData {
  /** ISO 4217 currency code detected from the GNUCash root account (e.g. "GBP", "USD") */
  currency: string;
  /** GUID of the base currency commodity in the commodities table */
  currencyGuid: string;
  /** Smallest fractional unit for the base currency (e.g. 100 for USD/GBP = 2 decimal places) */
  currencyFraction: number;
  /** Hierarchical account tree rooted at the GNUCash root account's children */
  accounts: AccountNode[];
  /** Monthly net worth time series (assets, liabilities, net worth) */
  netWorthSeries: MonthlyNetWorth[];
  /** Monthly income vs expense series (used by the Income/Expense Flow chart) */
  cashFlowSeries: MonthlyCashFlow[];
  /** Hierarchical expense breakdown for the expense category tree */
  expenseBreakdown: ExpenseCategory[];
  /** Flat monthly expense rows for pie/bar charts with drill-down */
  monthlyExpensesByCategory: MonthlyExpenseByCategory[];
  /** Stable colour assignments for top-level expense categories (keyed by category name) */
  expenseCategoryColors: Record<string, string>;
  /** Individual expense transactions for the expense table */
  expenseTransactions: ExpenseTransaction[];
  /** Flat monthly income rows for pie/bar charts with drill-down */
  monthlyIncomeByCategory: MonthlyExpenseByCategory[];
  /** Stable colour assignments for top-level income categories */
  incomeCategoryColors: Record<string, string>;
  /** Individual income transactions for the income table */
  incomeTransactions: ExpenseTransaction[];
  /** Current investment holdings with cost basis and market value */
  investments: InvestmentHolding[];
  /** Monthly portfolio value time series per ticker */
  investmentValueSeries: MonthlyInvestmentValue[];
  /** All non-placeholder account balances, sorted by value */
  topBalances: TopBalance[];
  /** 50 most recent transactions from BANK/CASH/ASSET/CREDIT/LIABILITY accounts */
  recentTransactions: RecentTransaction[];
  /** Upcoming scheduled transactions (bills) */
  upcomingBills: UpcomingBill[];
  /** Current total net worth in base currency */
  currentNetWorth: number;
  /** Income for the current calendar month */
  currentMonthIncome: number;
  /** Expenses for the current calendar month */
  currentMonthExpenses: number;
  /** (income - expenses) / income × 100 for the current month */
  savingsRate: number;
  /** Budget data (null if no budgets exist in the GNUCash file) */
  budgetData: BudgetData | null;
  cashFlowBudgetData: CashFlowBudgetData | null;
  /** All transactions with full split details for the ledger view */
  ledgerTransactions: LedgerTransaction[];
  /** All commodities/currencies in the file */
  commodities: CommodityInfo[];
  /** All price entries from the prices table, ordered by date descending */
  prices: GnuCashPrice[];
  /** GUIDs of transaction-linked prices whose originating transaction can no
   *  longer be found (i.e. the tx was edited away or deleted). Used by the
   *  prices table to render an "Orphaned" badge and offer bulk cleanup. */
  orphanedPriceGuids: string[];
  /** Currencies available for the display currency selector (CURRENCY namespace only) */
  availableCurrencies: { guid: string; mnemonic: string; fullname: string }[];
  /** True if the file contains book-closing transactions (year-end entries that zero out income/expense) */
  hasClosingTransactions: boolean;
  /** Cash flow series with closing transactions excluded (only present when hasClosingTransactions is true). */
  cashFlowSeriesExcludingClosing?: MonthlyCashFlow[];
  /** Monthly expenses by category with closing transactions excluded. */
  monthlyExpensesByCategoryExcludingClosing?: MonthlyExpenseByCategory[];
  /** Expense categories with closing transactions excluded. */
  expenseBreakdownExcludingClosing?: ExpenseCategory[];
  /** Expense category colors with closing transactions excluded. */
  expenseCategoryColorsExcludingClosing?: Record<string, string>;
  /** Monthly income by category with closing transactions excluded. */
  monthlyIncomeByCategoryExcludingClosing?: MonthlyExpenseByCategory[];
  /** Income category colors with closing transactions excluded. */
  incomeCategoryColorsExcludingClosing?: Record<string, string>;
  /** Monthly cash inflow rows grouped by counterparty category (for cash flow Sankey).
   *  Unlike monthlyIncomeByCategory (which tracks all INCOME splits), this only includes
   *  cash that actually entered BANK/CASH accounts, attributed to the counterparty category. */
  monthlyCashInflowByCategory: MonthlyExpenseByCategory[];
  /** Monthly cash outflow rows grouped by counterparty category (for cash flow Sankey).
   *  Unlike monthlyExpensesByCategory (which tracks all EXPENSE splits), this only includes
   *  cash that actually left BANK/CASH accounts, attributed to the counterparty category. */
  monthlyCashOutflowByCategory: MonthlyExpenseByCategory[];
  /** Stable colour assignments for top-level cash inflow categories */
  cashInflowCategoryColors: Record<string, string>;
  /** Stable colour assignments for top-level cash outflow categories */
  cashOutflowCategoryColors: Record<string, string>;
  /** Cash inflow by category with closing transactions excluded. */
  monthlyCashInflowByCategoryExcludingClosing?: MonthlyExpenseByCategory[];
  /** Cash outflow by category with closing transactions excluded. */
  monthlyCashOutflowByCategoryExcludingClosing?: MonthlyExpenseByCategory[];
  /** Cash inflow category colors with closing transactions excluded. */
  cashInflowCategoryColorsExcludingClosing?: Record<string, string>;
  /** Cash outflow category colors with closing transactions excluded. */
  cashOutflowCategoryColorsExcludingClosing?: Record<string, string>;
}
