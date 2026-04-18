import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { getLedgerTransactions, getRecentTransactions } from "../../domain/ledger";

afterAll(() => closeTestDb());

describe("getLedgerTransactions", () => {
  it("returns all transactions with splits", async () => {
    const txs = await getLedgerTransactions(await getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("splits");
    expect(txs[0].splits.length).toBeGreaterThan(0);
  });

  it("snapshot", async () => {
    expect(await getLedgerTransactions(await getTestContext())).toMatchSnapshot();
  });
});

describe("getRecentTransactions", () => {
  it("returns recent transactions", async () => {
    const txs = await getRecentTransactions(await getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("accountName");
    expect(txs[0]).toHaveProperty("categoryName");
  });

  it("snapshot", async () => {
    expect(await getRecentTransactions(await getTestContext())).toMatchSnapshot();
  });
});
