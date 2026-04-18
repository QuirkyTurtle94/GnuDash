import type { SqlDialect } from "../db/adapter";

// GNUCash SQLite date format: YYYYMMDDHHmmss (CHAR 14) or YYYY-MM-DD HH:MM:SS
export function parseGnuCashDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const cleaned = dateStr.replace(/[-: ]/g, "");
  const year = parseInt(cleaned.substring(0, 4));
  const month = parseInt(cleaned.substring(4, 6)) - 1;
  const day = parseInt(cleaned.substring(6, 8));
  return new Date(year, month, day);
}

export function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * SQL fragment that extracts a YYYY-MM month key from a date column.
 *
 * SQLite: GnuCash stores dates in two formats in the same column — ISO
 * "YYYY-MM-DD HH:MM:SS" (written by newer SQLite-backend releases) and
 * compact "YYYYMMDDHHMMSS" (written by older ones and by XML-imported
 * files). SQLite's strftime only handles the ISO form, so we dispatch
 * on a LIKE check and fall back to substring slicing.
 *
 * Postgres: the Postgres schema stores dates as proper `timestamp`
 * values (see `db/migrations/0001_gnucash_schema.sql` — matches GnuCash's
 * own libdbi Postgres backend). `to_char(ts, 'YYYY-MM')` handles both
 * zero-padding and null propagation natively.
 */
export function sqlMonth(col: string, dialect: SqlDialect): string {
  if (dialect === "postgres") {
    return `to_char(${col}, 'YYYY-MM')`;
  }
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%Y-%m', ${col}) ELSE substr(${col}, 1, 4) || '-' || substr(${col}, 5, 2) END`;
}

/** SQL fragment that extracts a YYYY year from a date column. */
export function sqlYear(col: string, dialect: SqlDialect): string {
  if (dialect === "postgres") {
    return `to_char(${col}, 'YYYY')`;
  }
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%Y', ${col}) ELSE substr(${col}, 1, 4) END`;
}

/** SQL fragment that extracts a zero-padded MM month number from a date column. */
export function sqlMonthNum(col: string, dialect: SqlDialect): string {
  if (dialect === "postgres") {
    return `to_char(${col}, 'MM')`;
  }
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%m', ${col}) ELSE substr(${col}, 5, 2) END`;
}
