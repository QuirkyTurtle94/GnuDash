import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWritableMemoryDb } from "../../engine/db/writable-connection";
import { TransactionBuilder } from "../../engine/builders/transaction-builder";
import { AccountBuilder } from "../../engine/builders/account-builder";
import { GncNumeric } from "../../engine/gnc-numeric";
import {
  updateTransaction,
  deleteTransaction,
  voidTransaction,
} from "../../engine/operations/transaction-ops";
import {
  renameAccount,
  reparentAccount,
  deleteAccount,
} from "../../engine/operations/account-ops";
import { addPrice, deletePrice } from "../../engine/operations/price-ops";
import {
  createLot,
  assignSplitToLot,
  getLotBalance,
  closeLotIfBalanced,
} from "../../engine/operations/lot-ops";
import { buildParseContext, type ParseContext } from "../../context";
import type { WritableDbAdapter } from "../../engine/db/writable-adapter";
import { ValidationFailedError } from "../../engine/types";

function seedTestDb(db: WritableDbAdapter) {
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
    "aapl0000000000000000000000000003",
    "NASDAQ",
    "AAPL",
    "Apple Inc",
    10000
  );
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "root0000000000000000000000000001",
    "Root",
    "ROOT",
    "gbp00000000000000000000000000001",
    null,
    0
  );
  db.run(
    `INSERT INTO books (guid, root_account_guid) VALUES (?, ?)`,
    "book0000000000000000000000000001",
    "root0000000000000000000000000001"
  );
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "bank0000000000000000000000000001",
    "Current Account",
    "BANK",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "exp00000000000000000000000000001",
    "Groceries",
    "EXPENSE",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "inc00000000000000000000000000001",
    "Salary",
    "INCOME",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "stck0000000000000000000000000001",
    "AAPL",
    "STOCK",
    "aapl0000000000000000000000000003",
    "root0000000000000000000000000001",
    0
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

// Helper: create a simple transaction and return its GUID
function createSimpleTx(desc = "Test Expense"): string {
  const result = new TransactionBuilder(db, ctx)
    .currency("gbp00000000000000000000000000001")
    .postDate(new Date(2025, 0, 15))
    .description(desc)
    .addSimpleSplit(
      "exp00000000000000000000000000001",
      new GncNumeric(4550, 100)
    )
    .addSimpleSplit(
      "bank0000000000000000000000000001",
      new GncNumeric(-4550, 100)
    )
    .commit();
  return result.transactionGuid;
}

// ── Transaction Operations ──────────────────────────────────────

describe("transaction-ops", () => {
  describe("updateTransaction", () => {
    it("updates description", () => {
      const txGuid = createSimpleTx();
      updateTransaction(db, txGuid, { description: "Updated Description" });

      const tx = db.prepare(`SELECT description FROM transactions WHERE guid = ?`).get(txGuid) as { description: string };
      expect(tx.description).toBe("Updated Description");
    });

    it("updates post_date", () => {
      const txGuid = createSimpleTx();
      updateTransaction(db, txGuid, { postDate: new Date(2025, 5, 1) });

      const tx = db.prepare(`SELECT post_date FROM transactions WHERE guid = ?`).get(txGuid) as { post_date: string };
      expect(tx.post_date).toContain("2025-06-01");
    });

    it("updates num", () => {
      const txGuid = createSimpleTx();
      updateTransaction(db, txGuid, { num: "CHK-001" });

      const tx = db.prepare(`SELECT num FROM transactions WHERE guid = ?`).get(txGuid) as { num: string };
      expect(tx.num).toBe("CHK-001");
    });
  });

  describe("deleteTransaction", () => {
    it("deletes transaction and all splits", () => {
      const txGuid = createSimpleTx();

      // Verify exists
      expect(db.prepare(`SELECT 1 FROM transactions WHERE guid = ?`).get(txGuid)).toBeTruthy();
      expect((db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE tx_guid = ?`).get(txGuid) as { cnt: number }).cnt).toBe(2);

      deleteTransaction(db, txGuid);

      // Verify deleted
      expect(db.prepare(`SELECT 1 FROM transactions WHERE guid = ?`).get(txGuid)).toBeUndefined();
      expect((db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE tx_guid = ?`).get(txGuid) as { cnt: number }).cnt).toBe(0);
    });

    it("rejects deletion of transaction with reconciled splits", () => {
      const txGuid = createSimpleTx();
      // Reconcile a split
      db.run(`UPDATE splits SET reconcile_state = 'y' WHERE tx_guid = ? LIMIT 1`, txGuid);

      expect(() => deleteTransaction(db, txGuid)).toThrow("reconciled");
    });
  });

  describe("voidTransaction", () => {
    it("zeros out splits and prefixes description", () => {
      const txGuid = createSimpleTx("Original Description");
      voidTransaction(db, txGuid, "Entered in error");

      const tx = db.prepare(`SELECT description FROM transactions WHERE guid = ?`).get(txGuid) as { description: string };
      expect(tx.description).toBe("Voided: Original Description");

      // All split values should be zero
      const splits = db.prepare(`SELECT value_num, quantity_num FROM splits WHERE tx_guid = ?`).all(txGuid) as { value_num: number; quantity_num: number }[];
      for (const sp of splits) {
        expect(sp.value_num).toBe(0);
        expect(sp.quantity_num).toBe(0);
      }

      // Void reason stored in slots
      const reason = db.prepare(`SELECT string_val FROM slots WHERE obj_guid = ? AND name = 'void-reason'`).get(txGuid) as { string_val: string };
      expect(reason.string_val).toBe("Entered in error");
    });

    it("rejects voiding an already voided transaction", () => {
      const txGuid = createSimpleTx("Original");
      voidTransaction(db, txGuid, "First void");
      expect(() => voidTransaction(db, txGuid, "Second void")).toThrow("already voided");
    });
  });
});

