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

// GNUCash stores dates as either ISO "YYYY-MM-DD HH:MM:SS" or compact "YYYYMMDDHHMMSS".
// SQLite's strftime only handles ISO, so these helpers normalise both formats in SQL.
export function sqlMonth(col: string): string {
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%Y-%m', ${col}) ELSE substr(${col}, 1, 4) || '-' || substr(${col}, 5, 2) END`;
}

export function sqlYear(col: string): string {
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%Y', ${col}) ELSE substr(${col}, 1, 4) END`;
}

export function sqlMonthNum(col: string): string {
  return `CASE WHEN ${col} LIKE '____-__-%' THEN strftime('%m', ${col}) ELSE substr(${col}, 5, 2) END`;
}
