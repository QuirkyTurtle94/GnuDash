import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { getUpcomingBills } from "../../domain/bills";

afterAll(() => closeTestDb());

describe("getUpcomingBills", () => {
  it("returns upcoming bills", async () => {
    const bills = await getUpcomingBills(await getTestContext());
    expect(bills.length).toBeGreaterThan(0);
    expect(bills[0]).toHaveProperty("name");
    expect(bills[0]).toHaveProperty("nextDate");
  });

  it("snapshot", async () => {
    expect(await getUpcomingBills(await getTestContext())).toMatchSnapshot();
  });
});
