import "server-only";
/**
 * GnuCash table descriptors for import / export.
 *
 * Each entry lists the column names (in a stable order) and the type
 * transforms needed to move rows between SQLite (the .gnucash format)
 * and Postgres (our `gnudash_book` schema).
 *
 * Type mapping rule: whatever needs conversion gets a tag here; everything
 * else passes through. SQLite stores timestamps as TEXT in YYYYMMDDhhmmss
 * format (or ISO); Postgres has real `timestamp` / `date` columns per
 * db/migrations/0001_gnucash_schema.sql.
 *
 * Pass-through business tables (customers, vendors, invoices, entries,
 * orders, jobs, billterms, taxtables, taxtable_entries, employees) are
 * declared here as column lists but their actual row copying is a follow-up
 * — the dashboard doesn't read or write them today, but we preserve their
 * structure so round-tripping a book through this app doesn't corrupt
 * invoicing data if the user has any.
 */

export type ColumnType = "timestamp" | "date" | "passthrough";

export interface TableDescriptor {
  /** Table name — identical in SQLite and Postgres per the 1:1 commitment. */
  name: string;
  /** Column names in order. */
  columns: string[];
  /**
   * Column name → conversion type. Columns absent from this map are
   * treated as `passthrough` (copied verbatim).
   */
  types?: Record<string, ColumnType>;
  /**
   * If true, this table is present in the schema but not yet wired for
   * import/export. Import will skip these tables with a warning; export
   * will skip them silently (fresh books don't have them).
   */
  passThrough?: boolean;
}

const CORE_TABLES: TableDescriptor[] = [
  {
    name: "versions",
    columns: ["table_name", "table_version"],
  },
  {
    name: "commodities",
    columns: [
      "guid", "namespace", "mnemonic", "fullname", "cusip", "fraction",
      "quote_flag", "quote_source", "quote_tz",
    ],
  },
  {
    name: "books",
    columns: ["guid", "root_account_guid", "root_template_guid"],
  },
  {
    name: "accounts",
    columns: [
      "guid", "name", "account_type", "commodity_guid", "commodity_scu",
      "non_std_scu", "parent_guid", "code", "description", "hidden", "placeholder",
    ],
  },
  {
    name: "transactions",
    columns: ["guid", "currency_guid", "num", "post_date", "enter_date", "description"],
    types: { post_date: "timestamp", enter_date: "timestamp" },
  },
  {
    name: "splits",
    columns: [
      "guid", "tx_guid", "account_guid", "memo", "action", "reconcile_state",
      "reconcile_date", "value_num", "value_denom", "quantity_num",
      "quantity_denom", "lot_guid",
    ],
    types: { reconcile_date: "timestamp" },
  },
  {
    name: "prices",
    columns: [
      "guid", "commodity_guid", "currency_guid", "date", "source", "type",
      "value_num", "value_denom",
    ],
    types: { date: "timestamp" },
  },
  {
    name: "slots",
    columns: [
      "id", "obj_guid", "name", "slot_type", "int64_val", "string_val",
      "double_val", "timespec_val", "guid_val", "numeric_val_num",
      "numeric_val_denom", "gdate_val",
    ],
    types: { timespec_val: "timestamp", gdate_val: "date" },
  },
  {
    name: "lots",
    columns: ["guid", "account_guid", "is_closed"],
  },
  {
    name: "budgets",
    columns: ["guid", "name", "description", "num_periods"],
  },
  {
    name: "budget_amounts",
    columns: [
      "id", "budget_guid", "account_guid", "period_num", "amount_num", "amount_denom",
    ],
  },
  {
    name: "recurrences",
    columns: [
      "id", "obj_guid", "recurrence_mult", "recurrence_period_type",
      "recurrence_period_start", "recurrence_weekend_adjust",
    ],
    types: { recurrence_period_start: "date" },
  },
  {
    name: "schedxactions",
    columns: [
      "guid", "name", "enabled", "start_date", "end_date", "last_occur",
      "num_occur", "rem_occur", "auto_create", "auto_notify", "adv_creation",
      "adv_notify", "instance_count", "template_act_guid",
    ],
    types: {
      start_date: "date", end_date: "date", last_occur: "date",
    },
  },
];

// Pass-through business tables — declared so we can detect them in a source
// file and log/skip without corrupting anything. Full copying is a follow-up
// (no dashboard feature reads these yet).
const PASS_THROUGH_TABLES: TableDescriptor[] = [
  { name: "customers", columns: [], passThrough: true },
  { name: "vendors", columns: [], passThrough: true },
  { name: "employees", columns: [], passThrough: true },
  { name: "invoices", columns: [], passThrough: true },
  { name: "entries", columns: [], passThrough: true },
  { name: "orders", columns: [], passThrough: true },
  { name: "jobs", columns: [], passThrough: true },
  { name: "billterms", columns: [], passThrough: true },
  { name: "taxtables", columns: [], passThrough: true },
  { name: "taxtable_entries", columns: [], passThrough: true },
];

export const GNUCASH_TABLES: TableDescriptor[] = [
  ...CORE_TABLES,
  ...PASS_THROUGH_TABLES,
];

export const CORE_TABLE_NAMES = new Set(CORE_TABLES.map((t) => t.name));
export const PASS_THROUGH_TABLE_NAMES = new Set(PASS_THROUGH_TABLES.map((t) => t.name));

/**
 * Convert a value from GnuCash SQLite TEXT form into the shape the
 * corresponding Postgres column expects. NULL passes through; non-strings
 * pass through unchanged.
 */
export function transformForPostgres(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined) return null;
  if (type === "passthrough") return value;
  if (typeof value !== "string") return value;
  if (value === "") return null;

  if (type === "timestamp") {
    // Accept both compact "YYYYMMDDHHMMSS" and ISO-ish "YYYY-MM-DD HH:MM:SS".
    const cleaned = value.replace(/[-: ]/g, "");
    if (cleaned.length < 8) return null;
    const y = cleaned.slice(0, 4);
    const mo = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    const h = cleaned.slice(8, 10) || "00";
    const mi = cleaned.slice(10, 12) || "00";
    const s = cleaned.slice(12, 14) || "00";
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  if (type === "date") {
    const cleaned = value.replace(/-/g, "");
    if (cleaned.length < 8) return null;
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }

  return value;
}

/**
 * Convert a value from a Postgres row back into the GnuCash SQLite TEXT
 * representation on export.
 */
export function transformForSqlite(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined) return null;
  if (type === "passthrough") return value;

  if (type === "timestamp") {
    if (value instanceof Date) {
      // GnuCash's historical SQLite format is compact, no separators.
      const y = value.getUTCFullYear().toString().padStart(4, "0");
      const mo = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      const h = String(value.getUTCHours()).padStart(2, "0");
      const mi = String(value.getUTCMinutes()).padStart(2, "0");
      const s = String(value.getUTCSeconds()).padStart(2, "0");
      return `${y}${mo}${d}${h}${mi}${s}`;
    }
    if (typeof value === "string") return value.replace(/[-: ]/g, "").slice(0, 14);
    return value;
  }

  if (type === "date") {
    if (value instanceof Date) {
      const y = value.getUTCFullYear().toString().padStart(4, "0");
      const mo = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      return `${y}${mo}${d}`;
    }
    if (typeof value === "string") return value.replace(/-/g, "").slice(0, 8);
    return value;
  }

  return value;
}
