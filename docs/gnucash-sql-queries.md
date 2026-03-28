# GNUCash SQL Query Reference

> Source: https://wiki.gnucash.org/wiki/GnuCash_SQL_Examples

## Account Hierarchy

### Build full account path tree (recursive CTE)
```sql
WITH RECURSIVE account_tree AS (
  SELECT guid, parent_guid, name, name AS path
  FROM accounts
  WHERE parent_guid IS NULL
  UNION ALL
  SELECT c.guid, c.parent_guid, c.name, parent.path || ':' || c.name
  FROM accounts c
  JOIN account_tree parent ON parent.guid = c.parent_guid
)
SELECT * FROM account_tree;
```

### Get account GUID by full path
```sql
WITH RECURSIVE path_list AS (
  SELECT guid, parent_guid, name, name AS path
  FROM accounts WHERE parent_guid IS NULL
  UNION ALL
  SELECT child.guid, child.parent_guid, child.name, path || ':' || child.name
  FROM accounts AS child
  JOIN path_list AS parent ON parent.guid = child.parent_guid
)
SELECT guid FROM path_list WHERE path = 'Root Account:Assets:Current Assets:Checking';
```

### Get all child accounts of a parent
```sql
WITH RECURSIVE all_nested AS (
  SELECT guid AS start_guid, guid, parent_guid
  FROM accounts
  UNION ALL
  SELECT start_guid, child.guid, child.parent_guid
  FROM accounts AS child
  JOIN all_nested AS parent ON parent.guid = child.parent_guid
)
SELECT * FROM all_nested WHERE start_guid = '<parent_guid>';
```

## Net Worth

