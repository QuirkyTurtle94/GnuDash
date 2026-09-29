import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_PATH } from "../helpers";
import { buildParseContext } from "../../context";
import { getLedgerTransactions } from "../../domain/ledger";
import { computeCashFlowByCategory } from "../../domain/cash-flow-by-category";
import { generateDemoData } from "@/lib/demo-data";

let db: Database.Database | undefined;
afterEach(() => db?.close());

describe("cash-flow transaction currency", () => {
  it.each(["BANK", "CASH"])("converts KRW %s expenses to CZK using the same rates as the chart", (type) => {
    // Work on an in-memory copy; never modify the GnuCash fixture.
    db = new Database(readFileSync(FIXTURE_PATH));
    const original = buildParseContext(db);
    const expenseParent = original.accounts.find((a) => a.account_type === "EXPENSE" && a.placeholder)!;
    db.exec(`
      INSERT INTO commodities (guid, namespace, mnemonic) VALUES
        ('krw', 'CURRENCY', 'KRW'), ('czk', 'CURRENCY', 'CZK');
      INSERT INTO prices (guid, commodity_guid, currency_guid, date, value_num, value_denom)
        VALUES ('krw-czk', 'krw', 'czk', '20260101000000', 16, 1000);
      INSERT INTO transactions (guid, currency_guid, post_date, description)
        VALUES ('foreign-expense', 'krw', '20260102000000', 'KRW expense');
    `);
    const insertAccount = db.prepare("INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid) VALUES (?, ?, ?, ?, ?)");
    insertAccount.run("krw-cash", "Korean cash", type, "krw", original.rootAccount.guid);
    insertAccount.run("krw-expense", "Korean expense", "EXPENSE", "krw", expenseParent.guid);
    const insertSplit = db.prepare("INSERT INTO splits (guid, tx_guid, account_guid, value_num, value_denom, quantity_num, quantity_denom) VALUES (?, 'foreign-expense', ?, ?, 1, ?, 1)");
    insertSplit.run("cash-split", "krw-cash", -10000, -10000);
    insertSplit.run("expense-split", "krw-expense", 10000, 10000);

    const ctx = buildParseContext(db, "czk");
    const tx = getLedgerTransactions(ctx).find((t) => t.guid === "foreign-expense")!;
    expect(tx.cashAmount).toBeCloseTo(-160);
    expect(tx.splits.find((s) => s.accountGuid === "krw-cash")?.quantity).toBe(-10000);
    const outflow = computeCashFlowByCategory(ctx).outflow.find((c) => c.category === "Korean expense")!;
    expect(outflow.amount).toBeCloseTo(-tx.cashAmount);
    // Changing the dashboard currency must recompute the amount.
    expect(getLedgerTransactions(buildParseContext(db, "krw")).find((t) => t.guid === tx.guid)?.cashAmount).toBe(-10000);
  });

  it("converts each currency before netting a transfer and preserves ordinary cash amounts", () => {
    db = new Database(readFileSync(FIXTURE_PATH));
    const txs = getLedgerTransactions(buildParseContext(db));
    // 500 USD at the latest 0.79 GBP rate, less 400 GBP, is -5 GBP.
    expect(txs.find((t) => t.description === "USD Transfer")?.cashAmount).toBeCloseTo(-5);
    expect(txs.find((t) => t.description === "Salary January")?.cashAmount).toBe(3000);
    expect(txs.find((t) => t.description === "Tesco Groceries")?.cashAmount).toBe(-200);
    expect(txs.find((t) => t.description === "Pizza Express")?.cashAmount).toBe(0);
  });

  it("supplies base-currency cash amounts in demo mode", () => {
    const data = generateDemoData();
    expect(data.ledgerTransactions.length).toBeGreaterThan(0);
    for (const tx of data.ledgerTransactions) {
      const expected = tx.splits.filter((s) => s.accountType === "BANK" || s.accountType === "CASH").reduce((sum, s) => sum + s.quantity, 0);
      expect(tx.cashAmount).toBeCloseTo(expected);
    }
  });
});
