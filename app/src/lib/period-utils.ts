/** Represents a user-defined custom date range in YYYY-MM format. */
export interface CustomRange {
  start: string; // "YYYY-MM"
  end: string;   // "YYYY-MM"
}

/** Generate all YYYY-MM strings from start to end inclusive. */
export function getMonthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);

  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

/** Derive { min, max } month from any sorted array with a .month property. */
export function getDataRange(series: { month: string }[]): { min: string; max: string } | null {
  if (series.length === 0) return null;
  return { min: series[0].month, max: series[series.length - 1].month };
}

/** Convert a YYYY-MM month to a 0-based index relative to a minimum month. */
export function monthToIndex(minMonth: string, month: string): number {
  const [my, mm] = minMonth.split("-").map(Number);
  const [ty, tm] = month.split("-").map(Number);
  return (ty - my) * 12 + (tm - mm);
}

/** Convert a 0-based index relative to a minimum month back to YYYY-MM. */
export function indexToMonth(minMonth: string, index: number): string {
  const [my, mm] = minMonth.split("-").map(Number);
  const totalMonths = (my * 12 + mm - 1) + index;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Format YYYY-MM as "Jan 2024" for display. */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

/** Validate a YYYY-MM string. */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}
