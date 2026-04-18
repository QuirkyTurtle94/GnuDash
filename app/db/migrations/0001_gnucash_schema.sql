-- Migration 0001: GnuCash 3.0+ schema, Phase 1 (single fixed book).
--
-- This file is a 1:1 port of GnuCash's own SQL backend schema as defined in
-- gnucash-source/libgnucash/backend/dbi/gnc-*-sql.cpp. Table names, column
-- names, column order, NOT NULL constraints, and per-table version numbers
-- all mirror what GnuCash emits when writing to its libdbi PostgreSQL backend.
--
-- Type mapping follows gnc-dbisqlconnection.cpp:
--   CT_GUID       → varchar(32)
--   CT_STRING(N)  → varchar(N)
--   CT_INT        → integer (serial if AUTOINC)
--   CT_INT64      → int8
--   CT_BOOLEAN    → integer (0/1 — keeping GnuCash convention, not boolean)
--   CT_DOUBLE     → double precision
--   CT_TIME       → timestamp without time zone
--   CT_GDATE      → date
--   CT_NUMERIC    → pair of int8: {field}_num, {field}_denom
--   CT_ADDRESS    → 8-column expansion: {field}_name/addr1/addr2/addr3/addr4/phone/fax/email
--   CT_OWNERREF   → 2-column expansion: {field}_type (int), {field}_guid (varchar(32))
--
-- GnuCash does not declare foreign key constraints at the SQL level; referential
-- integrity is maintained at the application layer. We preserve that convention.
--
-- Phase 2 will create one schema per book. For now everything lives in a
-- single fixed schema `gnudash_book`.

CREATE SCHEMA IF NOT EXISTS gnudash_book;
SET search_path = gnudash_book;

-- ── Schema version tracking ─────────────────────────────────────────────
--
-- GnuCash writes one row per table into this table on creation, and updates
-- versions when migrating older files forward. We use it to refuse imports
-- from newer GnuCash releases whose schema we haven't validated.

CREATE TABLE versions (
  table_name    varchar(50) NOT NULL PRIMARY KEY,
  table_version integer     NOT NULL
);

-- ── Commodities ─────────────────────────────────────────────────────────

CREATE TABLE commodities (
  guid          varchar(32)   NOT NULL PRIMARY KEY,
  namespace     varchar(2048) NOT NULL,
  mnemonic      varchar(2048) NOT NULL,
  fullname      varchar(2048),
  cusip         varchar(2048),
  fraction      integer       NOT NULL,
  quote_flag    integer       NOT NULL,
  quote_source  varchar(2048),
  quote_tz      varchar(2048)
);

-- ── Books (GnuCash's internal per-file metadata — NOT the Phase 2 book catalogue) ──

CREATE TABLE books (
  guid               varchar(32) NOT NULL PRIMARY KEY,
  root_account_guid  varchar(32) NOT NULL,
  root_template_guid varchar(32) NOT NULL
);

-- ── Accounts ────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  guid           varchar(32)   NOT NULL PRIMARY KEY,
  name           varchar(2048) NOT NULL,
  account_type   varchar(2048) NOT NULL,
  commodity_guid varchar(32),
  commodity_scu  integer       NOT NULL,
  non_std_scu    integer       NOT NULL,
  parent_guid    varchar(32),
  code           varchar(2048),
  description    varchar(2048),
  hidden         integer,
  placeholder    integer
);

-- ── Transactions ────────────────────────────────────────────────────────

CREATE TABLE transactions (
  guid          varchar(32)   NOT NULL PRIMARY KEY,
  currency_guid varchar(32)   NOT NULL,
  num           varchar(2048) NOT NULL,
  post_date     timestamp,
  enter_date    timestamp,
  description   varchar(2048)
);

CREATE INDEX tx_post_date_index ON transactions (post_date);

-- ── Splits ──────────────────────────────────────────────────────────────

CREATE TABLE splits (
  guid            varchar(32)   NOT NULL PRIMARY KEY,
  tx_guid         varchar(32)   NOT NULL,
  account_guid    varchar(32)   NOT NULL,
  memo            varchar(2048) NOT NULL,
  action          varchar(2048) NOT NULL,
  reconcile_state varchar(1)    NOT NULL,
  reconcile_date  timestamp,
  value_num       int8          NOT NULL,
  value_denom     int8          NOT NULL,
  quantity_num    int8          NOT NULL,
  quantity_denom  int8          NOT NULL,
  lot_guid        varchar(32)
);

CREATE INDEX splits_tx_guid_index ON splits (tx_guid);
CREATE INDEX splits_account_guid_index ON splits (account_guid);

-- ── Prices ──────────────────────────────────────────────────────────────

CREATE TABLE prices (
  guid           varchar(32)   NOT NULL PRIMARY KEY,
  commodity_guid varchar(32)   NOT NULL,
  currency_guid  varchar(32)   NOT NULL,
  date           timestamp     NOT NULL,
  source         varchar(2048),
  type           varchar(2048),
  value_num      int8          NOT NULL,
  value_denom    int8          NOT NULL
);

