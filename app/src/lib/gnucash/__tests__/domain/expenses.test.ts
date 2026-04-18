import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeExpenseBreakdown, getExpenseTransactions } from "../../domain/expenses";

afterAll(() => closeTestDb());

describe("computeExpenseBreakdown", () => {
  it("returns categories and monthly data", async () => {
    const result = await computeExpenseBreakdown(await getTestContext());
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.monthly.length).toBeGreaterThan(0);
    expect(result.colors).toBeDefined();
  });

  it("snapshot", async () => {
    expect(await computeExpenseBreakdown(await getTestContext())).toMatchSnapshot();
  });
});

describe("getExpenseTransactions", () => {
  it("returns transactions", async () => {
    const txs = await getExpenseTransactions(await getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("date");
    expect(txs[0]).toHaveProperty("amount");
  });

  it("snapshot", async () => {
    expect(await getExpenseTransactions(await getTestContext())).toMatchSnapshot();
  });
});
