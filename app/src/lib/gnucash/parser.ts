import Database from "better-sqlite3";
import type {
  GnuCashAccount,
  GnuCashCommodity,
  GnuCashPrice,
  AccountNode,
  MonthlyNetWorth,
  MonthlyCashFlow,
  ExpenseCategory,
  MonthlyExpenseByCategory,
  InvestmentHolding,
  MonthlyInvestmentValue,
  TopBalance,
  RecentTransaction,
  UpcomingBill,
  ExpenseTransaction,
  DashboardData,
} from "@/lib/types/gnucash";

// GNUCash SQLite date format: YYYYMMDDHHmmss (CHAR 14) or YYYY-MM-DD HH:MM:SS
function parseGnuCashDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  // Handle both formats: "20250101120000" and "2025-01-01 12:00:00"
  const cleaned = dateStr.replace(/[-: ]/g, "");
  const year = parseInt(cleaned.substring(0, 4));
  const month = parseInt(cleaned.substring(4, 6)) - 1;
  const day = parseInt(cleaned.substring(6, 8));
  return new Date(year, month, day);
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const ASSET_TYPES = ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL", "RECEIVABLE"];
const LIABILITY_TYPES = ["LIABILITY", "CREDIT", "PAYABLE"];
const INCOME_TYPES = ["INCOME"];
const EXPENSE_TYPES = ["EXPENSE"];

export function parseGnuCashFile(filePath: string): DashboardData {
  const db = new Database(filePath, { readonly: true });

  try {
    const accounts = loadAccounts(db);
    const commodities = loadCommodities(db);
    const prices = loadPrices(db);

    // Detect base currency from the root account's commodity
    const baseCurrency = detectBaseCurrency(db, accounts, commodities);

    const accountTree = buildAccountTree(accounts, commodities, db);
    const netWorthSeries = computeNetWorthSeries(db);
    const cashFlowSeries = computeCashFlowSeries(db);
    const { categories: expenseBreakdown, monthly: monthlyExpensesByCategory, colors: expenseCategoryColors } = computeExpenseBreakdown(db, accounts);
    const investments = computeInvestments(db, accounts, commodities, prices);
    const investmentValueSeries = computeInvestmentValueSeries(db, accounts, commodities);
    const topBalances = computeTopBalances(db, accounts, commodities, investments);
    const expenseTransactions = getExpenseTransactions(db, accounts);
    const { monthly: monthlyIncomeByCategory, colors: incomeCategoryColors } = computeIncomeBreakdown(db, accounts);
    const incomeTransactions = getIncomeTransactions(db, accounts);
    const recentTransactions = getRecentTransactions(db, accounts);
    const upcomingBills = getUpcomingBills(db);

    // Current net worth: compute directly from account balances
    // Non-investment accounts: sum of value_num/value_denom
    // Investment accounts: shares * latest price (market value)
    const latestNW = computeCurrentNetWorth(db, accounts, commodities, investments);

    const now = new Date();
    const currentMonth = formatMonth(now);
    const currentCF = cashFlowSeries.find((cf) => cf.month === currentMonth);

    const currentIncome = currentCF?.income ?? 0;
    const currentExpenses = currentCF?.expenses ?? 0;
    const savingsRate = currentIncome > 0
      ? ((currentIncome - currentExpenses) / currentIncome) * 100
      : 0;

    return {
      currency: baseCurrency,
      accounts: accountTree,
      netWorthSeries,
      cashFlowSeries,
      expenseBreakdown,
      monthlyExpensesByCategory,
      expenseCategoryColors,
      expenseTransactions,
      monthlyIncomeByCategory,
      incomeCategoryColors,
      incomeTransactions,
      investments,
      investmentValueSeries,
      topBalances,
      recentTransactions,
      upcomingBills,
      currentNetWorth: latestNW,
      currentMonthIncome: currentIncome,
      currentMonthExpenses: currentExpenses,
      savingsRate,
    };
  } finally {
    db.close();
  }
}

