import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { getUpcomingBills } from "../../domain/bills";

afterAll(() => closeTestDb());

describe("getUpcomingBills", () => {
  it("returns upcoming bills", () => {
    const bills = getUpcomingBills(getTestContext());
    expect(bills.length).toBeGreaterThan(0);
    expect(bills[0]).toHaveProperty("name");
    expect(bills[0]).toHaveProperty("nextDate");
  });

  it("snapshot", () => {
    expect(getUpcomingBills(getTestContext())).toMatchSnapshot();
  });
});
