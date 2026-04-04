import type {
  DashboardData,
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
  LedgerTransaction,
  LedgerSplit,
  BudgetData,
  BudgetCategoryRow,
} from "@/lib/types/gnucash";

// Seeded PRNG for reproducible "random" data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const COLORS = [
  "#6C9B8B", "#E87C6B", "#E8B86B", "#7B93DB", "#C47BDB",
  "#5BB5A6", "#DB7B93", "#A6C45B", "#DB9A5B", "#5B8DC4",
  "#C4A65B", "#8B6C9B",
];

export function generateDemoData(): DashboardData {
  const rand = seededRandom(42);
  const currency = "GBP";
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Helper: random in range
  const r = (min: number, max: number) => min + rand() * (max - min);
  const ri = (min: number, max: number) => Math.round(r(min, max));
  const guid = () => Math.random().toString(36).slice(2, 18);

  // --- Chart of Accounts ---
  const expenseAccounts = [
    { name: "Housing", children: ["Mortgage", "Council Tax", "Insurance", "Maintenance"] },
    { name: "Food", children: ["Groceries", "Restaurants", "Takeaway"] },
    { name: "Transport", children: ["Fuel", "Car Insurance", "Parking", "Public Transport"] },
    { name: "Utilities", children: ["Electric", "Gas", "Water", "Internet", "Mobile"] },
    { name: "Entertainment", children: ["Subscriptions", "Cinema", "Hobbies"] },
    { name: "Health", children: ["Dental", "Optician", "Pharmacy"] },
    { name: "Shopping", children: ["Clothing", "Electronics", "Home"] },
    { name: "Personal", children: ["Haircut", "Gifts"] },
  ];

  const incomeAccounts = [
    { name: "Salary", children: [] as string[] },
    { name: "Freelance", children: [] as string[] },
    { name: "Dividends", children: [] as string[] },
    { name: "Interest", children: [] as string[] },
  ];

  const assetAccounts = [
    { name: "Current Account", type: "BANK", balance: ri(3000, 8000) },
    { name: "Savings Account", type: "BANK", balance: ri(15000, 35000) },
    { name: "Cash", type: "CASH", balance: ri(50, 300) },
    { name: "ISA", type: "BANK", balance: ri(20000, 50000) },
  ];

  const investmentAccounts = [
    { name: "Vanguard FTSE 100", ticker: "VUKE", shares: ri(100, 500), costPerShare: r(25, 35), currentPrice: r(30, 40) },
    { name: "Vanguard S&P 500", ticker: "VUSA", shares: ri(50, 200), costPerShare: r(55, 70), currentPrice: r(65, 80) },
    { name: "iShares Global Clean Energy", ticker: "INRG", shares: ri(80, 300), costPerShare: r(8, 12), currentPrice: r(9, 14) },
    { name: "Legal & General FTSE All-World", ticker: "LGAG", shares: ri(200, 800), costPerShare: r(3, 5), currentPrice: r(4, 6) },
  ];

  const liabilityAccounts = [
    { name: "Mortgage", type: "LIABILITY", balance: -ri(150000, 250000) },
    { name: "Credit Card", type: "CREDIT", balance: -ri(200, 2000) },
  ];

  // --- Monthly expense amounts (realistic GBP ranges) ---
  const expenseRanges: Record<string, [number, number]> = {
    "Mortgage": [900, 1200], "Council Tax": [120, 180], "Insurance": [30, 50], "Maintenance": [0, 200],
    "Groceries": [250, 450], "Restaurants": [40, 150], "Takeaway": [20, 80],
    "Fuel": [80, 160], "Car Insurance": [40, 60], "Parking": [10, 30], "Public Transport": [20, 60],
    "Electric": [60, 120], "Gas": [40, 100], "Water": [25, 40], "Internet": [30, 45], "Mobile": [15, 30],
    "Subscriptions": [20, 50], "Cinema": [0, 30], "Hobbies": [10, 60],
    "Dental": [0, 80], "Optician": [0, 40], "Pharmacy": [5, 25],
    "Clothing": [20, 120], "Electronics": [0, 150], "Home": [10, 80],
    "Haircut": [0, 40], "Gifts": [0, 100],
  };

  const incomeRanges: Record<string, [number, number]> = {
    "Salary": [3200, 3800],
    "Freelance": [0, 800],
    "Dividends": [0, 200],
    "Interest": [20, 80],
  };

  // Generate 24 months of history
  const months: string[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // --- Expense data per month ---
  const allExpenseLeaves: string[] = [];
  const expenseFullPaths: Record<string, string> = {};
  const expensePathParts: Record<string, string[]> = {};
  for (const cat of expenseAccounts) {
    for (const child of cat.children) {
      allExpenseLeaves.push(child);
      expenseFullPaths[child] = `${cat.name}:${child}`;
      expensePathParts[child] = [cat.name, child];
    }
  }

  const monthlyExpensesByCategory: MonthlyExpenseByCategory[] = [];
  const expenseTransactions: ExpenseTransaction[] = [];
  const monthlyExpenseTotals: Record<string, number> = {};
  const monthlyIncomeTotals: Record<string, number> = {};

  for (const month of months) {
    let monthExpenseTotal = 0;
    for (const leaf of allExpenseLeaves) {
      const [min, max] = expenseRanges[leaf] ?? [10, 50];
      const amount = Math.round(r(min, max) * 100) / 100;
      if (amount <= 0) continue;
      monthExpenseTotal += amount;
      monthlyExpensesByCategory.push({
        month,
        category: leaf,
        fullPath: expenseFullPaths[leaf],
        pathParts: expensePathParts[leaf],
        amount,
      });

      // Generate 1-4 transactions per category per month
      const txCount = ri(1, Math.min(4, Math.ceil(amount / 30)));
      const txAmounts = Array.from({ length: txCount }, () => rand());
      const txSum = txAmounts.reduce((s, v) => s + v, 0);
      for (let t = 0; t < txCount; t++) {
        const txAmount = Math.round((amount * txAmounts[t] / txSum) * 100) / 100;
        const day = ri(1, 28);
        expenseTransactions.push({
          date: `${month}-${String(day).padStart(2, "0")}`,
          description: getExpenseDescription(leaf, rand),
          accountName: leaf,
          fullPath: expenseFullPaths[leaf],
          pathParts: expensePathParts[leaf],
          amount: txAmount,
        });
      }
    }
    monthlyExpenseTotals[month] = monthExpenseTotal;
  }

  // --- Income data per month ---
  const monthlyIncomeByCategory: MonthlyExpenseByCategory[] = [];
  const incomeTransactions: ExpenseTransaction[] = [];

  for (const month of months) {
    let monthIncomeTotal = 0;
    for (const acc of incomeAccounts) {
      const [min, max] = incomeRanges[acc.name] ?? [0, 100];
      const amount = Math.round(r(min, max) * 100) / 100;
      if (amount <= 0) continue;
      monthIncomeTotal += amount;
      monthlyIncomeByCategory.push({
        month,
        category: acc.name,
        fullPath: acc.name,
        pathParts: [acc.name],
        amount,
      });
      incomeTransactions.push({
        date: `${month}-${String(ri(1, 5)).padStart(2, "0")}`,
        description: acc.name === "Salary" ? "Monthly salary" : `${acc.name} payment`,
        accountName: acc.name,
        fullPath: acc.name,
        pathParts: [acc.name],
        amount,
      });
    }
    monthlyIncomeTotals[month] = monthIncomeTotal;
  }

  // --- Expense breakdown (hierarchical) ---
  const expenseBreakdown: ExpenseCategory[] = expenseAccounts.map((cat, ci) => {
    const children = cat.children.map((child, chi) => {
      const total = monthlyExpensesByCategory
        .filter((e) => e.category === child)
        .reduce((s, e) => s + e.amount, 0);
      return { name: child, fullPath: `${cat.name}:${child}`, amount: Math.round(total * 100) / 100, color: COLORS[(ci * 4 + chi) % COLORS.length] };
    });
    const catTotal = children.reduce((s, c) => s + c.amount, 0);
    return { name: cat.name, fullPath: cat.name, amount: Math.round(catTotal * 100) / 100, color: COLORS[ci % COLORS.length], children };
  });

  const expenseCategoryColors: Record<string, string> = {};
  const incomeCategoryColors: Record<string, string> = {};
  expenseAccounts.forEach((cat, i) => { expenseCategoryColors[cat.name] = COLORS[i % COLORS.length]; });
  incomeAccounts.forEach((acc, i) => { incomeCategoryColors[acc.name] = COLORS[i % COLORS.length]; });

  // --- Net worth series ---
  let runningAssets = ri(60000, 90000);
  let runningLiabilities = ri(150000, 250000);
  const netWorthSeries: MonthlyNetWorth[] = months.map((month) => {
    const income = monthlyIncomeTotals[month] ?? 0;
    const expenses = monthlyExpenseTotals[month] ?? 0;
    runningAssets += (income - expenses) + ri(-200, 500);
    runningLiabilities -= ri(300, 600); // slowly paying off mortgage
    return {
      month,
      assets: Math.round(runningAssets),
      liabilities: Math.round(Math.abs(runningLiabilities)),
      netWorth: Math.round(runningAssets - Math.abs(runningLiabilities)),
    };
  });

  // --- Cash flow series ---
  const cashFlowSeries: MonthlyCashFlow[] = months.map((month) => {
    const income = Math.round((monthlyIncomeTotals[month] ?? 0) * 100) / 100;
    const expenses = Math.round((monthlyExpenseTotals[month] ?? 0) * 100) / 100;
    return { month, income, expenses, net: Math.round((income - expenses) * 100) / 100 };
  });

  // --- Investments ---
  const investments: InvestmentHolding[] = investmentAccounts.map((inv) => {
    const costBasis = Math.round(inv.shares * inv.costPerShare * 100) / 100;
    const marketValue = Math.round(inv.shares * inv.currentPrice * 100) / 100;
    const gainLoss = Math.round((marketValue - costBasis) * 100) / 100;
    const gainLossPct = Math.round((gainLoss / costBasis) * 10000) / 100;
    return {
      accountName: inv.name,
      ticker: inv.ticker,
      sharesHeld: inv.shares,
      costBasis,
      marketValue,
      gainLoss,
      gainLossPct,
      change12m: Math.round(r(-500, 2000) * 100) / 100,
      change12mPct: Math.round(r(-5, 15) * 100) / 100,
    };
  });

  const investmentValueSeries: MonthlyInvestmentValue[] = [];
  for (const inv of investmentAccounts) {
    let price = inv.costPerShare;
    let shares = 0;
    const monthlyBuy = Math.floor(inv.shares / 24);
    for (const month of months) {
      shares += monthlyBuy;
      price *= 1 + r(-0.03, 0.05);
      investmentValueSeries.push({
        month,
        ticker: inv.ticker,
        value: Math.round(shares * price * 100) / 100,
        costBasis: Math.round(shares * inv.costPerShare * 100) / 100,
      });
    }
  }

  // --- Top balances ---
  const topBalances: TopBalance[] = [
    ...assetAccounts.map((a) => ({
      accountName: a.name, fullPath: `Assets:${a.name}`, type: a.type,
      value: a.balance, commodityMnemonic: currency,
    })),
    ...investmentAccounts.map((inv) => ({
      accountName: inv.name, fullPath: `Assets:Investments:${inv.name}`, type: "STOCK" as const,
      value: Math.round(inv.shares * inv.currentPrice * 100) / 100, commodityMnemonic: inv.ticker,
    })),
    ...liabilityAccounts.map((a) => ({
      accountName: a.name, fullPath: `Liabilities:${a.name}`, type: a.type,
      value: a.balance, commodityMnemonic: currency,
    })),
  ];

  // --- Recent transactions ---
  const recentTransactions: RecentTransaction[] = expenseTransactions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: -tx.amount,
      accountName: "Current Account",
      categoryName: tx.fullPath,
      reconciled: rand() > 0.3,
    }));

  // --- Upcoming bills ---
  const upcomingBills: UpcomingBill[] = [
    { name: "Mortgage Payment", nextDate: nextMonthDate(1), amount: ri(900, 1200), enabled: true },
    { name: "Council Tax", nextDate: nextMonthDate(3), amount: ri(120, 180), enabled: true },
    { name: "Car Insurance", nextDate: nextMonthDate(15), amount: ri(40, 60), enabled: true },
    { name: "Internet", nextDate: nextMonthDate(10), amount: ri(30, 45), enabled: true },
    { name: "Mobile Phone", nextDate: nextMonthDate(20), amount: ri(15, 30), enabled: true },
    { name: "Gym Membership", nextDate: nextMonthDate(1), amount: 35, enabled: false },
  ];

  // --- Account tree ---
  const rootGuid = guid();
  const accounts: AccountNode[] = buildAccountTree(
    rootGuid, expenseAccounts, incomeAccounts, assetAccounts,
    investmentAccounts, liabilityAccounts, currency, guid
  );

  // --- Current stats ---
  const lastMonth = months[months.length - 1];
  const currentMonthIncome = Math.round((monthlyIncomeTotals[lastMonth] ?? 0) * 100) / 100;
  const currentMonthExpenses = Math.round((monthlyExpenseTotals[lastMonth] ?? 0) * 100) / 100;
  const currentNetWorth = netWorthSeries[netWorthSeries.length - 1].netWorth;
  const savingsRate = currentMonthIncome > 0
    ? Math.round(((currentMonthIncome - currentMonthExpenses) / currentMonthIncome) * 10000) / 100
    : 0;

  // --- Ledger transactions (double-entry from expense + income transactions) ---
  const ledgerTransactions: LedgerTransaction[] = [];

  // Convert expense transactions into double-entry ledger entries (Current Account -> Expense)
  for (const tx of expenseTransactions) {
    ledgerTransactions.push({
      guid: guid(),
      date: tx.date,
      description: tx.description,
      num: "",
      splits: [
        {
          accountGuid: "",
          accountName: tx.accountName,
          accountFullPath: `Expenses:${tx.fullPath}`,
          accountType: "EXPENSE",
          memo: "",
          reconcileState: rand() > 0.3 ? "y" : "n",
          amount: tx.amount,
          quantity: tx.amount,
          commodityMnemonic: currency,
        },
        {
          accountGuid: "",
          accountName: "Current Account",
          accountFullPath: "Assets:Current Account",
          accountType: "BANK",
          memo: "",
          reconcileState: rand() > 0.3 ? "y" : "n",
          amount: -tx.amount,
          quantity: -tx.amount,
          commodityMnemonic: currency,
        },
      ],
    });
  }

  // Convert income transactions into double-entry ledger entries (Income -> Current Account)
  for (const tx of incomeTransactions) {
    ledgerTransactions.push({
      guid: guid(),
      date: tx.date,
      description: tx.description,
      num: tx.accountName === "Salary" ? String(ri(1000, 9999)) : "",
      splits: [
        {
          accountGuid: "",
          accountName: "Current Account",
          accountFullPath: "Assets:Current Account",
          accountType: "BANK",
          memo: "",
          reconcileState: "y",
          amount: tx.amount,
          quantity: tx.amount,
          commodityMnemonic: currency,
        },
        {
          accountGuid: "",
          accountName: tx.accountName,
          accountFullPath: `Income:${tx.fullPath}`,
          accountType: "INCOME",
          memo: "",
          reconcileState: "y",
          amount: -tx.amount,
          quantity: -tx.amount,
          commodityMnemonic: currency,
        },
      ],
    });
  }

  // Add a few transfer transactions (savings, mortgage payments)
  for (const month of months) {
    const savingsAmount = ri(200, 800);
    ledgerTransactions.push({
      guid: guid(),
      date: `${month}-${String(ri(1, 5)).padStart(2, "0")}`,
      description: "Transfer to savings",
      num: "",
      splits: [
        {
          accountGuid: "",
          accountName: "Savings Account",
          accountFullPath: "Assets:Savings Account",
          accountType: "BANK",
          memo: "Monthly savings",
          reconcileState: "y",
          amount: savingsAmount,
          quantity: savingsAmount,
          commodityMnemonic: currency,
        },
        {
          accountGuid: "",
          accountName: "Current Account",
          accountFullPath: "Assets:Current Account",
          accountType: "BANK",
          memo: "Monthly savings",
          reconcileState: "y",
          amount: -savingsAmount,
          quantity: -savingsAmount,
          commodityMnemonic: currency,
        },
      ],
    });
  }

  // Sort by date descending
  ledgerTransactions.sort((a, b) => b.date.localeCompare(a.date));

  // --- Budget data ---
  const budgetData = generateBudgetData(
    expenseAccounts, incomeAccounts, expenseRanges, incomeRanges,
    monthlyExpensesByCategory, monthlyIncomeByCategory,
    months, currentYear, guid, rand
  );

  return {
    currency,
    currencyGuid: "",
    currencyFraction: 100,
    commodities: [],
    accounts,
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
    currentNetWorth,
    currentMonthIncome,
    currentMonthExpenses,
    savingsRate,
    budgetData,
    ledgerTransactions,
  };
}