// ── Account Operations ──────────────────────────────────────────

describe("account-ops", () => {
  describe("AccountBuilder", () => {
    it("creates an account", () => {
      const result = new AccountBuilder(db, ctx)
        .name("Restaurants")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("exp00000000000000000000000000001")
        .commit();

      expect(result.accountGuid).toMatch(/^[0-9a-f]{32}$/);

      const account = db.prepare(`SELECT * FROM accounts WHERE guid = ?`).get(result.accountGuid) as {
        name: string;
        account_type: string;
        commodity_guid: string;
        parent_guid: string;
      };
      expect(account.name).toBe("Restaurants");
      expect(account.account_type).toBe("EXPENSE");
      expect(account.parent_guid).toBe("exp00000000000000000000000000001");
    });

    it("rejects duplicate name under same parent", () => {
      const builder = new AccountBuilder(db, ctx)
        .name("Groceries") // already exists under root
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("root0000000000000000000000000001");

      const errors = builder.validate();
      expect(errors.some(e => e.code === "DUPLICATE_NAME")).toBe(true);
    });
  });

  describe("renameAccount", () => {
    it("renames an account", () => {
      renameAccount(db, "exp00000000000000000000000000001", "Food");
      const account = db.prepare(`SELECT name FROM accounts WHERE guid = ?`).get("exp00000000000000000000000000001") as { name: string };
      expect(account.name).toBe("Food");
    });

    it("rejects empty name", () => {
      expect(() => renameAccount(db, "exp00000000000000000000000000001", "")).toThrow("empty");
    });
  });

  describe("reparentAccount", () => {
    it("reparents an account", () => {
      // Create a new parent
      const parent = new AccountBuilder(db, ctx)
        .name("Food")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("root0000000000000000000000000001")
        .commit();

      // Rebuild context after write
      const ctx2 = buildParseContext(db);

      reparentAccount(db, ctx2, "exp00000000000000000000000000001", parent.accountGuid);

      const account = db.prepare(`SELECT parent_guid FROM accounts WHERE guid = ?`).get("exp00000000000000000000000000001") as { parent_guid: string };
      expect(account.parent_guid).toBe(parent.accountGuid);
    });

    it("rejects circular reparent", () => {
      // Create child of Groceries
      const child = new AccountBuilder(db, ctx)
        .name("Organic")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("exp00000000000000000000000000001")
        .commit();

      const ctx2 = buildParseContext(db);

      // Try to make Groceries a child of Organic (circular)
      expect(() =>
        reparentAccount(db, ctx2, "exp00000000000000000000000000001", child.accountGuid)
      ).toThrow(ValidationFailedError);
    });
  });

  describe("deleteAccount", () => {
    it("deletes an empty account", () => {
      // Create a fresh account with no transactions
      const acc = new AccountBuilder(db, ctx)
        .name("To Delete")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("root0000000000000000000000000001")
        .commit();

      const ctx2 = buildParseContext(db);
      deleteAccount(db, ctx2, acc.accountGuid);

      expect(db.prepare(`SELECT 1 FROM accounts WHERE guid = ?`).get(acc.accountGuid)).toBeUndefined();
    });

    it("rejects deletion of account with splits", () => {
      // Create a transaction posting to the expense account
      createSimpleTx();

      expect(() => deleteAccount(db, ctx, "exp00000000000000000000000000001")).toThrow(ValidationFailedError);
    });
  });
});

