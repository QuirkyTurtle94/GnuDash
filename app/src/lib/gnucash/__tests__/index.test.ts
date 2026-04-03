import { describe, it, expect } from "vitest";
import { parseGnuCashFile } from "../index";
import { FIXTURE_PATH } from "./helpers";

describe("parseGnuCashFile", () => {
  it("returns complete DashboardData", () => {
    const data = parseGnuCashFile(FIXTURE_PATH);

    expect(data.currency).toBe("GBP");
    expect(data.accounts.length).toBeGreaterThan(0);
    expect(data.netWorthSeries.length).toBeGreaterThan(0);
    expect(data.cashFlowSeries.length).toBeGreaterThan(0);
    expect(data.expenseBreakdown.length).toBeGreaterThan(0);
    expect(data.investments.length).toBeGreaterThan(0);
    expect(data.topBalances.length).toBeGreaterThan(0);
    expect(data.ledgerTransactions.length).toBeGreaterThan(0);
    expect(data.budgetData).not.toBeNull();
    expect(typeof data.currentNetWorth).toBe("number");
    expect(typeof data.savingsRate).toBe("number");
  });

  it("snapshot: full DashboardData", () => {
    const data = parseGnuCashFile(FIXTURE_PATH);
    expect(data).toMatchSnapshot();
  });
});
