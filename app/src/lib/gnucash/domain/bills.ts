import type { UpcomingBill } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { parseGnuCashDate } from "../shared/dates";

export function getUpcomingBills(ctx: ParseContext): UpcomingBill[] {
  const { db } = ctx;

  const tableCheck = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schedxactions'`)
    .get() as { name: string } | undefined;

  if (!tableCheck) return [];

  const rows = db
    .prepare(
      `SELECT
        sx.guid, sx.name, sx.enabled, sx.start_date, sx.last_occur,
        r.recurrence_mult, r.recurrence_period_type, r.recurrence_period_start
      FROM schedxactions sx
      LEFT JOIN recurrences r ON r.obj_guid = sx.guid
      WHERE sx.enabled = 1
      ORDER BY sx.name`
    )
    .all() as {
    guid: string;
    name: string;
    enabled: number;
    start_date: string;
    last_occur: string | null;
    recurrence_mult: number | null;
    recurrence_period_type: string | null;
    recurrence_period_start: string | null;
  }[];

  return rows.map((row) => {
    let nextDate = row.start_date;
    if (row.last_occur && row.recurrence_mult && row.recurrence_period_type) {
      const last = parseGnuCashDate(row.last_occur);
      const mult = row.recurrence_mult;
      switch (row.recurrence_period_type) {
        case "month":
          last.setMonth(last.getMonth() + mult);
          break;
        case "week":
          last.setDate(last.getDate() + mult * 7);
          break;
        case "day":
          last.setDate(last.getDate() + mult);
          break;
        case "year":
          last.setFullYear(last.getFullYear() + mult);
          break;
      }
      nextDate = last.toISOString().split("T")[0];
    }

    return {
      name: row.name,
      nextDate,
      amount: null,
      enabled: row.enabled === 1,
    };
  });
}