function nextMonthDate(day: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

function getExpenseDescription(category: string, rand: () => number): string {
  const descs: Record<string, string[]> = {
    "Mortgage": ["Mortgage payment"],
    "Council Tax": ["Council tax DD"],
    "Insurance": ["Home insurance DD"],
    "Maintenance": ["Plumber", "B&Q supplies", "Electrician", "Garden centre"],
    "Groceries": ["Tesco", "Sainsbury's", "Aldi", "Lidl", "M&S Food", "Waitrose", "Co-op"],
    "Restaurants": ["Nando's", "Pizza Express", "Local pub", "Thai restaurant", "Indian takeaway"],
    "Takeaway": ["Deliveroo", "Just Eat", "Uber Eats"],
    "Fuel": ["Shell", "BP", "Tesco fuel", "Sainsbury's fuel"],
    "Car Insurance": ["Car insurance DD"],
    "Parking": ["NCP parking", "Council parking", "Parking meter"],
    "Public Transport": ["TfL", "Train ticket", "Bus fare"],
    "Electric": ["British Gas electric", "Octopus Energy"],
    "Gas": ["British Gas", "Octopus Energy gas"],
    "Water": ["Thames Water", "Water bill"],
    "Internet": ["BT broadband", "Virgin Media"],
    "Mobile": ["Three mobile", "EE", "Vodafone"],
    "Subscriptions": ["Netflix", "Spotify", "Amazon Prime", "Disney+"],
    "Cinema": ["Odeon", "Cineworld", "Vue cinema"],
    "Hobbies": ["Waterstones", "Hobby supplies", "Sports Direct"],
    "Dental": ["Dental checkup", "Dental hygienist"],
    "Optician": ["Specsavers", "Vision Express"],
    "Pharmacy": ["Boots", "Superdrug"],
    "Clothing": ["Primark", "H&M", "Next", "John Lewis"],
    "Electronics": ["Amazon", "Currys", "Apple Store"],
    "Home": ["IKEA", "Dunelm", "Argos"],
    "Haircut": ["Barber", "Hair salon"],
    "Gifts": ["Birthday gift", "Christmas gift", "Card Factory"],
  };
  const options = descs[category] ?? [`${category} payment`];
  return options[Math.floor(rand() * options.length)];
}

function generateBudgetData(
  expenseAccounts: { name: string; children: string[] }[],
  incomeAccounts: { name: string; children: string[] }[],
  expenseRanges: Record<string, [number, number]>,
  incomeRanges: Record<string, [number, number]>,
  monthlyExpenses: MonthlyExpenseByCategory[],
  monthlyIncome: MonthlyExpenseByCategory[],
  months: string[],
  currentYear: number,
  guidFn: () => string,
  rand: () => number,
): BudgetData {
  const budgetGuid = guidFn();
  const yearStr = currentYear.toString();
  const prevYearStr = (currentYear - 1).toString();

  // Build expense budget categories with sub-budgets
  const expenseCategories: BudgetCategoryRow[] = [];
  for (const cat of expenseAccounts) {
    const parentGuid = guidFn();
    const childRanges = cat.children.map((c) => expenseRanges[c] ?? [10, 50]);
    // Parent budget = slightly above sum of children (creates a small imbalance to demo the feature)
    const childMonthlyBudgets = childRanges.map(([min, max]) => Math.round((min + max) / 2));
    const parentMonthlyBudget = Math.round(childMonthlyBudgets.reduce((s, b) => s + b, 0) * 1.05);

    // Build child rows first
    const childRows: BudgetCategoryRow[] = cat.children.map((childName, ci) => {
      const childGuid = guidFn();
      const childMonthly = childMonthlyBudgets[ci];

      const periods = Array.from({ length: 12 }, (_, p) => {
        const monthStr = `${currentYear}-${String(p + 1).padStart(2, "0")}`;
        const prevMonthStr = `${currentYear - 1}-${String(p + 1).padStart(2, "0")}`;
        const actual: Record<string, number> = {};
        actual[yearStr] = Math.round(
          monthlyExpenses
            .filter((e) => e.month === monthStr && e.category === childName)
            .reduce((s, e) => s + e.amount, 0) * 100
        ) / 100;
        actual[prevYearStr] = Math.round(
          monthlyExpenses
            .filter((e) => e.month === prevMonthStr && e.category === childName)
            .reduce((s, e) => s + e.amount, 0) * 100
        ) / 100;
        return { period: p, budgeted: childMonthly, actual };
      });

      const totalBudgeted = childMonthly * 12;
      const totalActual = periods.reduce((s, p) => s + (p.actual[yearStr] ?? 0), 0);

      return {
        accountGuid: childGuid,
        accountName: childName,
        fullPath: `${cat.name}:${childName}`,
        budgeted: totalBudgeted,
        actual: Math.round(totalActual * 100) / 100,
        variance: Math.round((totalBudgeted - totalActual) * 100) / 100,
        variancePct: totalBudgeted > 0 ? Math.round(((totalBudgeted - totalActual) / totalBudgeted) * 10000) / 100 : 0,
        periods,
        parentAccountGuid: parentGuid,
        depth: 1,
        hasChildren: false,
        hasExplicitBudget: true,
        childBudgetTotal: 0,
        imbalance: 0,
      };
    });

    // Build parent row
    const parentPeriods = Array.from({ length: 12 }, (_, p) => {
      const monthStr = `${currentYear}-${String(p + 1).padStart(2, "0")}`;
      const prevMonthStr = `${currentYear - 1}-${String(p + 1).padStart(2, "0")}`;
      const actual: Record<string, number> = {};
      actual[yearStr] = Math.round(
        monthlyExpenses
          .filter((e) => e.month === monthStr && cat.children.includes(e.category))
          .reduce((s, e) => s + e.amount, 0) * 100
      ) / 100;
      actual[prevYearStr] = Math.round(
        monthlyExpenses
          .filter((e) => e.month === prevMonthStr && cat.children.includes(e.category))
          .reduce((s, e) => s + e.amount, 0) * 100
      ) / 100;
      return { period: p, budgeted: parentMonthlyBudget, actual };
    });

    const totalBudgeted = parentMonthlyBudget * 12;
    const totalActual = parentPeriods.reduce((s, p) => s + (p.actual[yearStr] ?? 0), 0);
    const childBudgetTotal = childRows.reduce((s, c) => s + c.budgeted, 0);

    expenseCategories.push({
      accountGuid: parentGuid,
      accountName: cat.name,
      fullPath: cat.name,
      budgeted: totalBudgeted,
      actual: Math.round(totalActual * 100) / 100,
      variance: Math.round((totalBudgeted - totalActual) * 100) / 100,
      variancePct: totalBudgeted > 0 ? Math.round(((totalBudgeted - totalActual) / totalBudgeted) * 10000) / 100 : 0,
      periods: parentPeriods,
      parentAccountGuid: null,
      depth: 0,
      hasChildren: true,
      hasExplicitBudget: true,
      childBudgetTotal,
      imbalance: totalBudgeted - childBudgetTotal,
    });
    expenseCategories.push(...childRows);
  }

  // Build income budget categories
  const incomeCategories: BudgetCategoryRow[] = incomeAccounts
    .filter((acc) => incomeRanges[acc.name]?.[1] > 100) // only budget meaningful income
    .map((acc) => {
      const accountGuid = guidFn();
      const [min, max] = incomeRanges[acc.name] ?? [0, 100];
      const monthlyTarget = Math.round((min + max) / 2 * 0.95); // target slightly below average

      const periods = Array.from({ length: 12 }, (_, p) => {
        const monthStr = `${currentYear}-${String(p + 1).padStart(2, "0")}`;
        const prevMonthStr = `${currentYear - 1}-${String(p + 1).padStart(2, "0")}`;
        const actual: Record<string, number> = {};
        actual[yearStr] = Math.round(
          monthlyIncome
            .filter((e) => e.month === monthStr && e.category === acc.name)
            .reduce((s, e) => s + e.amount, 0) * 100
        ) / 100;
        actual[prevYearStr] = Math.round(
          monthlyIncome
            .filter((e) => e.month === prevMonthStr && e.category === acc.name)
            .reduce((s, e) => s + e.amount, 0) * 100
        ) / 100;
        return { period: p, budgeted: monthlyTarget, actual };
      });

      const totalBudgeted = monthlyTarget * 12;
      const totalActual = periods.reduce((s, p) => s + (p.actual[yearStr] ?? 0), 0);

      return {
        accountGuid,
        accountName: acc.name,
        fullPath: acc.name,
        budgeted: totalBudgeted,
        actual: Math.round(totalActual * 100) / 100,
        variance: Math.round((totalBudgeted - totalActual) * 100) / 100,
        variancePct: totalBudgeted > 0 ? Math.round(((totalBudgeted - totalActual) / totalBudgeted) * 10000) / 100 : 0,
        periods,
        parentAccountGuid: null,
        depth: 0,
        hasChildren: false,
        hasExplicitBudget: true,
        childBudgetTotal: 0,
        imbalance: 0,
      };
    });

  const budgetEntry = { expenseCategories, incomeCategories };
  return {
    budgets: [{ guid: budgetGuid, name: "2026 Budget", description: "Annual household budget", numPeriods: 12 }],
    categoriesByBudget: { [budgetGuid]: budgetEntry },
    expenseCategories,
    incomeCategories,
    availableYears: [currentYear, currentYear - 1],
  };
}

function buildAccountTree(
  rootGuid: string,
  expenseAccounts: { name: string; children: string[] }[],
  incomeAccounts: { name: string; children: string[] }[],
  assetAccounts: { name: string; type: string; balance: number }[],
  investmentAccounts: { name: string; ticker: string; shares: number; costPerShare: number; currentPrice: number }[],
  liabilityAccounts: { name: string; type: string; balance: number }[],
  currency: string,
  guidFn: () => string,
): AccountNode[] {
  const tree: AccountNode[] = [];

  // Assets
  const assetsNode: AccountNode = {
    guid: guidFn(), name: "Assets", fullPath: "Assets", type: "ASSET",
    commodityGuid: "", commodityMnemonic: currency, parentGuid: rootGuid, hidden: false, placeholder: true, balance: 0, children: [],
  };
  for (const a of assetAccounts) {
    assetsNode.children.push({
      guid: guidFn(), name: a.name, fullPath: `Assets:${a.name}`, type: a.type,
      commodityGuid: "", commodityMnemonic: currency, parentGuid: assetsNode.guid, hidden: false, placeholder: false,
      balance: a.balance, children: [],
    });
  }
  const investmentsNode: AccountNode = {
    guid: guidFn(), name: "Investments", fullPath: "Assets:Investments", type: "ASSET",
    commodityGuid: "", commodityMnemonic: currency, parentGuid: assetsNode.guid, hidden: false, placeholder: true, balance: 0, children: [],
  };
  for (const inv of investmentAccounts) {
    investmentsNode.children.push({
      guid: guidFn(), name: inv.name, fullPath: `Assets:Investments:${inv.name}`, type: "STOCK",
      commodityGuid: "", commodityMnemonic: inv.ticker, parentGuid: investmentsNode.guid, hidden: false, placeholder: false,
      balance: Math.round(inv.shares * inv.currentPrice * 100) / 100, children: [],
    });
  }
  assetsNode.children.push(investmentsNode);
  assetsNode.balance = assetsNode.children.reduce((s, c) => s + c.balance, 0);
  tree.push(assetsNode);

  // Liabilities
  const liabNode: AccountNode = {
    guid: guidFn(), name: "Liabilities", fullPath: "Liabilities", type: "LIABILITY",
    commodityGuid: "", commodityMnemonic: currency, parentGuid: rootGuid, hidden: false, placeholder: true, balance: 0, children: [],
  };
  for (const l of liabilityAccounts) {
    liabNode.children.push({
      guid: guidFn(), name: l.name, fullPath: `Liabilities:${l.name}`, type: l.type,
      commodityGuid: "", commodityMnemonic: currency, parentGuid: liabNode.guid, hidden: false, placeholder: false,
      balance: l.balance, children: [],
    });
  }
  liabNode.balance = liabNode.children.reduce((s, c) => s + c.balance, 0);
  tree.push(liabNode);

  // Expenses
  const expNode: AccountNode = {
    guid: guidFn(), name: "Expenses", fullPath: "Expenses", type: "EXPENSE",
    commodityGuid: "", commodityMnemonic: currency, parentGuid: rootGuid, hidden: false, placeholder: true, balance: 0, children: [],
  };
  for (const cat of expenseAccounts) {
    const catNode: AccountNode = {
      guid: guidFn(), name: cat.name, fullPath: `Expenses:${cat.name}`, type: "EXPENSE",
      commodityGuid: "", commodityMnemonic: currency, parentGuid: expNode.guid, hidden: false, placeholder: true, balance: 0, children: [],
    };
    for (const child of cat.children) {
      catNode.children.push({
        guid: guidFn(), name: child, fullPath: `Expenses:${cat.name}:${child}`, type: "EXPENSE",
        commodityGuid: "", commodityMnemonic: currency, parentGuid: catNode.guid, hidden: false, placeholder: false, balance: 0, children: [],
      });
    }
    expNode.children.push(catNode);
  }
  tree.push(expNode);

  // Income
  const incNode: AccountNode = {
    guid: guidFn(), name: "Income", fullPath: "Income", type: "INCOME",
    commodityGuid: "", commodityMnemonic: currency, parentGuid: rootGuid, hidden: false, placeholder: true, balance: 0, children: [],
  };
  for (const acc of incomeAccounts) {
    incNode.children.push({
      guid: guidFn(), name: acc.name, fullPath: `Income:${acc.name}`, type: "INCOME",
      commodityGuid: "", commodityMnemonic: currency, parentGuid: incNode.guid, hidden: false, placeholder: false, balance: 0, children: [],
    });
  }
  tree.push(incNode);

  return tree;
}