function detectBaseCurrency(
  db: Database.Database,
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[]
): string {
  // The root account's commodity is the book's base currency
  const book = db
    .prepare(`SELECT root_account_guid FROM books LIMIT 1`)
    .get() as { root_account_guid: string } | undefined;

  if (book) {
    const rootAccount = accounts.find((a) => a.guid === book.root_account_guid);
    if (rootAccount) {
      const commodity = commodities.find(
        (c) => c.guid === rootAccount.commodity_guid
      );
      if (commodity && commodity.namespace === "CURRENCY") {
        return commodity.mnemonic;
      }
    }
  }

  // Fallback: find the most common currency among BANK/CASH accounts
  const row = db
    .prepare(
      `SELECT c.mnemonic, COUNT(*) as cnt
       FROM accounts a
       JOIN commodities c ON a.commodity_guid = c.guid
       WHERE a.account_type IN ('BANK', 'CASH') AND c.namespace = 'CURRENCY'
       GROUP BY c.mnemonic
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .get() as { mnemonic: string } | undefined;

  return row?.mnemonic ?? "USD";
}

function loadAccounts(db: Database.Database): GnuCashAccount[] {
  return db
    .prepare(
      `SELECT guid, name, account_type, commodity_guid, parent_guid,
              code, description, hidden, placeholder
       FROM accounts`
    )
    .all() as GnuCashAccount[];
}

function loadCommodities(db: Database.Database): GnuCashCommodity[] {
  return db
    .prepare(
      `SELECT guid, namespace, mnemonic, fullname, cusip, fraction
       FROM commodities`
    )
    .all() as GnuCashCommodity[];
}

function loadPrices(db: Database.Database): GnuCashPrice[] {
  return db
    .prepare(
      `SELECT guid, commodity_guid, currency_guid, date, source, type,
              value_num, value_denom
       FROM prices
       ORDER BY date DESC`
    )
    .all() as GnuCashPrice[];
}

function buildAccountTree(
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[],
  db: Database.Database
): AccountNode[] {
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));

  // Get balances for all accounts
  const balances = db
    .prepare(
      `SELECT account_guid, SUM(CAST(value_num AS REAL) / value_denom) AS balance
       FROM splits
       GROUP BY account_guid`
    )
    .all() as { account_guid: string; balance: number }[];
  const balanceMap = new Map(balances.map((b) => [b.account_guid, b.balance]));

  // Build lookup
  const accountMap = new Map(accounts.map((a) => [a.guid, a]));
  const childrenMap = new Map<string, GnuCashAccount[]>();
  for (const a of accounts) {
    const key = a.parent_guid ?? "ROOT";
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(a);
  }

  function buildPath(account: GnuCashAccount): string {
    const parts: string[] = [account.name];
    let current = account;
    while (current.parent_guid) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent || parent.account_type === "ROOT") break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts.join(":");
  }

  function buildNode(account: GnuCashAccount): AccountNode {
    const commodity = commodityMap.get(account.commodity_guid);
    const children = (childrenMap.get(account.guid) ?? [])
      .filter((c) => c.account_type !== "ROOT")
      .map(buildNode);

    return {
      guid: account.guid,
      name: account.name,
      fullPath: buildPath(account),
      type: account.account_type,
      commodityMnemonic: commodity?.mnemonic ?? "???",
      parentGuid: account.parent_guid,
      hidden: account.hidden === 1,
      placeholder: account.placeholder === 1,
      balance: balanceMap.get(account.guid) ?? 0,
      children,
    };
  }

  // Find root account and return its top-level children
  const rootAccount = accounts.find((a) => a.account_type === "ROOT");
  if (!rootAccount) return [];

  const topLevel = childrenMap.get(rootAccount.guid) ?? [];
  return topLevel.map(buildNode);
}

function computeCurrentNetWorth(
  db: Database.Database,
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[],
  investments: InvestmentHolding[]
): number {
  // Determine base currency
  const book = db
    .prepare(`SELECT root_account_guid FROM books LIMIT 1`)
    .get() as { root_account_guid: string } | undefined;
  const rootAcct = book ? accounts.find((a) => a.guid === book.root_account_guid) : null;
  const baseCurrencyGuid = rootAcct?.commodity_guid ?? "";
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));

  // Get FX rates to base currency
  const allFxPrices = db
    .prepare(
      `SELECT p.commodity_guid, p.currency_guid,
              CAST(p.value_num AS REAL) / p.value_denom AS price
       FROM prices p
       JOIN commodities c1 ON p.commodity_guid = c1.guid
       JOIN commodities c2 ON p.currency_guid = c2.guid
       WHERE c1.namespace = 'CURRENCY' AND c2.namespace = 'CURRENCY'
       ORDER BY p.date DESC`
    )
    .all() as { commodity_guid: string; currency_guid: string; price: number }[];

  const fxToBase = new Map<string, number>();
  fxToBase.set(baseCurrencyGuid, 1.0);
  for (const fx of allFxPrices) {
    if (fx.currency_guid === baseCurrencyGuid && !fxToBase.has(fx.commodity_guid)) {
      fxToBase.set(fx.commodity_guid, fx.price);
    } else if (fx.commodity_guid === baseCurrencyGuid && !fxToBase.has(fx.currency_guid)) {
      fxToBase.set(fx.currency_guid, 1 / fx.price);
    }
  }

  // Sum non-investment accounts using quantity (native commodity) + fx conversion
  const nonInvRows = db
    .prepare(
      `SELECT
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type NOT IN ('STOCK', 'MUTUAL', 'ROOT', 'INCOME', 'EXPENSE', 'EQUITY', 'TRADING')
        AND a.placeholder = 0
      GROUP BY a.commodity_guid`
    )
    .all() as { commodity_guid: string; balance: number }[];

  let nonInvTotal = 0;
  for (const row of nonInvRows) {
    const commodity = commodityMap.get(row.commodity_guid);
    if (commodity?.namespace === "CURRENCY") {
      const rate = fxToBase.get(row.commodity_guid) ?? 1;
      nonInvTotal += row.balance * rate;
    } else {
      nonInvTotal += row.balance;
    }
  }

  // Add market value of all investments
  const investmentMarketValue = investments.reduce(
    (sum, inv) => sum + inv.marketValue,
    0
  );

  return nonInvTotal + investmentMarketValue;
}

function computeNetWorthSeries(db: Database.Database): MonthlyNetWorth[] {
  // Step 1: Get monthly changes for non-investment accounts (value = market value)
  const nonInvRows = db
    .prepare(
      `SELECT
        strftime('%Y-%m', t.post_date) AS month,
        SUM(CASE WHEN a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE')
            THEN CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS asset_change,
        SUM(CASE WHEN a.account_type IN ('LIABILITY','CREDIT','PAYABLE')
            THEN CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS liability_change
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE','LIABILITY','CREDIT','PAYABLE')
      GROUP BY strftime('%Y-%m', t.post_date)
      ORDER BY month`
    )
    .all() as { month: string; asset_change: number; liability_change: number }[];

  // Step 2: For investment accounts, compute market value at end of each month
  // Get all investment accounts with their commodity
  const invAccounts = db
    .prepare(
      `SELECT a.guid, a.commodity_guid
       FROM accounts a
       WHERE a.account_type IN ('STOCK', 'MUTUAL')`
    )
    .all() as { guid: string; commodity_guid: string }[];

  // Get cumulative shares per investment account per month
  const invShares = db
    .prepare(
      `SELECT
        s.account_guid,
        strftime('%Y-%m', t.post_date) AS month,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_change
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY s.account_guid, strftime('%Y-%m', t.post_date)
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; shares_change: number }[];

  // Build cumulative shares per account per month
  const sharesMap = new Map<string, Map<string, number>>(); // account_guid -> month -> cumulative shares
  const accountSharesRunning = new Map<string, number>();
  const allMonths = new Set<string>();

  for (const row of invShares) {
    allMonths.add(row.month);
    const running = (accountSharesRunning.get(row.account_guid) ?? 0) + row.shares_change;
    accountSharesRunning.set(row.account_guid, running);
    if (!sharesMap.has(row.account_guid)) sharesMap.set(row.account_guid, new Map());
    sharesMap.get(row.account_guid)!.set(row.month, running);
  }

  // Get all prices sorted by date for each commodity
  const allPrices = db
    .prepare(
      `SELECT commodity_guid, date, CAST(value_num AS REAL) / value_denom AS price
       FROM prices ORDER BY date`
    )
    .all() as { commodity_guid: string; date: string; price: number }[];

  // Build price lookup: commodity -> array of {month, price}
  const pricesByMonth = new Map<string, Map<string, number>>(); // commodity -> month -> price
  for (const p of allPrices) {
    const pMonth = p.date.substring(0, 7); // YYYY-MM from date string
    if (!pricesByMonth.has(p.commodity_guid)) pricesByMonth.set(p.commodity_guid, new Map());
    pricesByMonth.get(p.commodity_guid)!.set(pMonth, p.price); // last price in month wins
  }

  // Helper: get price for a commodity at a given month (use latest available up to that month)
  function getPriceAtMonth(commodityGuid: string, month: string): number {
    const prices = pricesByMonth.get(commodityGuid);
    if (!prices) return 0;
    let lastPrice = 0;
    for (const [m, price] of prices) {
      if (m <= month) lastPrice = price;
    }
    return lastPrice;
  }

  // Helper: get shares for an account at a given month (carry forward last known)
  function getSharesAtMonth(accountGuid: string, month: string): number {
    const monthMap = sharesMap.get(accountGuid);
    if (!monthMap) return 0;
    let lastShares = 0;
    for (const [m, shares] of monthMap) {
      if (m <= month) lastShares = shares;
    }
    return lastShares;
  }

  // Step 3: Collect all months and compute final series
  for (const row of nonInvRows) allMonths.add(row.month);
  const sortedMonths = [...allMonths].sort();

  // Build non-investment cumulative values
  const nonInvMap = new Map<string, { asset_change: number; liability_change: number }>();
  for (const row of nonInvRows) {
    nonInvMap.set(row.month, row);
  }

  let cumulativeNonInvAssets = 0;
  let cumulativeLiabilities = 0;

  return sortedMonths.map((month) => {
    const nonInv = nonInvMap.get(month);
    if (nonInv) {
      cumulativeNonInvAssets += nonInv.asset_change;
      cumulativeLiabilities += nonInv.liability_change;
    }

    // Compute total investment market value at this month
    let investmentValue = 0;
    for (const acc of invAccounts) {
      const shares = getSharesAtMonth(acc.guid, month);
      const price = getPriceAtMonth(acc.commodity_guid, month);
      investmentValue += shares * price;
    }

    const totalAssets = cumulativeNonInvAssets + investmentValue;

    return {
      month,
      netWorth: totalAssets + cumulativeLiabilities,
      assets: totalAssets,
      liabilities: Math.abs(cumulativeLiabilities),
    };
  });
}

function computeCashFlowSeries(db: Database.Database): MonthlyCashFlow[] {
  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m', t.post_date) AS month,
        SUM(CASE WHEN a.account_type = 'INCOME'
            THEN -CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS income,
        SUM(CASE WHEN a.account_type = 'EXPENSE'
            THEN CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS expenses
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('INCOME', 'EXPENSE')
      GROUP BY strftime('%Y-%m', t.post_date)
      ORDER BY month`
    )
    .all() as { month: string; income: number; expenses: number }[];

  return rows.map((row) => ({
    month: row.month,
    income: row.income,
    expenses: row.expenses,
    net: row.income - row.expenses,
  }));
}

function computeExpenseBreakdown(
  db: Database.Database,
  accounts: GnuCashAccount[]
): { categories: ExpenseCategory[]; monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const rootAccount = accounts.find((a) => a.account_type === "ROOT");
  if (!rootAccount) return { categories: [], monthly: [], colors: {} };

  // All EXPENSE accounts directly under ROOT (e.g. "Expenses", "Deductibles")
  const topExpenseAccounts = accounts.filter(
    (a) => a.account_type === "EXPENSE" && a.parent_guid === rootAccount.guid
  );
  if (topExpenseAccounts.length === 0) return { categories: [], monthly: [], colors: {} };

  const topExpenseGuids = new Set(topExpenseAccounts.map((a) => a.guid));
  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  // Build path parts — stop at any top-level expense account OR root
  function getExpensePath(account: GnuCashAccount): string[] {
    const parts: string[] = [account.name];
    let current = account;
    while (
      current.parent_guid &&
      !topExpenseGuids.has(current.parent_guid) &&
      current.parent_guid !== rootAccount!.guid
    ) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts;
  }

  // Assign colors — children of ALL top-level expense accounts
  const topLevelChildren = accounts.filter(
    (a) => topExpenseGuids.has(a.parent_guid!)
  );
  // Shades of the sage green theme color (#6C9B8B)
  const colorPalette = [
    "#4A7A6B", "#5C8C7C", "#6C9B8B", "#7DAA9A", "#8FB9A9",
    "#A0C8B8", "#B2D7C8", "#C3E5D7", "#D5F0E4", "#E0F5EC",
  ];
  const colorMap: Record<string, string> = {};
  topLevelChildren.forEach((cat, i) => {
    colorMap[cat.name] = colorPalette[i % colorPalette.length];
  });

  // Get all expense accounts (exclude the top-level container accounts themselves)
  const expenseAccounts = accounts.filter(
    (a) => a.account_type === "EXPENSE" && !topExpenseGuids.has(a.guid)
  );

  // Get monthly totals per individual expense account
  const monthly: MonthlyExpenseByCategory[] = [];
  const allTimeTotals = new Map<string, number>();

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        strftime('%Y-%m', t.post_date) AS month,
        SUM(CAST(s.value_num AS REAL) / s.value_denom) AS total
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'EXPENSE'
      GROUP BY s.account_guid, strftime('%Y-%m', t.post_date)
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; total: number }[];

  for (const row of rows) {
    if (row.total <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    const pathParts = getExpensePath(account);
    const fullPath = pathParts.join(":");

    monthly.push({
      month: row.month,
      category: account.name,
      fullPath,
      pathParts,
      amount: row.total,
    });

    allTimeTotals.set(pathParts[0], (allTimeTotals.get(pathParts[0]) ?? 0) + row.total);
  }

  // Build the top-level category list
  const categories: ExpenseCategory[] = [...allTimeTotals.entries()]
    .map(([name, amount]) => ({
      name,
      fullPath: name,
      amount,
      color: colorMap[name],
    }))
    .sort((a, b) => b.amount - a.amount);

  return { categories, monthly, colors: colorMap };
}

function getExpenseTransactions(
  db: Database.Database,
  accounts: GnuCashAccount[]
): ExpenseTransaction[] {
  const rootAccount = accounts.find((a) => a.account_type === "ROOT");
  if (!rootAccount) return [];

  const topExpenseGuids = new Set(
    accounts.filter((a) => a.account_type === "EXPENSE" && a.parent_guid === rootAccount.guid).map((a) => a.guid)
  );
  if (topExpenseGuids.size === 0) return [];

  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  function getExpensePath(account: GnuCashAccount): string[] {
    const parts: string[] = [account.name];
    let current = account;
    while (
      current.parent_guid &&
      !topExpenseGuids.has(current.parent_guid) &&
      current.parent_guid !== rootAccount!.guid
    ) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts;
  }

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        t.post_date,
        t.description,
        CAST(s.value_num AS REAL) / s.value_denom AS amount
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'EXPENSE'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    if (row.amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    const pathParts = getExpensePath(account);
    const date = parseGnuCashDate(row.post_date);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    transactions.push({
      date: dateStr,
      description: row.description,
      accountName: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount: row.amount,
    });
  }

  return transactions;
}

function computeIncomeBreakdown(
  db: Database.Database,
  accounts: GnuCashAccount[]
): { monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const rootAccount = accounts.find((a) => a.account_type === "ROOT");
  if (!rootAccount) return { monthly: [], colors: {} };

  const topIncomeAccounts = accounts.filter(
    (a) => a.account_type === "INCOME" && a.parent_guid === rootAccount.guid
  );
  if (topIncomeAccounts.length === 0) return { monthly: [], colors: {} };

  const topIncomeGuids = new Set(topIncomeAccounts.map((a) => a.guid));
  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  function getIncomePath(account: GnuCashAccount): string[] {
    const parts: string[] = [account.name];
    let current = account;
    while (
      current.parent_guid &&
      !topIncomeGuids.has(current.parent_guid) &&
      current.parent_guid !== rootAccount!.guid
    ) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts;
  }

  // Color palette — blue tones to distinguish from expense greens
  const topLevelChildren = accounts.filter(
    (a) => topIncomeGuids.has(a.parent_guid!)
  );
  const colorPalette = [
    "#3B6B8A", "#4A7A9A", "#5889A9", "#6798B8", "#76A7C7",
    "#85B6D6", "#94C5E5", "#A3D0EE", "#B8DCF3", "#CDE8F8",
  ];
  const colorMap: Record<string, string> = {};
  topLevelChildren.forEach((cat, i) => {
    colorMap[cat.name] = colorPalette[i % colorPalette.length];
  });

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        strftime('%Y-%m', t.post_date) AS month,
        SUM(CAST(s.value_num AS REAL) / s.value_denom) AS total
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'INCOME'
      GROUP BY s.account_guid, strftime('%Y-%m', t.post_date)
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; total: number }[];

  const monthly: MonthlyExpenseByCategory[] = [];
  for (const row of rows) {
    // Income splits are negative in GNUCash — negate for positive display
    const amount = -row.total;
    if (amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topIncomeGuids.has(account.guid)) continue;

    const pathParts = getIncomePath(account);
    monthly.push({
      month: row.month,
      category: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount,
    });
  }

  return { monthly, colors: colorMap };
}

function getIncomeTransactions(
  db: Database.Database,
  accounts: GnuCashAccount[]
): ExpenseTransaction[] {
  const rootAccount = accounts.find((a) => a.account_type === "ROOT");
  if (!rootAccount) return [];

  const topIncomeGuids = new Set(
    accounts.filter((a) => a.account_type === "INCOME" && a.parent_guid === rootAccount.guid).map((a) => a.guid)
  );
  if (topIncomeGuids.size === 0) return [];

  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  function getIncomePath(account: GnuCashAccount): string[] {
    const parts: string[] = [account.name];
    let current = account;
    while (
      current.parent_guid &&
      !topIncomeGuids.has(current.parent_guid) &&
      current.parent_guid !== rootAccount!.guid
    ) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts;
  }

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        t.post_date,
        t.description,
        CAST(s.value_num AS REAL) / s.value_denom AS amount
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'INCOME'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    // Income splits are negative — negate for positive display
    const amount = -row.amount;
    if (amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topIncomeGuids.has(account.guid)) continue;

    const pathParts = getIncomePath(account);
    const date = parseGnuCashDate(row.post_date);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    transactions.push({
      date: dateStr,
      description: row.description,
      accountName: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount,
    });
  }

  return transactions;
}

function computeInvestments(
  db: Database.Database,
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[],
  prices: GnuCashPrice[]
): InvestmentHolding[] {
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));

  // Latest price per commodity
  const latestPriceMap = new Map<string, number>();
  const seenCommodities = new Set<string>();
  for (const p of prices) {
    if (!seenCommodities.has(p.commodity_guid)) {
      seenCommodities.add(p.commodity_guid);
      latestPriceMap.set(p.commodity_guid, p.value_num / p.value_denom);
    }
  }

  // Price 12 months ago per commodity
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const price12mMap = new Map<string, number>();
  for (const p of prices) {
    const pDate = parseGnuCashDate(p.date);
    if (pDate <= twelveMonthsAgo && !price12mMap.has(p.commodity_guid)) {
      price12mMap.set(p.commodity_guid, p.value_num / p.value_denom);
    }
  }

  // Holdings from splits
  const holdings = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.name AS account_name,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held,
        SUM(CAST(s.value_num AS REAL) / s.value_denom) AS cost_basis
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY a.guid`
    )
    .all() as {
    account_guid: string;
    account_name: string;
    commodity_guid: string;
    shares_held: number;
    cost_basis: number;
  }[];

  return holdings.map((h) => {
    const commodity = commodityMap.get(h.commodity_guid);
    const latestPrice = latestPriceMap.get(h.commodity_guid) ?? 0;
    const price12m = price12mMap.get(h.commodity_guid);
    const marketValue = h.shares_held * latestPrice;
    const gainLoss = marketValue - h.cost_basis;
    const gainLossPct =
      h.cost_basis !== 0 ? (gainLoss / Math.abs(h.cost_basis)) * 100 : 0;

    let change12mPct: number | null = null;
    if (price12m && price12m > 0) {
      change12mPct = ((latestPrice - price12m) / price12m) * 100;
    }

    return {
      accountName: h.account_name,
      ticker: commodity?.mnemonic ?? "???",
      sharesHeld: h.shares_held,
      costBasis: h.cost_basis,
      marketValue,
      gainLoss,
      gainLossPct,
      change12m: change12mPct !== null ? latestPrice - (price12m ?? 0) : null,
      change12mPct,
    };
  });
}

function computeInvestmentValueSeries(
  db: Database.Database,
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[]
): MonthlyInvestmentValue[] {
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));

  // Get all investment splits with dates, grouped by account and month
  // This gives us cumulative shares and cost basis at each month end
  const splits = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.name AS account_name,
        a.commodity_guid,
        strftime('%Y-%m', t.post_date) AS month,
        CAST(s.quantity_num AS REAL) / s.quantity_denom AS shares,
        CAST(s.value_num AS REAL) / s.value_denom AS cost
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      ORDER BY t.post_date`
    )
    .all() as { account_guid: string; account_name: string; commodity_guid: string; month: string; shares: number; cost: number }[];

  // Build cumulative shares and cost per account per month
  const accountMonthly = new Map<string, Map<string, { shares: number; cost: number; commodity_guid: string }>>();
  for (const s of splits) {
    if (!accountMonthly.has(s.account_guid)) {
      accountMonthly.set(s.account_guid, new Map());
    }
    const months = accountMonthly.get(s.account_guid)!;
    const existing = months.get(s.month);
    if (existing) {
      existing.shares += s.shares;
      existing.cost += s.cost;
    } else {
      months.set(s.month, { shares: s.shares, cost: s.cost, commodity_guid: s.commodity_guid });
    }
  }

  // Get all prices sorted by date
  const allPrices = db
    .prepare(
      `SELECT commodity_guid, strftime('%Y-%m', date) AS month, CAST(value_num AS REAL) / value_denom AS price
      FROM prices
      ORDER BY date`
    )
    .all() as { commodity_guid: string; month: string; price: number }[];

  // Build latest price per commodity per month
  const priceByMonth = new Map<string, Map<string, number>>();
  for (const p of allPrices) {
    if (!priceByMonth.has(p.commodity_guid)) {
      priceByMonth.set(p.commodity_guid, new Map());
    }
    priceByMonth.get(p.commodity_guid)!.set(p.month, p.price);
  }

  // Collect all months across all accounts
  const allMonths = new Set<string>();
  for (const months of accountMonthly.values()) {
    for (const m of months.keys()) allMonths.add(m);
  }
  for (const months of priceByMonth.values()) {
    for (const m of months.keys()) allMonths.add(m);
  }
  const sortedMonths = [...allMonths].sort();

  // For each account, compute cumulative shares/cost at each month, then value = shares × price
  const result: MonthlyInvestmentValue[] = [];

  for (const [accountGuid, monthlyData] of accountMonthly) {
    // Find the ticker for this account
    const firstEntry = [...monthlyData.values()][0];
    if (!firstEntry) continue;
    const commodity = commodityMap.get(firstEntry.commodity_guid);
    const ticker = commodity?.mnemonic ?? "???";
    const commodityPrices = priceByMonth.get(firstEntry.commodity_guid);

    let cumulativeShares = 0;
    let cumulativeCost = 0;
    let lastKnownPrice = 0;

    for (const month of sortedMonths) {
      const delta = monthlyData.get(month);
      if (delta) {
        cumulativeShares += delta.shares;
        cumulativeCost += delta.cost;
      }

      const priceThisMonth = commodityPrices?.get(month);
      if (priceThisMonth !== undefined) {
        lastKnownPrice = priceThisMonth;
      }

      // Only emit months where this account has had activity or has a position
      if (cumulativeShares === 0 && cumulativeCost === 0 && !delta) continue;

      result.push({
        month,
        ticker,
        value: cumulativeShares * lastKnownPrice,
        costBasis: cumulativeCost,
      });
    }
  }

  return result;
}

function computeTopBalances(
  db: Database.Database,
  accounts: GnuCashAccount[],
  commodities: GnuCashCommodity[],
  investments: InvestmentHolding[]
): TopBalance[] {
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));
  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  // Build full path for an account
  function buildPath(account: GnuCashAccount): string {
    const parts: string[] = [account.name];
    let current = account;
    while (current.parent_guid) {
      const parent = accountMap.get(current.parent_guid);
      if (!parent || parent.account_type === "ROOT") break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts.join(":");
  }

  // Investment market values keyed by account guid
  const investmentValueMap = new Map<string, number>();
  // We need per-account market values, not the grouped ones
  const invRows = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.name AS account_name,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY a.guid
      HAVING shares_held != 0`
    )
    .all() as { account_guid: string; account_name: string; commodity_guid: string; shares_held: number }[];

  // Get latest prices
  const latestPrices = db
    .prepare(
      `SELECT commodity_guid, CAST(value_num AS REAL) / value_denom AS price
       FROM prices p1
       WHERE date = (SELECT MAX(date) FROM prices p2 WHERE p2.commodity_guid = p1.commodity_guid)`
    )
    .all() as { commodity_guid: string; price: number }[];
  const priceMap = new Map(latestPrices.map((p) => [p.commodity_guid, p.price]));

  for (const row of invRows) {
    const price = priceMap.get(row.commodity_guid) ?? 0;
    investmentValueMap.set(row.account_guid, row.shares_held * price);
  }

  // Determine base currency guid
  const book = db
    .prepare(`SELECT root_account_guid FROM books LIMIT 1`)
    .get() as { root_account_guid: string } | undefined;
  const rootAcct = book ? accounts.find((a) => a.guid === book.root_account_guid) : null;
  const baseCurrencyGuid = rootAcct?.commodity_guid ?? "";

  // Get balances for all non-investment asset/liability accounts
  // Use quantity (account's commodity) not value (transaction currency)
  // Exclude STOCK/MUTUAL (handled separately), ROOT, INCOME, EXPENSE, EQUITY
  const nonInvBalances = db
    .prepare(
      `SELECT
        s.account_guid,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance_in_commodity
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type NOT IN ('STOCK', 'MUTUAL', 'ROOT', 'INCOME', 'EXPENSE', 'EQUITY', 'TRADING')
        AND a.placeholder = 0
      GROUP BY s.account_guid`
    )
    .all() as { account_guid: string; commodity_guid: string; balance_in_commodity: number }[];

  // Build exchange rate map for foreign currencies -> base currency
  // Use latest price where commodity is the foreign currency and currency is the base
  const fxRateMap = new Map<string, number>();
  for (const p of latestPrices) {
    // price table: commodity_guid priced in currency_guid
    // We need: foreign currency -> base currency rate
    fxRateMap.set(p.commodity_guid, p.price);
  }
  // Also check reverse rates (base currency priced in foreign)
  const allFxPrices = db
    .prepare(
      `SELECT p.commodity_guid, p.currency_guid,
              CAST(p.value_num AS REAL) / p.value_denom AS price
       FROM prices p
       JOIN commodities c1 ON p.commodity_guid = c1.guid
       JOIN commodities c2 ON p.currency_guid = c2.guid
       WHERE c1.namespace = 'CURRENCY' AND c2.namespace = 'CURRENCY'
       ORDER BY p.date DESC`
    )
    .all() as { commodity_guid: string; currency_guid: string; price: number }[];

  // Build a proper fx map: foreign_currency_guid -> rate_to_base
  const fxToBase = new Map<string, number>();
  fxToBase.set(baseCurrencyGuid, 1.0); // base currency = 1
  for (const fx of allFxPrices) {
    if (fx.currency_guid === baseCurrencyGuid && !fxToBase.has(fx.commodity_guid)) {
      // e.g. EUR priced in GBP = 0.85 means 1 EUR = 0.85 GBP
      fxToBase.set(fx.commodity_guid, fx.price);
    } else if (fx.commodity_guid === baseCurrencyGuid && !fxToBase.has(fx.currency_guid)) {
      // e.g. GBP priced in EUR = 1.18 means 1 GBP = 1.18 EUR, so 1 EUR = 1/1.18 GBP
      fxToBase.set(fx.currency_guid, 1 / fx.price);
    }
  }

  const results: TopBalance[] = [];

  // Add non-investment accounts
  for (const row of nonInvBalances) {
    if (Math.abs(row.balance_in_commodity) < 0.01) continue;
    const account = accountMap.get(row.account_guid);
    if (!account) continue;
    const commodity = commodityMap.get(account.commodity_guid);
    const isForeignCurrency = account.commodity_guid !== baseCurrencyGuid
      && commodity?.namespace === "CURRENCY";

    let valueInBase = row.balance_in_commodity;
    if (isForeignCurrency) {
      const rate = fxToBase.get(account.commodity_guid) ?? 0;
      valueInBase = row.balance_in_commodity * rate;
    }

    if (Math.abs(valueInBase) < 0.01) continue;

    results.push({
      accountName: account.name,
      fullPath: buildPath(account),
      type: account.account_type,
      value: valueInBase,
      commodityMnemonic: commodity?.mnemonic ?? "???",
    });
  }

  // Add investment accounts (market value)
  for (const row of invRows) {
    const marketValue = investmentValueMap.get(row.account_guid) ?? 0;
    if (Math.abs(marketValue) < 0.01) continue;
    const account = accountMap.get(row.account_guid);
    if (!account) continue;
    const commodity = commodityMap.get(account.commodity_guid);
    results.push({
      accountName: account.name,
      fullPath: buildPath(account),
      type: account.account_type,
      value: marketValue,
      commodityMnemonic: commodity?.mnemonic ?? "???",
    });
  }

  // Sort: positives first (descending), then negatives (by absolute value descending)
  results.sort((a, b) => {
    if (a.value > 0 && b.value <= 0) return -1;
    if (a.value <= 0 && b.value > 0) return 1;
    // Both same sign — sort by absolute value descending
    return Math.abs(b.value) - Math.abs(a.value);
  });

  return results;
}

