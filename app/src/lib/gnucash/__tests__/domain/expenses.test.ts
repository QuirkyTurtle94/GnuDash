import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeExpenseBreakdown, getExpenseTransactions } from "../../domain/expenses";

afterAll(() => closeTestDb());

describe("computeExpenseBreakdown", () => {
  it("returns categories and monthly data", () => {
    const result = computeExpenseBreakdown(getTestContext());
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.monthly.length).toBeGreaterThan(0);
    expect(result.colors).toBeDefined();
  });

  it("snapshot", () => {
    expect(computeExpenseBreakdown(getTestContext())).toMatchSnapshot();
  });
});

describe("getExpenseTransactions", () => {
  it("returns transactions", () => {
    const txs = getExpenseTransactions(getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("date");
    expect(txs[0]).toHaveProperty("amount");
  });

  it("snapshot", () => {
    expect(getExpenseTransactions(getTestContext())).toMatchSnapshot();
  });
});
