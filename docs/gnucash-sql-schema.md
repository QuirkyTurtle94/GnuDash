# GNUCash SQLite Database Schema Reference

> Source: https://wiki.gnucash.org/wiki/SQL and https://piecash.readthedocs.io/en/master/object_model.html

## Overview

GNUCash stores data in SQLite as a double-entry accounting system. All monetary values use rational number representation (`value_num / value_denom`) for precision. In SQLite, dates are stored as `CHAR(14)` strings in `YYYYMMDDHHmmss` format (for timestamps) or `CHAR(8)` in `YYYYMMDD` format (for dates).

---

## Core Tables

### books
Root container — one per database.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| root_account_guid | CHAR(32) | FK → accounts.guid |
| root_template_guid | CHAR(32) | FK → accounts.guid |

### commodities
Currencies, securities, and tangible asset types.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| namespace | text(2048) | `CURRENCY` for currencies; `NASDAQ`, `NYSE`, custom for securities |
| mnemonic | text(2048) | Ticker symbol (USD, AAPL, VTSAX) |
| fullname | text(2048) | Human-readable name |
| cusip | text(2048) | CUSIP/ISIN identifier |
| fraction | integer | Smallest unit (100 for USD = cents, 10000 for stocks) |
| quote_flag | integer | Whether to fetch online quotes |
| quote_source | text(2048) | Source for online quotes |
| quote_tz | text(2048) | Timezone for quotes |

### accounts
The account tree. Self-referential hierarchy via `parent_guid`.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| name | text(2048) | Account name |
| account_type | text(2048) | See account types below |
| commodity_guid | CHAR(32) | FK → commodities.guid — what this account tracks |
| commodity_scu | integer | Smallest commodity unit for this account |
| non_std_scu | integer | Whether using non-standard SCU |
| parent_guid | CHAR(32) | FK → accounts.guid (NULL for root) |
| code | text(2048) | User-assigned account code |
| description | text(2048) | Account description |
| hidden | integer | 1 = hidden in UI |
| placeholder | integer | 1 = grouping node only, cannot have transactions |

**Account Types:**
- **Asset types:** `ASSET`, `BANK`, `CASH`, `STOCK`, `MUTUAL`
- **Liability types:** `LIABILITY`, `CREDIT`
- **Income types:** `INCOME`
- **Expense types:** `EXPENSE`
- **Equity types:** `EQUITY`
- **Special:** `ROOT` (root account only), `RECEIVABLE`, `PAYABLE`, `TRADING`

### transactions
Transfer headers. Each transaction has 2+ splits that must sum to zero.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| currency_guid | CHAR(32) | FK → commodities.guid — transaction's reference currency |
| num | text(2048) | Check/reference number |
| post_date | timestamp | Transaction date (CHAR(14) in SQLite) |
| enter_date | timestamp | Entry date (CHAR(14) in SQLite) |
| description | text(2048) | Transaction description/payee |

### splits
The actual debits/credits. Each split ties an amount to one account in one transaction.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| tx_guid | CHAR(32) | FK → transactions.guid |
| account_guid | CHAR(32) | FK → accounts.guid |
| memo | text(2048) | Split-level memo |
| action | text(2048) | Action type |
| reconcile_state | text(1) | `n`=not reconciled, `c`=cleared, `y`=reconciled, `f`=frozen, `v`=voided |
| reconcile_date | timestamp | When reconciled |
| value_num | integer | Amount numerator **in transaction currency** |
| value_denom | integer | Amount denominator **in transaction currency** |
| quantity_num | integer | Amount numerator **in account's commodity** |
| quantity_denom | integer | Amount denominator **in account's commodity** |
| lot_guid | CHAR(32) | FK → lots.guid (for investment tracking) |

**CRITICAL: value vs quantity:**
- `value_num/value_denom` = amount in the **transaction's currency**
- `quantity_num/quantity_denom` = amount in the **account's commodity**
- For regular bank accounts (commodity = USD, transaction currency = USD): value == quantity
- For stock accounts: value = cost in USD, quantity = number of shares
- **Invariant:** `SUM(value_num/value_denom)` across all splits in a transaction = 0

### prices
Historical price quotes for commodities (stocks, foreign currencies).

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| commodity_guid | CHAR(32) | FK → commodities.guid — what's being priced |
| currency_guid | CHAR(32) | FK → commodities.guid — priced in what |
| date | timestamp | Price date |
| source | text(2048) | Price source (user, Finance::Quote, etc.) |
| type | text(2048) | Price type |
| value_num | integer | Price numerator |
| value_denom | integer | Price denominator |