-- ── Slots (key-value metadata store, keyed by obj_guid) ────────────────

CREATE TABLE slots (
  id                 serial        NOT NULL PRIMARY KEY,
  obj_guid           varchar(32)   NOT NULL,
  name               varchar(4096) NOT NULL,
  slot_type          integer       NOT NULL,
  int64_val          int8,
  string_val         varchar(4096),
  double_val         double precision,
  timespec_val       timestamp,
  guid_val           varchar(32),
  numeric_val_num    int8,
  numeric_val_denom  int8,
  gdate_val          date
);

-- ── Lots ────────────────────────────────────────────────────────────────

CREATE TABLE lots (
  guid         varchar(32) NOT NULL PRIMARY KEY,
  account_guid varchar(32),
  is_closed    integer     NOT NULL
);

-- ── Budgets ─────────────────────────────────────────────────────────────

CREATE TABLE budgets (
  guid        varchar(32)   NOT NULL PRIMARY KEY,
  name        varchar(2048) NOT NULL,
  description varchar(2048),
  num_periods integer       NOT NULL
);

CREATE TABLE budget_amounts (
  id           serial      NOT NULL PRIMARY KEY,
  budget_guid  varchar(32) NOT NULL,
  account_guid varchar(32) NOT NULL,
  period_num   integer     NOT NULL,
  amount_num   int8        NOT NULL,
  amount_denom int8        NOT NULL
);

-- ── Recurrences ─────────────────────────────────────────────────────────

CREATE TABLE recurrences (
  id                         serial        NOT NULL PRIMARY KEY,
  obj_guid                   varchar(32)   NOT NULL,
  recurrence_mult            integer       NOT NULL,
  recurrence_period_type     varchar(2048) NOT NULL,
  recurrence_period_start    date          NOT NULL,
  recurrence_weekend_adjust  varchar(2048) NOT NULL
);

-- ── Scheduled transactions ──────────────────────────────────────────────

CREATE TABLE schedxactions (
  guid              varchar(32)   NOT NULL PRIMARY KEY,
  name              varchar(2048),
  enabled           integer       NOT NULL,
  start_date        date,
  end_date          date,
  last_occur        date,
  num_occur         integer       NOT NULL,
  rem_occur         integer       NOT NULL,
  auto_create       integer       NOT NULL,
  auto_notify       integer       NOT NULL,
  adv_creation      integer       NOT NULL,
  adv_notify        integer       NOT NULL,
  instance_count    integer       NOT NULL,
  template_act_guid varchar(32)   NOT NULL
);

-- ── Business: bill terms (self-referential parent) ──────────────────────

CREATE TABLE billterms (
  guid          varchar(32)   NOT NULL PRIMARY KEY,
  name          varchar(2048) NOT NULL,
  description   varchar(2048) NOT NULL,
  refcount      integer       NOT NULL,
  invisible     integer       NOT NULL,
  parent        varchar(32),
  type          varchar(2048) NOT NULL,
  duedays       integer,
  discountdays  integer,
  discount_num  int8,
  discount_denom int8,
  cutoff        integer
);

-- ── Business: tax tables (self-referential parent) ──────────────────────

CREATE TABLE taxtables (
  guid      varchar(32)  NOT NULL PRIMARY KEY,
  name      varchar(50)  NOT NULL,
  refcount  int8         NOT NULL,
  invisible integer      NOT NULL,
  parent    varchar(32)
);

CREATE TABLE taxtable_entries (
  id           serial      NOT NULL PRIMARY KEY,
  taxtable     varchar(32) NOT NULL,
  account      varchar(32) NOT NULL,
  amount_num   int8        NOT NULL,
  amount_denom int8        NOT NULL,
  type         integer     NOT NULL
);

-- ── Business: customers ─────────────────────────────────────────────────
--
-- CT_ADDRESS columns expand to 8 sub-columns each: *_name, *_addr1..addr4,
-- *_phone, *_fax, *_email. See gnc-address-sql.cpp.

CREATE TABLE customers (
  guid             varchar(32)   NOT NULL PRIMARY KEY,
  name             varchar(2048) NOT NULL,
  id               varchar(2048) NOT NULL,
  notes            varchar(2048) NOT NULL,
  active           integer       NOT NULL,
  discount_num     int8          NOT NULL,
  discount_denom   int8          NOT NULL,
  credit_num       int8          NOT NULL,
  credit_denom     int8          NOT NULL,
  currency         varchar(32)   NOT NULL,
  tax_override     integer       NOT NULL,
  addr_name        varchar(1024),
  addr_addr1       varchar(1024),
  addr_addr2       varchar(1024),
  addr_addr3       varchar(1024),
  addr_addr4       varchar(1024),
  addr_phone       varchar(128),
  addr_fax         varchar(128),
  addr_email       varchar(256),
  shipaddr_name    varchar(1024),
  shipaddr_addr1   varchar(1024),
  shipaddr_addr2   varchar(1024),
  shipaddr_addr3   varchar(1024),
  shipaddr_addr4   varchar(1024),
  shipaddr_phone   varchar(128),
  shipaddr_fax     varchar(128),
  shipaddr_email   varchar(256),
  terms            varchar(32),
  tax_included     integer,
  taxtable         varchar(32)
);

