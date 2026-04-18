import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeNetWorthSeries, computeCurrentNetWorth } from "../../domain/net-worth";

afterAll(() => closeTestDb());

describe("computeNetWorthSeries", () => {
  it("returns monthly data", async () => {
    const series = await computeNetWorthSeries(await getTestContext());
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]).toHaveProperty("month");
    expect(series[0]).toHaveProperty("netWorth");
  });

  it("snapshot", async () => {
    expect(await computeNetWorthSeries(await getTestContext())).toMatchSnapshot();
  });
});

describe("computeCurrentNetWorth", () => {
  it("returns a number", async () => {
    const nw = await computeCurrentNetWorth(await getTestContext());
    expect(typeof nw).toBe("number");
  });

  it("snapshot", async () => {
    expect(await computeCurrentNetWorth(await getTestContext())).toMatchSnapshot();
  });
});
