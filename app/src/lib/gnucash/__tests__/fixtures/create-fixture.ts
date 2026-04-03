/**
 * Creates a test .gnucash (SQLite) fixture file with known data
 * exercising all 11 domain modules.
 *
 * Run: npx tsx src/lib/gnucash/__tests__/fixtures/create-fixture.ts
 */
import Database from "better-sqlite3";
import path from "path";

const FIXTURE_PATH = path.join(__dirname, "test.gnucash");

const db = new Database(FIXTURE_PATH);

// -------------------------------------------------------------------
// Helper: deterministic GUIDs
// -------------------------------------------------------------------
let guidCounter = 0;
function guid(label: string): string {
  guidCounter++;
  // Pad to 32 hex chars (GNUCash uses 32-char hex GUIDs)
  const hex = guidCounter.toString(16).padStart(8, "0");
  return hex.repeat(4);
}

// Pre-generate all GUIDs so we can reference them across tables
const GUIDS = {
  // Commodities
  GBP: guid("GBP"),
  USD: guid("USD"),
  AAPL: guid("AAPL"),
  VWRL: guid("VWRL"),

  // Book
  book: guid("book"),

  // Accounts
  root: guid("root"),
  assets: guid("assets"),
  bank: guid("bank"),
  savings: guid("savings"),
  usdBank: guid("usd-bank"),
  liabilities: guid("liabilities"),
  creditCard: guid("credit-card"),
  income: guid("income"),
  salary: guid("salary"),
  freelance: guid("freelance"),
  expenses: guid("expenses"),
  food: guid("food"),
  groceries: guid("groceries"),
  restaurants: guid("restaurants"),
  utilities: guid("utilities"),
  electric: guid("electric"),
  water: guid("water"),
  equity: guid("equity"),
  openingBalances: guid("opening-balances"),
  investments: guid("investments"),
  aaplAccount: guid("aapl-account"),
  vwrlAccount: guid("vwrl-account"),
  trading: guid("trading"),

  // Transactions (we'll define many)
  txOpeningBank: guid("tx-opening-bank"),
  txOpeningSavings: guid("tx-opening-savings"),
  txSalaryJan: guid("tx-salary-jan"),
  txSalaryFeb: guid("tx-salary-feb"),
  txSalaryMar: guid("tx-salary-mar"),
  txFreelanceFeb: guid("tx-freelance-feb"),
  txGroceriesJan: guid("tx-groceries-jan"),
  txGroceriesFeb: guid("tx-groceries-feb"),
  txRestaurantJan: guid("tx-restaurant-jan"),
  txElectricJan: guid("tx-electric-jan"),
  txElectricFeb: guid("tx-electric-feb"),
  txWaterMar: guid("tx-water-mar"),
  txCreditCardPayment: guid("tx-cc-payment"),
  txBuyAAPL: guid("tx-buy-aapl"),
  txBuyVWRL: guid("tx-buy-vwrl"),
  txUsdDeposit: guid("tx-usd-deposit"),

  // Splits (auto-generated with transactions)
  // Prices
  priceAAPLJan: guid("price-aapl-jan"),
  priceAAPLFeb: guid("price-aapl-feb"),
  priceAAPLMar: guid("price-aapl-mar"),
  priceVWRLJan: guid("price-vwrl-jan"),
  priceVWRLMar: guid("price-vwrl-mar"),
  priceUSDGBPJan: guid("price-usd-gbp-jan"),
  priceUSDGBPMar: guid("price-usd-gbp-mar"),

  // Budget
  budget: guid("budget"),

  // Schedxactions
  sxRent: guid("sx-rent"),
  sxInternet: guid("sx-internet"),
  recRent: guid("rec-rent"),
  recInternet: guid("rec-internet"),
} as const;

