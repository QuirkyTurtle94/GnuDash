import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeTopBalances } from "../../domain/balances";

afterAll(() => closeTestDb());

describe("computeTopBalances", () => {
  it("returns balances", async () => {
    const balances = await computeTopBalances(await getTestContext());
    expect(balances.length).toBeGreaterThan(0);
    expect(balances[0]).toHaveProperty("accountName");
    expect(balances[0]).toHaveProperty("value");
  });

  it("snapshot", async () => {
    expect(await computeTopBalances(await getTestContext())).toMatchSnapshot();
  });
});