function getRecentTransactions(
  db: Database.Database,
  accounts: GnuCashAccount[]
): RecentTransaction[] {
  const accountMap = new Map(accounts.map((a) => [a.guid, a]));

  const rows = db
    .prepare(
      `SELECT
        t.post_date,
        t.description,
        s.value_num,
        s.value_denom,
        s.account_guid,
        s.reconcile_state,
        s.tx_guid
      FROM splits s
      JOIN transactions t ON s.tx_guid = t.guid
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('BANK', 'CASH', 'ASSET', 'CREDIT', 'LIABILITY')
      ORDER BY t.post_date DESC
      LIMIT 50`
    )
    .all() as {
    post_date: string;
    description: string;
    value_num: number;
    value_denom: number;
    account_guid: string;
    reconcile_state: string;
    tx_guid: string;
  }[];

  return rows.map((row) => {
    const account = accountMap.get(row.account_guid);
    // Find the counter-account (the "category") for this transaction
    const counterSplit = db
      .prepare(
        `SELECT s.account_guid FROM splits s
         JOIN accounts a ON s.account_guid = a.guid
         WHERE s.tx_guid = ? AND s.account_guid != ?
         LIMIT 1`
      )
      .get(row.tx_guid, row.account_guid) as
      | { account_guid: string }
      | undefined;
    const category = counterSplit
      ? accountMap.get(counterSplit.account_guid)
      : null;

    return {
      date: parseGnuCashDate(row.post_date).toISOString(),
      description: row.description,
      amount: row.value_num / row.value_denom,
      accountName: account?.name ?? "Unknown",
      categoryName: category?.name ?? "Split",
      reconciled: row.reconcile_state === "y",
    };
  });
}

