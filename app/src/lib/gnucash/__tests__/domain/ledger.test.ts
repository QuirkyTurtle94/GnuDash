import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { getLedgerTransactions, getRecentTransactions } from "../../domain/ledger";

afterAll(() => closeTestDb());

describe("getLedgerTransactions", () => {
  it("returns all transactions with splits", () => {
    const txs = getLedgerTransactions(getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("splits");
    expect(txs[0].splits.length).toBeGreaterThan(0);
  });

  it("snapshot", () => {
    expect(getLedgerTransactions(getTestContext())).toMatchSnapshot();
  });
});

describe("getRecentTransactions", () => {
  it("returns recent transactions", () => {
    const txs = getRecentTransactions(getTestContext());
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0]).toHaveProperty("accountName");
    expect(txs[0]).toHaveProperty("categoryName");
  });

  it("snapshot", () => {
    expect(getRecentTransactions(getTestContext())).toMatchSnapshot();
  });
});