### lots
Groups buy/sell transactions for capital gains computation.

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| account_guid | CHAR(32) | FK → accounts.guid |
| is_closed | integer | 1 = fully sold/closed |

### slots
Key-value metadata attached to any object (accounts, transactions, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PRIMARY KEY AUTOINCREMENT |
| obj_guid | CHAR(32) | GUID of the object this slot belongs to |
| name | text(4096) | Slot name/key |
| slot_type | integer | Type of value stored |
| int64_val | integer | Integer value |
| string_val | text(4096) | String value |
| double_val | real | Float value |
| timespec_val | CHAR(14) | Timestamp value |
| guid_val | CHAR(32) | GUID value |
| numeric_val_num | integer | Numeric numerator |
| numeric_val_denom | integer | Numeric denominator |
| gdate_val | date | Date value |

---

## Scheduled Transactions

### schedxactions

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| name | text(2048) | |
| enabled | integer | |
| start_date | date | |
| end_date | date | |
| last_occur | date | |
| num_occur | integer | |
| rem_occur | integer | |
| auto_create | integer | |
| auto_notify | integer | |
| adv_creation | integer | |
| adv_notify | integer | |
| instance_count | integer | |
| template_act_guid | CHAR(32) | FK → accounts.guid |

### recurrences

| Column | Type | Notes |
|--------|------|-------|
| obj_guid | CHAR(32) | FK → schedxactions.guid |
| recurrence_mult | integer | Multiplier (e.g., 2 for bi-weekly) |
| recurrence_period_type | text(2048) | `month`, `week`, etc. |
| recurrence_period_start | CHAR(8) | Start date |

---

## Budget Tables

### budgets

| Column | Type | Notes |
|--------|------|-------|
| guid | CHAR(32) | PRIMARY KEY |
| name | text(2048) | |
| description | text(2048) | |
| num_periods | integer | |

### budget_amounts

| Column | Type | Notes |
|--------|------|-------|
| id | integer | PRIMARY KEY AUTOINCREMENT |
| budget_guid | text(32) | FK → budgets.guid |
| account_guid | text(32) | FK → accounts.guid |
| period_num | integer | |
| amount_num | bigint | |
| amount_denom | bigint | |

---

## Locking

### gnclock

| Column | Type | Notes |
|--------|------|-------|
| Hostname | varchar(255) | |
| PID | int | |

### versions

| Column | Type | Notes |
|--------|------|-------|
| table_name | text(50) | |
| table_version | integer | |

---

## Relationship Diagram

```
books
  └─> accounts (root_account_guid)
        ├─> accounts.parent_guid (self-referential tree)
        ├─> commodities (commodity_guid — what the account tracks)
        └─> splits (account_guid)
              └─> transactions (tx_guid)
              │     └─> commodities (currency_guid — transaction currency)
              └─> lots (lot_guid — for investment gain/loss tracking)

commodities
  └─> prices (commodity_guid + currency_guid)

schedxactions
  └─> recurrences (obj_guid)
  └─> accounts (template_act_guid)

budgets
  └─> budget_amounts (budget_guid + account_guid)
```

---

## Sign Conventions (CRITICAL)

GNUCash uses standard double-entry accounting signs:

| Account Type | Debit (positive split) | Credit (negative split) |
|---|---|---|
| ASSET, BANK, CASH | Increases balance | Decreases balance |
| LIABILITY, CREDIT | Decreases balance | Increases balance |
| INCOME | Decreases balance | **Increases balance** (income splits are negative) |
| EXPENSE | **Increases balance** (expense splits are positive) | Decreases balance |
| EQUITY | Decreases balance | Increases balance |

**For reporting purposes:**
- Asset balance = `SUM(value_num/value_denom)` → positive means you own it
- Liability balance = `SUM(value_num/value_denom)` → negative means you owe it
- Net Worth = Sum of all ASSET-type balances + Sum of all LIABILITY-type balances (liabilities are already negative)
- Income = `-SUM(value_num/value_denom)` for INCOME accounts → negate to show as positive
- Expenses = `SUM(value_num/value_denom)` for EXPENSE accounts → already positive

**For investments:**
- Cost basis = `SUM(value_num/value_denom)` of all splits in the STOCK/MUTUAL account (in transaction currency)
- Shares held = `SUM(quantity_num/quantity_denom)` of all splits in the STOCK/MUTUAL account
- Market value = shares held × latest price from `prices` table
- Gain/Loss = market value - cost basis