// -------------------------------------------------------------------
// Schema: match GNUCash SQLite structure
// -------------------------------------------------------------------
db.exec(`
  CREATE TABLE books (
    guid TEXT PRIMARY KEY,
    root_account_guid TEXT NOT NULL,
    root_template_guid TEXT,
    num_periods INTEGER DEFAULT 0
  );

  CREATE TABLE commodities (
    guid TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    mnemonic TEXT NOT NULL,
    fullname TEXT DEFAULT '',
    cusip TEXT DEFAULT '',
    fraction INTEGER DEFAULT 100
  );

  CREATE TABLE accounts (
    guid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    commodity_guid TEXT NOT NULL,
    parent_guid TEXT,
    code TEXT DEFAULT '',
    description TEXT DEFAULT '',
    hidden INTEGER DEFAULT 0,
    placeholder INTEGER DEFAULT 0
  );

  CREATE TABLE transactions (
    guid TEXT PRIMARY KEY,
    currency_guid TEXT NOT NULL,
    num TEXT DEFAULT '',
    post_date TEXT NOT NULL,
    enter_date TEXT DEFAULT '',
    description TEXT DEFAULT ''
  );

  CREATE TABLE splits (
    guid TEXT PRIMARY KEY,
    tx_guid TEXT NOT NULL,
    account_guid TEXT NOT NULL,
    memo TEXT DEFAULT '',
    action TEXT DEFAULT '',
    reconcile_state TEXT DEFAULT 'n',
    value_num INTEGER NOT NULL,
    value_denom INTEGER NOT NULL DEFAULT 100,
    quantity_num INTEGER NOT NULL,
    quantity_denom INTEGER NOT NULL DEFAULT 100,
    lot_guid TEXT
  );

  CREATE TABLE prices (
    guid TEXT PRIMARY KEY,
    commodity_guid TEXT NOT NULL,
    currency_guid TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT DEFAULT '',
    type TEXT DEFAULT '',
    value_num INTEGER NOT NULL,
    value_denom INTEGER NOT NULL DEFAULT 100
  );

  CREATE TABLE schedxactions (
    guid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    start_date TEXT DEFAULT '',
    end_date TEXT,
    last_occur TEXT,
    num_occur INTEGER DEFAULT 0,
    rem_occur INTEGER DEFAULT 0,
    auto_create INTEGER DEFAULT 0
  );

  CREATE TABLE recurrences (
    id INTEGER PRIMARY KEY,
    obj_guid TEXT NOT NULL,
    recurrence_mult INTEGER DEFAULT 1,
    recurrence_period_type TEXT DEFAULT 'month',
    recurrence_period_start TEXT DEFAULT ''
  );

  CREATE TABLE budgets (
    guid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    num_periods INTEGER DEFAULT 12
  );

  CREATE TABLE budget_amounts (
    id INTEGER PRIMARY KEY,
    budget_guid TEXT NOT NULL,
    account_guid TEXT NOT NULL,
    period_num INTEGER NOT NULL,
    amount_num INTEGER NOT NULL,
    amount_denom INTEGER NOT NULL DEFAULT 100
  );
`);

// -------------------------------------------------------------------
// Data: Book
// -------------------------------------------------------------------
db.prepare(`INSERT INTO books (guid, root_account_guid) VALUES (?, ?)`).run(
  GUIDS.book,
  GUIDS.root
);

// -------------------------------------------------------------------
// Data: Commodities
// -------------------------------------------------------------------
const insertCommodity = db.prepare(
  `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`
);
insertCommodity.run(GUIDS.GBP, "CURRENCY", "GBP", "British Pound", 100);
insertCommodity.run(GUIDS.USD, "CURRENCY", "USD", "US Dollar", 100);
insertCommodity.run(GUIDS.AAPL, "NASDAQ", "AAPL", "Apple Inc", 10000);
insertCommodity.run(GUIDS.VWRL, "LSE", "VWRL", "Vanguard FTSE All-World", 10000);

// -------------------------------------------------------------------
// Data: Accounts (tree structure)
// -------------------------------------------------------------------
const insertAccount = db.prepare(
  `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`
);

// Root
insertAccount.run(GUIDS.root, "Root Account", "ROOT", GUIDS.GBP, null, 0);

