import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeInvestments, computeInvestmentValueSeries } from "../../domain/investments";

afterAll(() => closeTestDb());

describe("computeInvestments", () => {
  it("returns holdings", () => {
    const holdings = computeInvestments(getTestContext());
    expect(holdings.length).toBeGreaterThan(0);
    expect(holdings[0]).toHaveProperty("ticker");
    expect(holdings[0]).toHaveProperty("sharesHeld");
    expect(holdings[0]).toHaveProperty("marketValue");
  });

  it("snapshot", () => {
    expect(computeInvestments(getTestContext())).toMatchSnapshot();
  });
});

describe("computeInvestmentValueSeries", () => {
  it("returns monthly values", () => {
    const series = computeInvestmentValueSeries(getTestContext());
    expect(series.length).toBeGreaterThan(0);
  });

  it("snapshot", () => {
    expect(computeInvestmentValueSeries(getTestContext())).toMatchSnapshot();
  });
});
