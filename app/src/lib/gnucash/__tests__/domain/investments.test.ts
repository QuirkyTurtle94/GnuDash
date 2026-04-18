import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { computeInvestments, computeInvestmentValueSeries } from "../../domain/investments";

afterAll(() => closeTestDb());

describe("computeInvestments", () => {
  it("returns holdings", async () => {
    const holdings = await computeInvestments(await getTestContext());
    expect(holdings.length).toBeGreaterThan(0);
    expect(holdings[0]).toHaveProperty("ticker");
    expect(holdings[0]).toHaveProperty("sharesHeld");
    expect(holdings[0]).toHaveProperty("marketValue");
  });

  it("snapshot", async () => {
    expect(await computeInvestments(await getTestContext())).toMatchSnapshot();
  });
});

describe("computeInvestmentValueSeries", () => {
  it("returns monthly values", async () => {
    const series = await computeInvestmentValueSeries(await getTestContext());
    expect(series.length).toBeGreaterThan(0);
  });

  it("snapshot", async () => {
    expect(await computeInvestmentValueSeries(await getTestContext())).toMatchSnapshot();
  });
});
