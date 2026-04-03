import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";

afterAll(() => closeTestDb());

describe("buildFxRateMap (via context)", () => {
  it("converts USD to GBP", () => {
    const ctx = getTestContext();
    // Find the USD commodity GUID
    const usd = ctx.commodities.find((c) => c.mnemonic === "USD");
    expect(usd).toBeDefined();

    const rate = ctx.fxRates.rate(usd!.guid);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1); // GBP is worth more than USD

    // 100 USD should convert to ~79-80 GBP
    const converted = ctx.fxRates.toBase(usd!.guid, 100);
    expect(converted).toBeGreaterThanOrEqual(70);
    expect(converted).toBeLessThanOrEqual(90);
  });

  it("returns 1 for base currency", () => {
    const ctx = getTestContext();
    const rate = ctx.fxRates.rate(ctx.baseCurrencyGuid);
    expect(rate).toBe(1);
  });

  it("snapshot: rates for all commodities", () => {
    const ctx = getTestContext();
    const rates: Record<string, number> = {};
    for (const c of ctx.commodities) {
      rates[c.mnemonic] = ctx.fxRates.rate(c.guid);
    }
    expect(rates).toMatchSnapshot();
  });
});
