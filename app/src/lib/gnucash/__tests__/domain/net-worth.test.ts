import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeNetWorthSeries, computeCurrentNetWorth } from "../../domain/net-worth";

afterAll(() => closeTestDb());

describe("computeNetWorthSeries", () => {
  it("returns monthly data", () => {
    const series = computeNetWorthSeries(getTestContext());
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]).toHaveProperty("month");
    expect(series[0]).toHaveProperty("netWorth");
  });

  it("snapshot", () => {
    expect(computeNetWorthSeries(getTestContext())).toMatchSnapshot();
  });
});

describe("computeCurrentNetWorth", () => {
  it("returns a number", () => {
    const nw = computeCurrentNetWorth(getTestContext());
    expect(typeof nw).toBe("number");
  });

  it("snapshot", () => {
    expect(computeCurrentNetWorth(getTestContext())).toMatchSnapshot();
  });
});