-- ── Business: vendors ───────────────────────────────────────────────────

CREATE TABLE vendors (
  guid         varchar(32)   NOT NULL PRIMARY KEY,
  name         varchar(2048) NOT NULL,
  id           varchar(2048) NOT NULL,
  notes        varchar(2048) NOT NULL,
  currency     varchar(32)   NOT NULL,
  active       integer       NOT NULL,
  tax_override integer       NOT NULL,
  addr_name    varchar(1024),
  addr_addr1   varchar(1024),
  addr_addr2   varchar(1024),
  addr_addr3   varchar(1024),
  addr_addr4   varchar(1024),
  addr_phone   varchar(128),
  addr_fax     varchar(128),
  addr_email   varchar(256),
  terms        varchar(32),
  tax_inc      varchar(2048),
  tax_table    varchar(32)
);

-- ── Business: employees ─────────────────────────────────────────────────

CREATE TABLE employees (
  guid         varchar(32)   NOT NULL PRIMARY KEY,
  username     varchar(2048) NOT NULL,
  id           varchar(2048) NOT NULL,
  language     varchar(2048) NOT NULL,
  acl          varchar(2048) NOT NULL,
  active       integer       NOT NULL,
  currency     varchar(32)   NOT NULL,
  ccard_guid   varchar(32),
  workday_num  int8          NOT NULL,
  workday_denom int8         NOT NULL,
  rate_num     int8          NOT NULL,
  rate_denom   int8          NOT NULL,
  addr_name    varchar(1024),
  addr_addr1   varchar(1024),
  addr_addr2   varchar(1024),
  addr_addr3   varchar(1024),
  addr_addr4   varchar(1024),
  addr_phone   varchar(128),
  addr_fax     varchar(128),
  addr_email   varchar(256)
);

-- ── Business: jobs ──────────────────────────────────────────────────────
--
-- CT_OWNERREF expands to two columns: *_type (int discriminator), *_guid.

CREATE TABLE jobs (
  guid       varchar(32)   NOT NULL PRIMARY KEY,
  id         varchar(2048) NOT NULL,
  name       varchar(2048) NOT NULL,
  reference  varchar(2048) NOT NULL,
  active     integer       NOT NULL,
  owner_type integer,
  owner_guid varchar(32)
);

-- ── Business: orders ────────────────────────────────────────────────────

CREATE TABLE orders (
  guid        varchar(32)   NOT NULL PRIMARY KEY,
  id          varchar(2048) NOT NULL,
  notes       varchar(2048) NOT NULL,
  reference   varchar(2048) NOT NULL,
  active      integer       NOT NULL,
  date_opened timestamp     NOT NULL,
  date_closed timestamp     NOT NULL,
  owner_type  integer       NOT NULL,
  owner_guid  varchar(32)   NOT NULL
);

-- ── Business: invoices ──────────────────────────────────────────────────

CREATE TABLE invoices (
  guid              varchar(32)   NOT NULL PRIMARY KEY,
  id                varchar(2048) NOT NULL,
  date_opened       timestamp,
  date_posted       timestamp,
  notes             varchar(2048) NOT NULL,
  active            integer       NOT NULL,
  currency          varchar(32)   NOT NULL,
  owner_type        integer,
  owner_guid        varchar(32),
  terms             varchar(32),
  billing_id        varchar(2048),
  post_txn          varchar(32),
  post_lot          varchar(32),
  post_acc          varchar(32),
  billto_type       integer,
  billto_guid       varchar(32),
  charge_amt_num    int8,
  charge_amt_denom  int8
);

-- ── Business: entries (invoice/bill line items) ────────────────────────

CREATE TABLE entries (
  guid               varchar(32)   NOT NULL PRIMARY KEY,
  date               timestamp     NOT NULL,
  date_entered       timestamp,
  description        varchar(2048),
  action             varchar(2048),
  notes              varchar(2048),
  quantity_num       int8,
  quantity_denom     int8,
  i_acct             varchar(32),
  i_price_num        int8,
  i_price_denom      int8,
  i_discount_num     int8,
  i_discount_denom   int8,
  invoice            varchar(32),
  i_disc_type        varchar(2048),
  i_disc_how         varchar(2048),
  i_taxable          integer,
  i_taxincluded      integer,
  i_taxtable         varchar(32),
  b_acct             varchar(32),
  b_price_num        int8,
  b_price_denom      int8,
  bill               varchar(32),
  b_taxable          integer,
  b_taxincluded      integer,
  b_taxtable         varchar(32),
  b_paytype          integer,
  billable           integer,
  billto_type        integer,
  billto_guid        varchar(32),
  order_guid         varchar(32)
);
