export type TimePeriod = "this-month" | "last-month" | "last-6m" | "this-year" | "last-12m";

export const PERIOD_LABELS: Record<TimePeriod, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "last-6m": "Last 6 Months",
  "this-year": "This Year",
  "last-12m": "Last 12 Months",
};

export function getMonthsForPeriod(period: TimePeriod): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "this-month":
      return [`${y}-${String(m + 1).padStart(2, "0")}`];
    case "last-month": {
      const d = new Date(y, m - 1, 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`];
    }
    case "last-6m": {
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      return months;
    }
    case "this-year": {
      const months: string[] = [];
      for (let i = 0; i <= m; i++) {
        months.push(`${y}-${String(i + 1).padStart(2, "0")}`);
      }
      return months;
    }
    case "last-12m": {
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      return months;
    }
  }
}
