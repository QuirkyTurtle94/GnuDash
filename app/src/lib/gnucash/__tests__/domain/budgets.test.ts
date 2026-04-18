import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeBudgetData } from "../../domain/budgets";

afterAll(() => closeTestDb());

describe("computeBudgetData", () => {
  it("returns budget data (not null for fixture with budgets)", async () => {
    const data = await computeBudgetData(await getTestContext());
    expect(data).not.toBeNull();
    expect(data!.budgets.length).toBeGreaterThan(0);
  });

  it("snapshot", async () => {
    expect(await computeBudgetData(await getTestContext())).toMatchSnapshot();
  });
});
