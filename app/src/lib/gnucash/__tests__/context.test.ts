import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "./helpers";

afterAll(() => closeTestDb());

describe("buildParseContext", () => {
  it("loads accounts, commodities, prices, and derived maps", () => {
    const ctx = getTestContext();

    expect(ctx.baseCurrencyMnemonic).toBe("GBP");
    expect(ctx.accounts.length).toBeGreaterThan(0);
    expect(ctx.commodities.length).toBe(4);
    expect(ctx.prices.length).toBe(7);
    expect(ctx.topExpenseGuids.size).toBeGreaterThan(0);
    expect(ctx.topIncomeGuids.size).toBeGreaterThan(0);
    expect(ctx.latestPrices.size).toBeGreaterThan(0);
  });

  it("snapshot: full context shape (excluding db)", () => {
    const ctx = getTestContext();
    const { db, fxRates, ...rest } = ctx;

    // Convert maps/sets to plain objects for snapshot stability
    const snapshot = {
      ...rest,
      accountMap: Object.fromEntries(rest.accountMap),
      commodityMap: Object.fromEntries(rest.commodityMap),
      latestPrices: Object.fromEntries(rest.latestPrices),
      topExpenseGuids: [...rest.topExpenseGuids].sort(),
      topIncomeGuids: [...rest.topIncomeGuids].sort(),
    };

    expect(snapshot).toMatchSnapshot();
  });
});