> **IMPORTANT:** For account balances, always use `quantity_num/quantity_denom` (account's native commodity),
> NOT `value_num/value_denom` (transaction currency). Apply FX conversion for multi-currency.
> See CLAUDE.md "Split Fields: value vs quantity" for full explanation.

### Current net worth (non-investment, grouped by commodity for FX conversion)
```sql
SELECT
  a.commodity_guid,
  SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance
FROM splits s
JOIN accounts a ON s.account_guid = a.guid
WHERE a.account_type NOT IN ('STOCK', 'MUTUAL', 'ROOT', 'INCOME', 'EXPENSE', 'EQUITY', 'TRADING')
  AND a.placeholder = 0
GROUP BY a.commodity_guid;
```
Note: Multiply each commodity group's balance by its FX rate to base currency. Add investment market values (shares × latest price) separately.

### Net worth over time (monthly snapshots, non-investment)
```sql
SELECT
  strftime('%Y-%m', t.post_date) AS month,
  a.commodity_guid,
  SUM(CASE WHEN a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE')
      THEN CAST(s.quantity_num AS REAL) / s.quantity_denom ELSE 0 END) AS asset_change,
  SUM(CASE WHEN a.account_type IN ('LIABILITY','CREDIT','PAYABLE')
      THEN CAST(s.quantity_num AS REAL) / s.quantity_denom ELSE 0 END) AS liability_change
FROM splits s
JOIN accounts a ON s.account_guid = a.guid
JOIN transactions t ON s.tx_guid = t.guid
WHERE a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE','LIABILITY','CREDIT','PAYABLE')
  AND a.placeholder = 0
GROUP BY strftime('%Y-%m', t.post_date), a.commodity_guid
ORDER BY month;
```
Note: Apply FX conversion per commodity group, then accumulate monthly deltas into running totals. Add investment market values (shares × price-at-month) separately.

## Income vs Expenses

### Monthly income and expenses
```sql
SELECT
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
ORDER BY month;
```

### Expense breakdown by top-level category
```sql
WITH RECURSIVE account_tree AS (
  SELECT guid, parent_guid, name, name AS root_category
  FROM accounts
  WHERE account_type = 'EXPENSE'
    AND parent_guid = (SELECT guid FROM accounts WHERE account_type = 'EXPENSE' AND parent_guid = (SELECT root_account_guid FROM books))
  UNION ALL
  SELECT c.guid, c.parent_guid, c.name, parent.root_category
  FROM accounts c
  JOIN account_tree parent ON c.parent_guid = parent.guid
)
SELECT
  at.root_category,
  SUM(CAST(s.value_num AS REAL) / s.value_denom) AS total
FROM splits s
JOIN account_tree at ON s.account_guid = at.guid
JOIN transactions t ON s.tx_guid = t.guid
WHERE t.post_date >= '<start_date>' AND t.post_date < '<end_date>'
GROUP BY at.root_category
ORDER BY total DESC;
```

## Account Balances

### All account balances (using quantity for native commodity balance)
```sql
WITH RECURSIVE account_tree AS (
  SELECT guid, parent_guid, name, name AS path, account_type, commodity_guid
  FROM accounts WHERE parent_guid IS NULL
  UNION ALL
  SELECT c.guid, c.parent_guid, c.name, parent.path || ':' || c.name, c.account_type, c.commodity_guid
  FROM accounts c
  JOIN account_tree parent ON parent.guid = c.parent_guid
)
SELECT
  at.path,
  at.name,
  at.account_type,
  at.commodity_guid,
  COALESCE(SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom), 0) AS balance
FROM account_tree at
LEFT JOIN splits s ON s.account_guid = at.guid
WHERE at.account_type NOT IN ('ROOT')
GROUP BY at.guid, at.path, at.name, at.account_type, at.commodity_guid
ORDER BY at.path;
```
Note: Apply FX conversion for foreign-currency accounts to get balances in base currency.

## Investment Tracking

### Current holdings (shares and cost basis)
```sql
SELECT
  a.name AS account_name,
  c.mnemonic AS ticker,
  SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held,
  SUM(CAST(s.value_num AS REAL) / s.value_denom) AS cost_basis
FROM splits s
JOIN accounts a ON s.account_guid = a.guid
JOIN commodities c ON a.commodity_guid = c.guid
WHERE a.account_type IN ('STOCK', 'MUTUAL')
GROUP BY a.guid, a.name, c.mnemonic
HAVING shares_held != 0;
```

### Latest prices for all securities
```sql
SELECT
  c.mnemonic AS ticker,
  c.fullname,
  p.date AS price_date,
  CAST(p.value_num AS REAL) / p.value_denom AS price
FROM prices p
JOIN commodities c ON p.commodity_guid = c.guid
WHERE p.date = (
  SELECT MAX(p2.date) FROM prices p2 WHERE p2.commodity_guid = p.commodity_guid
)
ORDER BY c.mnemonic;
```

### Investment value with gain/loss vs cost basis
```sql
WITH holdings AS (
  SELECT
    a.guid AS account_guid,
    a.name AS account_name,
    c.mnemonic AS ticker,
    a.commodity_guid,
    SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held,
    SUM(CAST(s.value_num AS REAL) / s.value_denom) AS cost_basis
  FROM splits s
  JOIN accounts a ON s.account_guid = a.guid
  JOIN commodities c ON a.commodity_guid = c.guid
  WHERE a.account_type IN ('STOCK', 'MUTUAL')
  GROUP BY a.guid, a.name, c.mnemonic, a.commodity_guid
  HAVING shares_held != 0
),
latest_prices AS (
  SELECT
    commodity_guid,
    CAST(value_num AS REAL) / value_denom AS price
  FROM prices
  WHERE (commodity_guid, date) IN (
    SELECT commodity_guid, MAX(date) FROM prices GROUP BY commodity_guid
  )
)
SELECT
  h.account_name,
  h.ticker,
  h.shares_held,
  h.cost_basis,
  h.shares_held * lp.price AS market_value,
  (h.shares_held * lp.price) - h.cost_basis AS gain_loss,
  CASE WHEN h.cost_basis != 0
    THEN ((h.shares_held * lp.price) - h.cost_basis) / ABS(h.cost_basis) * 100
    ELSE 0 END AS gain_loss_pct
FROM holdings h
LEFT JOIN latest_prices lp ON h.commodity_guid = lp.commodity_guid;
```

### Investment value 12 months ago (for period comparison)
```sql
WITH holdings_12m_ago AS (
  SELECT
    a.guid AS account_guid,
    a.commodity_guid,
    SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held_then,
    SUM(CAST(s.value_num AS REAL) / s.value_denom) AS cost_basis_then
  FROM splits s
  JOIN accounts a ON s.account_guid = a.guid
  JOIN transactions t ON s.tx_guid = t.guid
  WHERE a.account_type IN ('STOCK', 'MUTUAL')
    AND t.post_date < date('now', '-12 months')
  GROUP BY a.guid, a.commodity_guid
),
prices_12m_ago AS (
  SELECT
    commodity_guid,
    CAST(value_num AS REAL) / value_denom AS price
  FROM prices
  WHERE (commodity_guid, date) IN (
    SELECT commodity_guid, MAX(date)
    FROM prices
    WHERE date < date('now', '-12 months')
    GROUP BY commodity_guid
  )
)
SELECT
  h.account_guid,
  h.shares_held_then * p.price AS value_12m_ago
FROM holdings_12m_ago h
LEFT JOIN prices_12m_ago p ON h.commodity_guid = p.commodity_guid;
```

## Commodity Prices with Details
```sql
SELECT
  c1.namespace AS namespace,
  c1.mnemonic || ' (' || c1.fullname || ')' AS security,
  c2.mnemonic || ' (' || c2.fullname || ')' AS currency,
  p.date,
  p.source,
  p.type,
  CAST(p.value_num AS REAL) / p.value_denom AS price
FROM prices p
JOIN commodities c1 ON p.commodity_guid = c1.guid
JOIN commodities c2 ON p.currency_guid = c2.guid
ORDER BY c1.namespace, c1.mnemonic, p.date;
```

## Transactions

### All transactions for an account
```sql
SELECT
  t.post_date,
  t.description,
  CAST(s.value_num AS REAL) / s.value_denom AS amount,
  s.reconcile_state,
  s.memo
FROM splits s
JOIN transactions t ON s.tx_guid = t.guid
WHERE s.account_guid = '<account_guid>'
ORDER BY t.post_date DESC;
```

### Multi-split transactions (more than 2 accounts involved)
```sql
SELECT tx_guid, COUNT(tx_guid) AS split_count
FROM splits
GROUP BY tx_guid
HAVING split_count > 2;
```
