import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWritableMemoryDb } from "../../engine/db/writable-connection";
import { TransactionBuilder } from "../../engine/builders/transaction-builder";
import { GncNumeric } from "../../engine/gnc-numeric";
import { ValidationFailedError } from "../../engine/types";
import { buildParseContext, type ParseContext } from "../../context";
import type { WritableDbAdapter } from "../../engine/db/writable-adapter";

// ── Test fixtures ──────────────────────────────────────────────

function seedTestDb(db: WritableDbAdapter) {
  // Base currency: GBP
  db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`,
    "gbp00000000000000000000000000001",
    "CURRENCY",
    "GBP",
    "British Pound",
    100
  );
  db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`,
    "usd00000000000000000000000000002",
    "CURRENCY",
    "USD",
    "US Dollar",
    100
  );
  db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`,
    "aapl0000000000000000000000000003",
    "NASDAQ",
    "AAPL",
    "Apple Inc",
    10000
  );

  // Root account
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "root0000000000000000000000000001",
    "Root",
    "ROOT",
    "gbp00000000000000000000000000001",
    null,
    0
  );

  // Book
  db.run(
    `INSERT INTO books (guid, root_account_guid) VALUES (?, ?)`,
    "book0000000000000000000000000001",
    "root0000000000000000000000000001"
  );

  // Bank account (GBP)
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "bank0000000000000000000000000001",
    "Current Account",
    "BANK",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );

  // Expense account (GBP)
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "exp00000000000000000000000000001",
    "Groceries",
    "EXPENSE",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );

  // Income account (GBP)
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "inc00000000000000000000000000001",
    "Salary",
    "INCOME",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );

  // USD bank account
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "usdb0000000000000000000000000001",
    "USD Account",
    "BANK",
    "usd00000000000000000000000000002",
    "root0000000000000000000000000001",
    0
  );

  // Stock account (AAPL)
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "stck0000000000000000000000000001",
    "AAPL",
    "STOCK",
    "aapl0000000000000000000000000003",
    "root0000000000000000000000000001",
    0
  );

  // Placeholder account (cannot hold transactions)
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "phld0000000000000000000000000001",
    "Assets Group",
    "ASSET",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    1
  );
}

let db: WritableDbAdapter;
let ctx: ParseContext;

beforeEach(() => {
  db = createWritableMemoryDb();
  seedTestDb(db);
  ctx = buildParseContext(db);
});

afterEach(() => {
  db.close();
});

// ── Tests ──────────────────────────────────────────────────────

describe("TransactionBuilder", () => {
  describe("simple same-currency transaction", () => {
    it("creates a balanced expense transaction", () => {
      const result = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Tesco Groceries")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(4550, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-4550, 100))
        .commit();

      expect(result.transactionGuid).toMatch(/^[0-9a-f]{32}$/);
      expect(result.splitGuids).toHaveLength(2);

      // Verify in DB
      const tx = db.prepare(`SELECT * FROM transactions WHERE guid = ?`).get(result.transactionGuid) as {
        description: string;
        currency_guid: string;
      };
      expect(tx.description).toBe("Tesco Groceries");
      expect(tx.currency_guid).toBe("gbp00000000000000000000000000001");

      // Verify splits
      const splits = db.prepare(`SELECT * FROM splits WHERE tx_guid = ?`).all(result.transactionGuid) as {
        value_num: number;
        value_denom: number;
        quantity_num: number;
        quantity_denom: number;
        account_guid: string;
      }[];
      expect(splits).toHaveLength(2);

      // Values must balance to zero
      const valueSum = splits.reduce((s, sp) => s + sp.value_num, 0);
      expect(valueSum).toBe(0);

      // For same-currency: value === quantity
      for (const sp of splits) {
        expect(sp.value_num).toBe(sp.quantity_num);
        expect(sp.value_denom).toBe(sp.quantity_denom);
      }
    });

    it("creates a salary income transaction", () => {
      const result = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 28))
        .description("Salary January")
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(300000, 100))
        .addSimpleSplit("inc00000000000000000000000000001", new GncNumeric(-300000, 100))
        .commit();

      const splits = db.prepare(`SELECT value_num FROM splits WHERE tx_guid = ?`).all(result.transactionGuid) as { value_num: number }[];
      const sum = splits.reduce((s, sp) => s + sp.value_num, 0);
      expect(sum).toBe(0);
    });

    it("handles multi-split transactions (split expense)", () => {
      const result = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 20))
        .description("Grocery and Restaurant")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(3000, 100)) // 30.00
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(1500, 100)) // 15.00
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-4500, 100)) // -45.00
        .commit();

      const splits = db.prepare(`SELECT * FROM splits WHERE tx_guid = ?`).all(result.transactionGuid);
      expect(splits).toHaveLength(3);
    });
  });

  describe("multi-currency transaction", () => {
    it("creates an FX transaction with different value and quantity", () => {
      // Transfer 400 GBP → 500 USD
      const result = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 12))
        .description("USD Transfer")
        .addSplit({
          accountGuid: "usdb0000000000000000000000000001",
          value: new GncNumeric(40000, 100), // 400 GBP (transaction currency)
          quantity: new GncNumeric(50000, 100), // 500 USD (account commodity)
        })
        .addSplit({
          accountGuid: "bank0000000000000000000000000001",
          value: new GncNumeric(-40000, 100), // -400 GBP
          quantity: new GncNumeric(-40000, 100), // -400 GBP
        })
        .commit();

      const splits = db.prepare(
        `SELECT account_guid, value_num, value_denom, quantity_num, quantity_denom
         FROM splits WHERE tx_guid = ?`
      ).all(result.transactionGuid) as {
        account_guid: string;
        value_num: number;
        value_denom: number;
        quantity_num: number;
        quantity_denom: number;
      }[];

      // Values balance in transaction currency (GBP)
      const valueSum = splits.reduce((s, sp) => s + sp.value_num, 0);
      expect(valueSum).toBe(0);

      // USD account has different quantity
      const usdSplit = splits.find(s => s.account_guid === "usdb0000000000000000000000000001")!;
      expect(usdSplit.value_num).toBe(40000); // 400 GBP
      expect(usdSplit.quantity_num).toBe(50000); // 500 USD
    });

    it("creates a stock purchase with shares as quantity", () => {
      // Buy 10 AAPL for 1200 GBP
      const result = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 10))
        .description("Buy AAPL")
        .addSplit({
          accountGuid: "stck0000000000000000000000000001",
          value: new GncNumeric(120000, 100), // 1200 GBP
          quantity: new GncNumeric(100000, 10000), // 10 shares
        })
        .addSplit({
          accountGuid: "bank0000000000000000000000000001",
          value: new GncNumeric(-120000, 100),
          quantity: new GncNumeric(-120000, 100),
        })
        .commit();

      const stockSplit = db.prepare(
        `SELECT value_num, value_denom, quantity_num, quantity_denom
         FROM splits WHERE tx_guid = ? AND account_guid = ?`
      ).get(result.transactionGuid, "stck0000000000000000000000000001") as {
        value_num: number;
        value_denom: number;
        quantity_num: number;
        quantity_denom: number;
      };

      expect(stockSplit.value_num).toBe(120000);
      expect(stockSplit.value_denom).toBe(100);
      expect(stockSplit.quantity_num).toBe(100000);
      expect(stockSplit.quantity_denom).toBe(10000);
      expect(stockSplit.value_num / stockSplit.value_denom).toBe(1200); // 1200 GBP
      expect(stockSplit.quantity_num / stockSplit.quantity_denom).toBe(10); // 10 shares
    });
  });

  describe("validation", () => {
    it("rejects unbalanced splits", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Unbalanced")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(500, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-499, 100));

      expect(() => builder.commit()).toThrow(ValidationFailedError);

      const errors = builder.validate();
      expect(errors.some(e => e.code === "SPLITS_UNBALANCED")).toBe(true);
    });

    it("rejects fewer than 2 splits", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("One split")
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(500, 100));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "TOO_FEW_SPLITS")).toBe(true);
    });

    it("rejects unknown account GUID", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Bad account")
        .addSimpleSplit("nonexistent00000000000000000001", new GncNumeric(500, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-500, 100));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "UNKNOWN_ACCOUNT")).toBe(true);
    });

    it("rejects posting to placeholder account", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Placeholder post")
        .addSimpleSplit("phld0000000000000000000000000001", new GncNumeric(500, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-500, 100));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "PLACEHOLDER_ACCOUNT")).toBe(true);
    });

    it("rejects wrong value denominator", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Wrong denom")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(500, 1000)) // wrong: GBP uses 100
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-500, 1000));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "VALUE_DENOM_MISMATCH")).toBe(true);
    });

    it("rejects wrong quantity denominator for stock", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 10))
        .description("Wrong stock denom")
        .addSplit({
          accountGuid: "stck0000000000000000000000000001",
          value: new GncNumeric(120000, 100),
          quantity: new GncNumeric(10, 100), // wrong: AAPL uses 10000
        })
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-120000, 100));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "QUANTITY_DENOM_MISMATCH")).toBe(true);
    });

    it("rejects missing description", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(500, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-500, 100));

      const errors = builder.validate();
      expect(errors.some(e => e.code === "MISSING_DESCRIPTION")).toBe(true);
    });

    it("validate() returns empty array for valid transaction", () => {
      const builder = new TransactionBuilder(db, ctx)
        .currency("gbp00000000000000000000000000001")
        .postDate(new Date(2025, 0, 15))
        .description("Valid")
        .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(500, 100))
        .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-500, 100));

      expect(builder.validate()).toEqual([]);
    });
  });

  describe("atomicity", () => {
    it("rolls back on validation failure (no partial writes)", () => {
      const txCountBefore = (db.prepare(`SELECT COUNT(*) AS cnt FROM transactions`).get() as { cnt: number }).cnt;

      try {
        new TransactionBuilder(db, ctx)
          .currency("gbp00000000000000000000000000001")
          .postDate(new Date(2025, 0, 15))
          .description("Unbalanced")
          .addSimpleSplit("exp00000000000000000000000000001", new GncNumeric(500, 100))
          .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-499, 100))
          .commit();
      } catch {
        // expected
      }

      const txCountAfter = (db.prepare(`SELECT COUNT(*) AS cnt FROM transactions`).get() as { cnt: number }).cnt;
      expect(txCountAfter).toBe(txCountBefore);
    });
  });
});
