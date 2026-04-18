/** Parse a GnuCash compact date (YYYYMMDDHHmmss) into a JS Date (day precision). */
export function parseGnuCashDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const cleaned = dateStr.replace(/[-: ]/g, "");
  const year = parseInt(cleaned.substring(0, 4));
  const month = parseInt(cleaned.substring(4, 6)) - 1;
  const day = parseInt(cleaned.substring(6, 8));
  return new Date(year, month, day);
}

/** Format a Date as YYYYMMDDHHmmss for GnuCash DB storage. */
export function formatGnuCashDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}${hh}${mm}${ss}`;
}

export function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Extract YYYY-MM from a compact YYYYMMDDHHmmss column in SQL. */
export function sqlMonth(col: string): string {
  return `substr(${col}, 1, 4) || '-' || substr(${col}, 5, 2)`;
}

/** Extract YYYY from a compact YYYYMMDDHHmmss column in SQL. */
export function sqlYear(col: string): string {
  return `substr(${col}, 1, 4)`;
}

/** Extract zero-padded month number (01–12) from a compact YYYYMMDDHHmmss column in SQL. */
export function sqlMonthNum(col: string): string {
  return `substr(${col}, 5, 2)`;
}