// Assets
insertAccount.run(GUIDS.assets, "Assets", "ASSET", GUIDS.GBP, GUIDS.root, 1);
insertAccount.run(GUIDS.bank, "Current Account", "BANK", GUIDS.GBP, GUIDS.assets, 0);
insertAccount.run(GUIDS.savings, "Savings", "BANK", GUIDS.GBP, GUIDS.assets, 0);
insertAccount.run(GUIDS.usdBank, "USD Account", "BANK", GUIDS.USD, GUIDS.assets, 0);

// Liabilities
insertAccount.run(GUIDS.liabilities, "Liabilities", "LIABILITY", GUIDS.GBP, GUIDS.root, 1);
insertAccount.run(GUIDS.creditCard, "Credit Card", "CREDIT", GUIDS.GBP, GUIDS.liabilities, 0);

// Income
insertAccount.run(GUIDS.income, "Income", "INCOME", GUIDS.GBP, GUIDS.root, 1);
insertAccount.run(GUIDS.salary, "Salary", "INCOME", GUIDS.GBP, GUIDS.income, 0);
insertAccount.run(GUIDS.freelance, "Freelance", "INCOME", GUIDS.GBP, GUIDS.income, 0);

// Expenses
insertAccount.run(GUIDS.expenses, "Expenses", "EXPENSE", GUIDS.GBP, GUIDS.root, 1);
insertAccount.run(GUIDS.food, "Food", "EXPENSE", GUIDS.GBP, GUIDS.expenses, 1);
insertAccount.run(GUIDS.groceries, "Groceries", "EXPENSE", GUIDS.GBP, GUIDS.food, 0);
insertAccount.run(GUIDS.restaurants, "Restaurants", "EXPENSE", GUIDS.GBP, GUIDS.food, 0);
insertAccount.run(GUIDS.utilities, "Utilities", "EXPENSE", GUIDS.GBP, GUIDS.expenses, 1);
insertAccount.run(GUIDS.electric, "Electric", "EXPENSE", GUIDS.GBP, GUIDS.utilities, 0);
insertAccount.run(GUIDS.water, "Water", "EXPENSE", GUIDS.GBP, GUIDS.utilities, 0);

// Equity
insertAccount.run(GUIDS.equity, "Equity", "EQUITY", GUIDS.GBP, GUIDS.root, 1);
insertAccount.run(GUIDS.openingBalances, "Opening Balances", "EQUITY", GUIDS.GBP, GUIDS.equity, 0);

// Investments
insertAccount.run(GUIDS.investments, "Investments", "ASSET", GUIDS.GBP, GUIDS.assets, 1);
insertAccount.run(GUIDS.aaplAccount, "AAPL", "STOCK", GUIDS.AAPL, GUIDS.investments, 0);
insertAccount.run(GUIDS.vwrlAccount, "VWRL", "MUTUAL", GUIDS.VWRL, GUIDS.investments, 0);

// Trading account
insertAccount.run(GUIDS.trading, "Trading", "TRADING", GUIDS.GBP, GUIDS.root, 1);

// -------------------------------------------------------------------
// Data: Transactions & Splits
// -------------------------------------------------------------------
let splitCounter = 100;
function splitGuid(): string {
  splitCounter++;
  return splitCounter.toString(16).padStart(8, "0").repeat(4);
}

