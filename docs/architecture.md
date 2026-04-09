# Architecture

GnuDash is a client-side web application that reads GNUCash files and renders financial dashboards. All data processing happens in the browser — no server-side computation or storage.

## Data Flow

```
GNUCash file (.gnucash SQLite or .gnucash XML)
        │
        ▼
┌─────────────────────────┐
│   Web Worker            │
│   (SQLite WASM)         │
│                         │
│   1. Load file into     │
│      in-memory SQLite   │
│   2. Build ParseContext │
│   3. Run domain fns     │
│   4. Return DashboardData│
└────────────┬────────────┘
             │ postMessage
             ▼
┌─────────────────────────┐
│   Main Thread           │
│                         │
│   DashboardContext       │
│   (React Context)       │
│   - Stores DashboardData│
│   - Provides useDashboard()│
│   - Handles file upload │
│   - Manages write ops   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Page Components       │
│                         │
│   Each page reads from  │
│   useDashboard() and    │
│   renders charts/tables │
└─────────────────────────┘
```

## Key Layers

### 1. File Loading (`lib/gnucash/`)

**Entry points:**
- `worker/db-worker.ts` — Web Worker that loads a file buffer into SQLite WASM and exposes domain functions via `postMessage`
- `index.ts` — Node.js entry point for server-side parsing (uses native SQLite)
- `xml/parser.ts` — Parser for XML-format GNUCash files (converted to in-memory SQLite)

**Context:** `context.ts` defines `ParseContext`, a bag of pre-computed lookups passed to every domain function:
- `db` — SQLite database adapter
- `accountMap` — GUID → account lookup
- `commodityMap` — GUID → commodity lookup
- `fxRates` — Foreign exchange rate converter
- `latestPrices` — Most recent price per commodity
- `topExpenseGuids` / `topIncomeGuids` — Top-level category account GUIDs

### 2. Domain Layer (`lib/gnucash/domain/`)

Pure functions that query SQLite and return typed data. Each file owns one area of financial computation:

| File | Functions | What it computes |
|------|-----------|-----------------|
| `accounts.ts` | `buildAccountTree` | Hierarchical account tree with balances in base currency |
| `balances.ts` | `computeTopBalances` | Current balance of every non-placeholder account |
| `bills.ts` | `getUpcomingBills` | Next occurrence of scheduled transactions |
| `budgets.ts` | `computeBudgetData` | Budget vs actual with hierarchy, imbalance detection |
| `cash-flow.ts` | `computeCashFlowSeries` | Monthly income vs expense totals (not true cash flow) |
| `closing.ts` | `hasClosingTransactions` | Detects year-end book-closing entries |
| `expenses.ts` | `computeExpenseBreakdown`, `getExpenseTransactions` | Expense categories, monthly breakdowns, transaction list |
| `fx.ts` | `buildFxRateMap` | Foreign exchange rate lookup from price history |
| `income.ts` | `computeIncomeBreakdown`, `getIncomeTransactions` | Income categories and transactions |
| `investments.ts` | `computeInvestments`, `computeInvestmentValueSeries` | Holdings, cost basis, market value, portfolio time series |
| `ledger.ts` | `getLedgerTransactions`, `getRecentTransactions` | Full transaction ledger and recent transactions |
| `net-worth.ts` | `computeNetWorthSeries`, `computeCurrentNetWorth` | Monthly net worth (assets + investments - liabilities) |

**Important conventions:**
- All domain functions take `ParseContext` as their first argument
- Monetary values are converted to base currency unless noted otherwise
- Income amounts are negated (GNUCash stores income splits as negative values)
- Balance queries use `quantity_num/quantity_denom` (native commodity) with FX conversion, not `value_num/value_denom`, for accurate multi-currency support

### 3. Data Model (`lib/types/gnucash.ts`)

Two categories of types:
- **Schema types** (`GnuCashAccount`, `GnuCashSplit`, etc.) — mirror the SQLite tables
- **Derived types** (`DashboardData`, `MonthlyNetWorth`, etc.) — computed by domain functions

`DashboardData` is the central type — it contains everything the UI needs, computed once when a file is loaded. See the type file for detailed field documentation.

### 4. React Layer

**Context providers** (wrap the app in `(dashboard)/layout.tsx`):
- `DashboardContext` — provides `useDashboard()` hook with all data + mutation functions
- `PrivacyContext` — `usePrivacy()` for the hide/show values toggle (applied via CSS blur)
- `ClosingContext` — `useClosing()` for the global exclude-closing-transactions toggle

**Page structure** (`app/(dashboard)/`):
- `/` — Dashboard overview (net worth, income/spending overview, cash flow, balances)
- `/accounts` — Chart of accounts tree
- `/transactions` — Full ledger with search/filter
- `/income` — Income breakdown (pie, bar, table) with drill-down
- `/spending` — Spending breakdown (pie, bar, table) with drill-down
- `/investment` — Portfolio summary, allocation, holdings, value over time
- `/budget` — Budget vs actual (expense/income basis)
- `/cash-flow` — Cash flow budget (cash-basis tracking)
- `/sankey` — Sankey flow diagram

**Shared filter state:** The spending and income pages share a `SpendingFilterContext` that synchronises:
- Period selection (time range)
- Category drill-down (selectedCategory)
- Leaf account selection (selectedAccount) — filters bar chart and transaction table
- Month selection (from clicking a bar)
- Excluded categories (hidden from pie chart)

### 5. Worker Communication

The worker uses a typed message protocol defined in `worker/messages.ts`. The main thread sends commands (`openFile`, `query`, `mutate`) and receives responses (`result`, `error`). `GnuCashWorkerClient` (`worker/client.ts`) wraps this in a promise-based API.

For mutations (create/edit/delete transactions, accounts, commodities), the worker:
1. Validates the operation
2. Writes to the in-memory SQLite database
3. Recomputes `DashboardData`
4. Returns the fresh data to the main thread

### 6. File Persistence

Files are persisted client-side using two mechanisms:
- **OPFS** (Origin Private File System) — primary storage, survives page refreshes
- **sessionStorage** — fallback cache for browsers without OPFS support

The original `.gnucash` file can be exported back via the sidebar.

## Closing Transactions

GNUCash year-end closing transactions zero out income/expense accounts. These are detected via the `slots` table (`name = 'book-closing'`). A global toggle in the header bar excludes them from all income/expense charts. Pre-computed "excluding closing" variants of the data are stored in `DashboardData` alongside the full data.

## Multi-Currency Support

- Base currency is detected from the GNUCash root account
- Foreign currency accounts use `quantity` (native amount) × FX rate, not `value` (which may be stale)
- FX rates come from the GNUCash `prices` table (most recent price per currency pair)
- Investment accounts use `quantity` (shares) × latest price for market value
