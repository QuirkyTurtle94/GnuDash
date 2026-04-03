import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeCashFlowSeries } from "../../domain/cash-flow";

afterAll(() => closeTestDb());

describe("computeCashFlowSeries", () => {
  it("returns monthly income/expense data", () => {
    const series = computeCashFlowSeries(getTestContext());
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]).toHaveProperty("income");
    expect(series[0]).toHaveProperty("expenses");
    expect(series[0]).toHaveProperty("net");
  });

  it("snapshot", () => {
    expect(computeCashFlowSeries(getTestContext())).toMatchSnapshot();
  });
});
