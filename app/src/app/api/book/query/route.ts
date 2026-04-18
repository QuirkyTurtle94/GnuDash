import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isActiveSession } from "@/lib/server/session";
import { withBookClient } from "@/lib/gnucash/engine/db/pg/with-book-client";
import { PHASE_1_SCHEMA } from "@/lib/gnucash/engine/db/pg/schema-name";
import { dispatchQuery } from "@/lib/server/book-dispatch";

const QuerySchema = z.strictObject({
  fn: z.enum([
    "buildAccountTree",
    "computeNetWorthSeries",
    "computeCurrentNetWorth",
    "computeCashFlowSeries",
    "computeExpenseBreakdown",
    "getExpenseTransactions",
    "computeIncomeBreakdown",
    "getIncomeTransactions",
    "computeInvestments",
    "computeInvestmentValueSeries",
    "computeTopBalances",
    "getLedgerTransactions",
    "getRecentTransactions",
    "computeBudgetData",
    "getUpcomingBills",
    "getFullDashboardData",
  ]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!isActiveSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  const appOrigin = process.env.APP_ORIGIN;
  const origin = req.headers.get("origin");
  if (appOrigin && origin && origin !== appOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const data = await withBookClient(PHASE_1_SCHEMA, (db) =>
      dispatchQuery(db, parsed.data.fn)
    );
    const res = NextResponse.json({ data });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