const insertTx = db.prepare(
  `INSERT INTO transactions (guid, currency_guid, num, post_date, enter_date, description) VALUES (?, ?, ?, ?, ?, ?)`
);
const insertSplit = db.prepare(
  `INSERT INTO splits (guid, tx_guid, account_guid, memo, reconcile_state, value_num, value_denom, quantity_num, quantity_denom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// Opening balance: bank = 5000 GBP
insertTx.run(GUIDS.txOpeningBank, GUIDS.GBP, "", "2025-01-01 00:00:00", "2025-01-01 00:00:00", "Opening Balance");
insertSplit.run(splitGuid(), GUIDS.txOpeningBank, GUIDS.bank, "", "y", 500000, 100, 500000, 100);
insertSplit.run(splitGuid(), GUIDS.txOpeningBank, GUIDS.openingBalances, "", "y", -500000, 100, -500000, 100);

// Opening balance: savings = 10000 GBP
insertTx.run(GUIDS.txOpeningSavings, GUIDS.GBP, "", "2025-01-01 00:00:00", "2025-01-01 00:00:00", "Opening Balance");
insertSplit.run(splitGuid(), GUIDS.txOpeningSavings, GUIDS.savings, "", "y", 1000000, 100, 1000000, 100);
insertSplit.run(splitGuid(), GUIDS.txOpeningSavings, GUIDS.openingBalances, "", "y", -1000000, 100, -1000000, 100);

// Salary: 3000 GBP/month (Jan, Feb, Mar 2025)
insertTx.run(GUIDS.txSalaryJan, GUIDS.GBP, "", "2025-01-28 00:00:00", "2025-01-28 00:00:00", "Salary January");
insertSplit.run(splitGuid(), GUIDS.txSalaryJan, GUIDS.bank, "", "c", 300000, 100, 300000, 100);
insertSplit.run(splitGuid(), GUIDS.txSalaryJan, GUIDS.salary, "", "c", -300000, 100, -300000, 100);

insertTx.run(GUIDS.txSalaryFeb, GUIDS.GBP, "", "2025-02-28 00:00:00", "2025-02-28 00:00:00", "Salary February");
insertSplit.run(splitGuid(), GUIDS.txSalaryFeb, GUIDS.bank, "", "c", 300000, 100, 300000, 100);
insertSplit.run(splitGuid(), GUIDS.txSalaryFeb, GUIDS.salary, "", "c", -300000, 100, -300000, 100);

insertTx.run(GUIDS.txSalaryMar, GUIDS.GBP, "", "2025-03-28 00:00:00", "2025-03-28 00:00:00", "Salary March");
insertSplit.run(splitGuid(), GUIDS.txSalaryMar, GUIDS.bank, "", "n", 300000, 100, 300000, 100);
insertSplit.run(splitGuid(), GUIDS.txSalaryMar, GUIDS.salary, "", "n", -300000, 100, -300000, 100);

// Freelance income: 500 GBP in Feb
insertTx.run(GUIDS.txFreelanceFeb, GUIDS.GBP, "", "2025-02-15 00:00:00", "2025-02-15 00:00:00", "Freelance Project");
insertSplit.run(splitGuid(), GUIDS.txFreelanceFeb, GUIDS.bank, "", "c", 50000, 100, 50000, 100);
insertSplit.run(splitGuid(), GUIDS.txFreelanceFeb, GUIDS.freelance, "", "c", -50000, 100, -50000, 100);

// Groceries: 200 GBP Jan, 180 GBP Feb
insertTx.run(GUIDS.txGroceriesJan, GUIDS.GBP, "", "2025-01-15 00:00:00", "2025-01-15 00:00:00", "Tesco Groceries");
insertSplit.run(splitGuid(), GUIDS.txGroceriesJan, GUIDS.groceries, "", "c", 20000, 100, 20000, 100);
insertSplit.run(splitGuid(), GUIDS.txGroceriesJan, GUIDS.bank, "", "c", -20000, 100, -20000, 100);

insertTx.run(GUIDS.txGroceriesFeb, GUIDS.GBP, "", "2025-02-10 00:00:00", "2025-02-10 00:00:00", "Sainsburys Groceries");
insertSplit.run(splitGuid(), GUIDS.txGroceriesFeb, GUIDS.groceries, "", "n", 18000, 100, 18000, 100);
insertSplit.run(splitGuid(), GUIDS.txGroceriesFeb, GUIDS.bank, "", "n", -18000, 100, -18000, 100);

// Restaurant: 45 GBP Jan (on credit card)
insertTx.run(GUIDS.txRestaurantJan, GUIDS.GBP, "", "2025-01-20 00:00:00", "2025-01-20 00:00:00", "Pizza Express");
insertSplit.run(splitGuid(), GUIDS.txRestaurantJan, GUIDS.restaurants, "", "n", 4500, 100, 4500, 100);
insertSplit.run(splitGuid(), GUIDS.txRestaurantJan, GUIDS.creditCard, "", "n", -4500, 100, -4500, 100);

// Electric: 85 GBP Jan, 90 GBP Feb
insertTx.run(GUIDS.txElectricJan, GUIDS.GBP, "", "2025-01-05 00:00:00", "2025-01-05 00:00:00", "British Gas Electric");
insertSplit.run(splitGuid(), GUIDS.txElectricJan, GUIDS.electric, "", "c", 8500, 100, 8500, 100);
insertSplit.run(splitGuid(), GUIDS.txElectricJan, GUIDS.bank, "", "c", -8500, 100, -8500, 100);

insertTx.run(GUIDS.txElectricFeb, GUIDS.GBP, "", "2025-02-05 00:00:00", "2025-02-05 00:00:00", "British Gas Electric");
insertSplit.run(splitGuid(), GUIDS.txElectricFeb, GUIDS.electric, "", "c", 9000, 100, 9000, 100);
insertSplit.run(splitGuid(), GUIDS.txElectricFeb, GUIDS.bank, "", "c", -9000, 100, -9000, 100);

// Water: 40 GBP Mar
insertTx.run(GUIDS.txWaterMar, GUIDS.GBP, "", "2025-03-10 00:00:00", "2025-03-10 00:00:00", "Thames Water");
insertSplit.run(splitGuid(), GUIDS.txWaterMar, GUIDS.water, "", "n", 4000, 100, 4000, 100);
insertSplit.run(splitGuid(), GUIDS.txWaterMar, GUIDS.bank, "", "n", -4000, 100, -4000, 100);

// Credit card payment: 45 GBP (Feb, clears the restaurant charge)
insertTx.run(GUIDS.txCreditCardPayment, GUIDS.GBP, "", "2025-02-01 00:00:00", "2025-02-01 00:00:00", "Credit Card Payment");
insertSplit.run(splitGuid(), GUIDS.txCreditCardPayment, GUIDS.creditCard, "", "c", 4500, 100, 4500, 100);
insertSplit.run(splitGuid(), GUIDS.txCreditCardPayment, GUIDS.bank, "", "c", -4500, 100, -4500, 100);

// Buy AAPL: 10 shares at $150 each = $1500 cost basis (in Jan)
// Transaction in GBP: 1500 USD * 0.80 = 1200 GBP
insertTx.run(GUIDS.txBuyAAPL, GUIDS.GBP, "", "2025-01-10 00:00:00", "2025-01-10 00:00:00", "Buy AAPL");
insertSplit.run(splitGuid(), GUIDS.txBuyAAPL, GUIDS.aaplAccount, "", "n", 120000, 100, 100000, 10000); // value=1200 GBP, qty=10 shares
insertSplit.run(splitGuid(), GUIDS.txBuyAAPL, GUIDS.bank, "", "n", -120000, 100, -120000, 100);

// Buy VWRL: 50 units at 80 GBP each = 4000 GBP cost basis (in Feb)
insertTx.run(GUIDS.txBuyVWRL, GUIDS.GBP, "", "2025-02-20 00:00:00", "2025-02-20 00:00:00", "Buy VWRL");
insertSplit.run(splitGuid(), GUIDS.txBuyVWRL, GUIDS.vwrlAccount, "", "n", 400000, 100, 500000, 10000); // value=4000 GBP, qty=50 units
insertSplit.run(splitGuid(), GUIDS.txBuyVWRL, GUIDS.bank, "", "n", -400000, 100, -400000, 100);

// USD deposit: 500 USD into USD account (in Jan)
// value in GBP = 400, quantity in USD = 500
insertTx.run(GUIDS.txUsdDeposit, GUIDS.GBP, "", "2025-01-12 00:00:00", "2025-01-12 00:00:00", "USD Transfer");
insertSplit.run(splitGuid(), GUIDS.txUsdDeposit, GUIDS.usdBank, "", "n", 40000, 100, 50000, 100); // value=400 GBP, qty=500 USD
insertSplit.run(splitGuid(), GUIDS.txUsdDeposit, GUIDS.bank, "", "n", -40000, 100, -40000, 100);

// -------------------------------------------------------------------
// Data: Prices
// -------------------------------------------------------------------
const insertPrice = db.prepare(
  `INSERT INTO prices (guid, commodity_guid, currency_guid, date, source, type, value_num, value_denom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

// AAPL prices (in GBP)
insertPrice.run(GUIDS.priceAAPLJan, GUIDS.AAPL, GUIDS.GBP, "2025-01-31 00:00:00", "user:price", "last", 12500, 100); // 125 GBP
insertPrice.run(GUIDS.priceAAPLFeb, GUIDS.AAPL, GUIDS.GBP, "2025-02-28 00:00:00", "user:price", "last", 13000, 100); // 130 GBP
insertPrice.run(GUIDS.priceAAPLMar, GUIDS.AAPL, GUIDS.GBP, "2025-03-31 00:00:00", "user:price", "last", 13500, 100); // 135 GBP

// VWRL prices (in GBP)
insertPrice.run(GUIDS.priceVWRLJan, GUIDS.VWRL, GUIDS.GBP, "2025-01-31 00:00:00", "user:price", "last", 8200, 100); // 82 GBP
insertPrice.run(GUIDS.priceVWRLMar, GUIDS.VWRL, GUIDS.GBP, "2025-03-31 00:00:00", "user:price", "last", 8500, 100); // 85 GBP

// USD/GBP exchange rates
insertPrice.run(GUIDS.priceUSDGBPJan, GUIDS.USD, GUIDS.GBP, "2025-01-15 00:00:00", "user:price", "last", 80, 100); // 1 USD = 0.80 GBP
insertPrice.run(GUIDS.priceUSDGBPMar, GUIDS.USD, GUIDS.GBP, "2025-03-15 00:00:00", "user:price", "last", 79, 100); // 1 USD = 0.79 GBP

// -------------------------------------------------------------------
// Data: Scheduled Transactions (Bills)
// -------------------------------------------------------------------
const insertSx = db.prepare(
  `INSERT INTO schedxactions (guid, name, enabled, start_date, last_occur) VALUES (?, ?, ?, ?, ?)`
);
const insertRec = db.prepare(
  `INSERT INTO recurrences (obj_guid, recurrence_mult, recurrence_period_type, recurrence_period_start) VALUES (?, ?, ?, ?)`
);

insertSx.run(GUIDS.sxRent, "Rent", 1, "2025-01-01", "2025-03-01");
insertRec.run(GUIDS.sxRent, 1, "month", "2025-01-01");

insertSx.run(GUIDS.sxInternet, "Internet", 1, "2025-01-15", "2025-02-15");
insertRec.run(GUIDS.sxInternet, 1, "month", "2025-01-15");

// -------------------------------------------------------------------
// Data: Budgets
// -------------------------------------------------------------------
db.prepare(
  `INSERT INTO budgets (guid, name, description, num_periods) VALUES (?, ?, ?, ?)`
).run(GUIDS.budget, "2025 Budget", "Annual household budget", 12);

const insertBudgetAmt = db.prepare(
  `INSERT INTO budget_amounts (budget_guid, account_guid, period_num, amount_num, amount_denom) VALUES (?, ?, ?, ?, ?)`
);

// Budget for groceries: 250/month for Jan (period 0), Feb (period 1), Mar (period 2)
insertBudgetAmt.run(GUIDS.budget, GUIDS.groceries, 0, 25000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.groceries, 1, 25000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.groceries, 2, 25000, 100);

// Budget for electric: 100/month
insertBudgetAmt.run(GUIDS.budget, GUIDS.electric, 0, 10000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.electric, 1, 10000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.electric, 2, 10000, 100);

// Budget for salary income: 3000/month
insertBudgetAmt.run(GUIDS.budget, GUIDS.salary, 0, 300000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.salary, 1, 300000, 100);
insertBudgetAmt.run(GUIDS.budget, GUIDS.salary, 2, 300000, 100);

db.close();

console.log(`Fixture created at ${FIXTURE_PATH}`);
console.log("Tables: books, commodities, accounts, transactions, splits, prices, schedxactions, recurrences, budgets, budget_amounts");
