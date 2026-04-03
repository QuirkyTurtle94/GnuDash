import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeTopBalances } from "../../domain/balances";

afterAll(() => closeTestDb());

describe("computeTopBalances", () => {
  it("returns balances", () => {
    const balances = computeTopBalances(getTestContext());
    expect(balances.length).toBeGreaterThan(0);
    expect(balances[0]).toHaveProperty("accountName");
    expect(balances[0]).toHaveProperty("value");
  });

  it("snapshot", () => {
    expect(computeTopBalances(getTestContext())).toMatchSnapshot();
  });
});
