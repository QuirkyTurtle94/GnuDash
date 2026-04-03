import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeIncomeBreakdown, getIncomeTransactions } from "../../domain/income";

afterAll(() => closeTestDb());

describe("computeIncomeBreakdown", () => {
  it("returns monthly data with colors", () => {
    const result = computeIncomeBreakdown(getTestContext());
    expect(result.monthly.length).toBeGreaterThan(0);
    expect(result.colors).toBeDefined();
  });

  it("snapshot", () => {
    expect(computeIncomeBreakdown(getTestContext())).toMatchSnapshot();
  });
});

describe("getIncomeTransactions", () => {
  it("returns transactions", () => {
    const txs = getIncomeTransactions(getTestContext());
    expect(txs.length).toBeGreaterThan(0);
  });

  it("snapshot", () => {
    expect(getIncomeTransactions(getTestContext())).toMatchSnapshot();
  });
});