function getUpcomingBills(db: Database.Database): UpcomingBill[] {
  // Check if schedxactions table exists
  const tableCheck = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schedxactions'`
    )
    .get() as { name: string } | undefined;

  if (!tableCheck) return [];

  const rows = db
    .prepare(
      `SELECT
        sx.guid, sx.name, sx.enabled, sx.start_date, sx.last_occur,
        r.recurrence_mult, r.recurrence_period_type, r.recurrence_period_start
      FROM schedxactions sx
      LEFT JOIN recurrences r ON r.obj_guid = sx.guid
      WHERE sx.enabled = 1
      ORDER BY sx.name`
    )
    .all() as {
    guid: string;
    name: string;
    enabled: number;
    start_date: string;
    last_occur: string | null;
    recurrence_mult: number | null;
    recurrence_period_type: string | null;
    recurrence_period_start: string | null;
  }[];

  return rows.map((row) => {
    let nextDate = row.start_date;
    if (row.last_occur && row.recurrence_mult && row.recurrence_period_type) {
      const last = parseGnuCashDate(row.last_occur);
      const mult = row.recurrence_mult;
      switch (row.recurrence_period_type) {
        case "month":
          last.setMonth(last.getMonth() + mult);
          break;
        case "week":
          last.setDate(last.getDate() + mult * 7);
          break;
        case "day":
          last.setDate(last.getDate() + mult);
          break;
        case "year":
          last.setFullYear(last.getFullYear() + mult);
          break;
      }
      nextDate = last.toISOString().split("T")[0];
    }

    return {
      name: row.name,
      nextDate,
      amount: null, // Scheduled transaction amounts require reading template splits
      enabled: row.enabled === 1,
    };
  });
}
