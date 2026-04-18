import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeIncomeBreakdown, getIncomeTransactions } from "../../domain/income";

afterAll(() => closeTestDb());

describe("computeIncomeBreakdown", () => {
  it("returns monthly data with colors", async () => {
    const result = await computeIncomeBreakdown(await getTestContext());
    expect(result.monthly.length).toBeGreaterThan(0);
    expect(result.colors).toBeDefined();
  });

  it("snapshot", async () => {
    expect(await computeIncomeBreakdown(await getTestContext())).toMatchSnapshot();
  });
});

describe("getIncomeTransactions", () => {
  it("returns transactions", async () => {
    const txs = await getIncomeTransactions(await getTestContext());
    expect(txs.length).toBeGreaterThan(0);
  });

  it("snapshot", async () => {
    expect(await getIncomeTransactions(await getTestContext())).toMatchSnapshot();
  });
});