// ── Price Operations ────────────────────────────────────────────

describe("price-ops", () => {
  it("adds a price", () => {
    const result = addPrice(
      db,
      "aapl0000000000000000000000000003",
      "gbp00000000000000000000000000001",
      new Date(2025, 2, 31),
      new GncNumeric(13500, 100),
      "user:price",
      "last"
    );

    expect(result.priceGuid).toMatch(/^[0-9a-f]{32}$/);

    const price = db.prepare(`SELECT * FROM prices WHERE guid = ?`).get(result.priceGuid) as {
      value_num: number;
      value_denom: number;
      commodity_guid: string;
    };
    expect(price.value_num).toBe(13500);
    expect(price.value_denom).toBe(100);
    expect(price.commodity_guid).toBe("aapl0000000000000000000000000003");
  });

  it("deletes a price", () => {
    const result = addPrice(
      db,
      "aapl0000000000000000000000000003",
      "gbp00000000000000000000000000001",
      new Date(2025, 2, 31),
      new GncNumeric(13500, 100)
    );

    deletePrice(db, result.priceGuid);
    expect(db.prepare(`SELECT 1 FROM prices WHERE guid = ?`).get(result.priceGuid)).toBeUndefined();
  });
});

// ── Lot Operations ──────────────────────────────────────────────

describe("lot-ops", () => {
  it("creates a lot and assigns splits", () => {
    const lot = createLot(db, "stck0000000000000000000000000001");
    expect(lot.lotGuid).toMatch(/^[0-9a-f]{32}$/);

    // Buy 10 AAPL shares
    const buyResult = new TransactionBuilder(db, ctx)
      .currency("gbp00000000000000000000000000001")
      .postDate(new Date(2025, 0, 10))
      .description("Buy AAPL")
      .addSplit({
        accountGuid: "stck0000000000000000000000000001",
        value: new GncNumeric(120000, 100),
        quantity: new GncNumeric(100000, 10000), // 10 shares
      })
      .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(-120000, 100))
      .commit();

    // Assign buy split to lot
    assignSplitToLot(db, buyResult.splitGuids[0], lot.lotGuid);

    // Check lot balance = 10 shares
    const balance = getLotBalance(db, lot.lotGuid);
    expect(balance.toNumber()).toBe(10);

    // Sell 10 shares
    const sellResult = new TransactionBuilder(db, ctx)
      .currency("gbp00000000000000000000000000001")
      .postDate(new Date(2025, 5, 10))
      .description("Sell AAPL")
      .addSplit({
        accountGuid: "stck0000000000000000000000000001",
        value: new GncNumeric(-135000, 100), // -1350 GBP
        quantity: new GncNumeric(-100000, 10000), // -10 shares
      })
      .addSimpleSplit("bank0000000000000000000000000001", new GncNumeric(135000, 100))
      .commit();

    assignSplitToLot(db, sellResult.splitGuids[0], lot.lotGuid);

    // Lot should now be balanced (zero shares)
    const finalBalance = getLotBalance(db, lot.lotGuid);
    expect(finalBalance.isZero()).toBe(true);

    // Close the lot
    expect(closeLotIfBalanced(db, lot.lotGuid)).toBe(true);

    const lotRow = db.prepare(`SELECT is_closed FROM lots WHERE guid = ?`).get(lot.lotGuid) as { is_closed: number };
    expect(lotRow.is_closed).toBe(1);
  });
});
