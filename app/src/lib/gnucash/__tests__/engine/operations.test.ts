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
import { bulkEditTransactions } from "../../engine/operations/bulk-ops";
import {
  createLot,
  assignSplitToLot,
  getLotBalance,
  closeLotIfBalanced,
} from "../../engine/operations/lot-ops";
import { buildParseContext, type ParseContext } from "../../context";
import type { WritableDbAdapter } from "../../engine/db/writable-adapter";
import { ValidationFailedError } from "../../engine/types";

async function seedTestDb(db: WritableDbAdapter) {
  await db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`,
    "gbp00000000000000000000000000001",
    "CURRENCY",
    "GBP",
    "British Pound",
    100
  );
  await db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, fraction) VALUES (?, ?, ?, ?, ?)`,
    "aapl0000000000000000000000000003",
    "NASDAQ",
    "AAPL",
    "Apple Inc",
    10000
  );
  await db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "root0000000000000000000000000001",
    "Root",
    "ROOT",
    "gbp00000000000000000000000000001",
    null,
    0
  );
  await db.run(
    `INSERT INTO books (guid, root_account_guid) VALUES (?, ?)`,
    "book0000000000000000000000000001",
    "root0000000000000000000000000001"
  );
  await db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "bank0000000000000000000000000001",
    "Current Account",
    "BANK",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  await db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "exp00000000000000000000000000001",
    "Groceries",
    "EXPENSE",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  await db.run(
    `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
    "inc00000000000000000000000000001",
    "Salary",
    "INCOME",
    "gbp00000000000000000000000000001",
    "root0000000000000000000000000001",
    0
  );
  await db.run(
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

beforeEach(async () => {
  db = createWritableMemoryDb();
  await seedTestDb(db);
  ctx = await buildParseContext(db);
});

afterEach(() => {
  db.close();
});

// Helper: create a simple transaction and return its GUID
async function createSimpleTx(desc = "Test Expense"): Promise<string> {
  const result = await new TransactionBuilder(db, ctx)
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
    it("updates description", async () => {
      const txGuid = await createSimpleTx();
      await updateTransaction(db, txGuid, { description: "Updated Description" });

      const tx = (await db.prepare(`SELECT description FROM transactions WHERE guid = ?`).get(txGuid)) as { description: string };
      expect(tx.description).toBe("Updated Description");
    });

    it("updates post_date", async () => {
      const txGuid = await createSimpleTx();
      await updateTransaction(db, txGuid, { postDate: new Date(2025, 5, 1) });

      const tx = (await db.prepare(`SELECT post_date FROM transactions WHERE guid = ?`).get(txGuid)) as { post_date: string };
      expect(tx.post_date).toContain("2025-06-01");
    });

    it("updates num", async () => {
      const txGuid = await createSimpleTx();
      await updateTransaction(db, txGuid, { num: "CHK-001" });

      const tx = (await db.prepare(`SELECT num FROM transactions WHERE guid = ?`).get(txGuid)) as { num: string };
      expect(tx.num).toBe("CHK-001");
    });
  });

  describe("deleteTransaction", () => {
    it("deletes transaction and all splits", async () => {
      const txGuid = await createSimpleTx();

      // Verify exists
      expect(await db.prepare(`SELECT 1 FROM transactions WHERE guid = ?`).get(txGuid)).toBeTruthy();
      expect(((await db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE tx_guid = ?`).get(txGuid)) as { cnt: number }).cnt).toBe(2);

      await deleteTransaction(db, txGuid);

      // Verify deleted
      expect(await db.prepare(`SELECT 1 FROM transactions WHERE guid = ?`).get(txGuid)).toBeUndefined();
      expect(((await db.prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE tx_guid = ?`).get(txGuid)) as { cnt: number }).cnt).toBe(0);
    });

    it("rejects deletion of transaction with reconciled splits", async () => {
      const txGuid = await createSimpleTx();
      // Reconcile a split
      await db.run(`UPDATE splits SET reconcile_state = 'y' WHERE tx_guid = ? LIMIT 1`, txGuid);

      await expect(deleteTransaction(db, txGuid)).rejects.toThrow("reconciled");
    });
  });

  describe("voidTransaction", () => {
    it("zeros out splits and prefixes description", async () => {
      const txGuid = await createSimpleTx("Original Description");
      await voidTransaction(db, txGuid, "Entered in error");

      const tx = (await db.prepare(`SELECT description FROM transactions WHERE guid = ?`).get(txGuid)) as { description: string };
      expect(tx.description).toBe("Voided: Original Description");

      // All split values should be zero
      const splits = (await db.prepare(`SELECT value_num, quantity_num FROM splits WHERE tx_guid = ?`).all(txGuid)) as { value_num: number; quantity_num: number }[];
      for (const sp of splits) {
        expect(sp.value_num).toBe(0);
        expect(sp.quantity_num).toBe(0);
      }

      // Void reason stored in slots
      const reason = (await db.prepare(`SELECT string_val FROM slots WHERE obj_guid = ? AND name = 'void-reason'`).get(txGuid)) as { string_val: string };
      expect(reason.string_val).toBe("Entered in error");
    });

    it("rejects voiding an already voided transaction", async () => {
      const txGuid = await createSimpleTx("Original");
      await voidTransaction(db, txGuid, "First void");
      await expect(voidTransaction(db, txGuid, "Second void")).rejects.toThrow("already voided");
    });
  });
});

// ── Account Operations ──────────────────────────────────────────

describe("account-ops", () => {
  describe("AccountBuilder", () => {
    it("creates an account", async () => {
      const result = await new AccountBuilder(db, ctx)
        .name("Restaurants")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("exp00000000000000000000000000001")
        .commit();

      expect(result.accountGuid).toMatch(/^[0-9a-f]{32}$/);

      const account = (await db.prepare(`SELECT * FROM accounts WHERE guid = ?`).get(result.accountGuid)) as {
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

    // Regression for issue #57: real GnuCash schemas declare commodity_scu
    // NOT NULL. The builder must populate it from the commodity's fraction
    // rather than rely on a default.
    it("sets commodity_scu to the commodity's fraction (issue #57)", async () => {
      const gbpAccount = await new AccountBuilder(db, ctx)
        .name("Hair cuts")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001") // fraction = 100
        .parent("root0000000000000000000000000001")
        .commit();

      const gbpRow = (await db
        .prepare(`SELECT commodity_scu, non_std_scu FROM accounts WHERE guid = ?`)
        .get(gbpAccount.accountGuid)) as { commodity_scu: number; non_std_scu: number };
      expect(gbpRow.commodity_scu).toBe(100);
      expect(gbpRow.non_std_scu).toBe(0);

      const aaplAccount = await new AccountBuilder(db, ctx)
        .name("AAPL Holdings")
        .type("STOCK")
        .commodity("aapl0000000000000000000000000003") // fraction = 10000
        .parent("root0000000000000000000000000001")
        .commit();

      const aaplRow = (await db
        .prepare(`SELECT commodity_scu FROM accounts WHERE guid = ?`)
        .get(aaplAccount.accountGuid)) as { commodity_scu: number };
      expect(aaplRow.commodity_scu).toBe(10000);
    });
  });

  describe("renameAccount", () => {
    it("renames an account", async () => {
      await renameAccount(db, "exp00000000000000000000000000001", "Food");
      const account = (await db.prepare(`SELECT name FROM accounts WHERE guid = ?`).get("exp00000000000000000000000000001")) as { name: string };
      expect(account.name).toBe("Food");
    });

    it("rejects empty name", async () => {
      await expect(renameAccount(db, "exp00000000000000000000000000001", "")).rejects.toThrow("empty");
    });
  });

  describe("reparentAccount", () => {
    it("reparents an account", async () => {
      // Create a new parent
      const parent = await new AccountBuilder(db, ctx)
        .name("Food")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("root0000000000000000000000000001")
        .commit();

      // Rebuild context after write
      const ctx2 = await buildParseContext(db);

      await reparentAccount(db, ctx2, "exp00000000000000000000000000001", parent.accountGuid);

      const account = (await db.prepare(`SELECT parent_guid FROM accounts WHERE guid = ?`).get("exp00000000000000000000000000001")) as { parent_guid: string };
      expect(account.parent_guid).toBe(parent.accountGuid);
    });

    it("rejects circular reparent", async () => {
      // Create child of Groceries
      const child = await new AccountBuilder(db, ctx)
        .name("Organic")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("exp00000000000000000000000000001")
        .commit();

      const ctx2 = await buildParseContext(db);

      // Try to make Groceries a child of Organic (circular)
      await expect(
        reparentAccount(db, ctx2, "exp00000000000000000000000000001", child.accountGuid)
      ).rejects.toThrow(ValidationFailedError);
    });
  });

  describe("deleteAccount", () => {
    it("deletes an empty account", async () => {
      // Create a fresh account with no transactions
      const acc = await new AccountBuilder(db, ctx)
        .name("To Delete")
        .type("EXPENSE")
        .commodity("gbp00000000000000000000000000001")
        .parent("root0000000000000000000000000001")
        .commit();

      const ctx2 = await buildParseContext(db);
      await deleteAccount(db, ctx2, acc.accountGuid);

      expect(await db.prepare(`SELECT 1 FROM accounts WHERE guid = ?`).get(acc.accountGuid)).toBeUndefined();
    });

    it("rejects deletion of account with splits", async () => {
      // Create a transaction posting to the expense account
      await createSimpleTx();

      await expect(deleteAccount(db, ctx, "exp00000000000000000000000000001")).rejects.toThrow(ValidationFailedError);
    });
  });
});

// ── Price Operations ────────────────────────────────────────────

describe("price-ops", () => {
  it("adds a price", async () => {
    const result = await addPrice(
      db,
      "aapl0000000000000000000000000003",
      "gbp00000000000000000000000000001",
      new Date(2025, 2, 31),
      new GncNumeric(13500, 100),
      "user:price",
      "last"
    );

    expect(result.priceGuid).toMatch(/^[0-9a-f]{32}$/);

    const price = (await db.prepare(`SELECT * FROM prices WHERE guid = ?`).get(result.priceGuid)) as {
      value_num: number;
      value_denom: number;
      commodity_guid: string;
    };
    expect(price.value_num).toBe(13500);
    expect(price.value_denom).toBe(100);
    expect(price.commodity_guid).toBe("aapl0000000000000000000000000003");
  });

  it("deletes a price", async () => {
    const result = await addPrice(
      db,
      "aapl0000000000000000000000000003",
      "gbp00000000000000000000000000001",
      new Date(2025, 2, 31),
      new GncNumeric(13500, 100)
    );

    await deletePrice(db, result.priceGuid);
    expect(await db.prepare(`SELECT 1 FROM prices WHERE guid = ?`).get(result.priceGuid)).toBeUndefined();
  });
});

// ── Lot Operations ──────────────────────────────────────────────

describe("lot-ops", () => {
  it("creates a lot and assigns splits", async () => {
    const lot = await createLot(db, "stck0000000000000000000000000001");
    expect(lot.lotGuid).toMatch(/^[0-9a-f]{32}$/);

    // Buy 10 AAPL shares
    const buyResult = await new TransactionBuilder(db, ctx)
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
    await assignSplitToLot(db, buyResult.splitGuids[0], lot.lotGuid);

    // Check lot balance = 10 shares
    const balance = await getLotBalance(db, lot.lotGuid);
    expect(balance.toNumber()).toBe(10);

    // Sell 10 shares
    const sellResult = await new TransactionBuilder(db, ctx)
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

    await assignSplitToLot(db, sellResult.splitGuids[0], lot.lotGuid);

    // Lot should now be balanced (zero shares)
    const finalBalance = await getLotBalance(db, lot.lotGuid);
    expect(finalBalance.isZero()).toBe(true);

    // Close the lot
    expect(await closeLotIfBalanced(db, lot.lotGuid)).toBe(true);

    const lotRow = (await db.prepare(`SELECT is_closed FROM lots WHERE guid = ?`).get(lot.lotGuid)) as { is_closed: number };
    expect(lotRow.is_closed).toBe(1);
  });
});

// ── Bulk transaction operations ─────────────────────────────────

describe("bulk-ops", () => {
  const GBP = "gbp00000000000000000000000000001";
  const BANK = "bank0000000000000000000000000001";
  const GROCERIES = "exp00000000000000000000000000001";
  const ENTERTAINMENT = "exp00000000000000000000000000002";
  const SAVINGS = "bank0000000000000000000000000002";
  const AAPL_ACCOUNT = "stck0000000000000000000000000001";

  async function seedExtraAccounts() {
    await db.run(
      `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
      ENTERTAINMENT, "Entertainment", "EXPENSE", GBP, "root0000000000000000000000000001", 0,
    );
    await db.run(
      `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, placeholder) VALUES (?, ?, ?, ?, ?, ?)`,
      SAVINGS, "Savings Account", "BANK", GBP, "root0000000000000000000000000001", 0,
    );
  }

  async function createGbpTx(desc: string, expenseGuid = GROCERIES, bankGuid = BANK): Promise<string> {
    const result = await new TransactionBuilder(db, ctx)
      .currency(GBP)
      .postDate(new Date(2025, 0, 15))
      .description(desc)
      .addSimpleSplit(expenseGuid, new GncNumeric(4550, 100))
      .addSimpleSplit(bankGuid, new GncNumeric(-4550, 100))
      .commit();
    return result.transactionGuid;
  }

  it("renames description across all transactions in a group", async () => {
    const a = await createGbpTx("TESCO STORES 4412");
    const b = await createGbpTx("TESCO STORES 4412");
    const c = await createGbpTx("TESCO STORES 4412");

    const result = await bulkEditTransactions(db, {
      transactionGuids: [a, b, c],
      newDescription: "Tesco",
    });

    expect(result.descriptionsUpdated).toBe(3);
    const rows = (await db.prepare(
      `SELECT description FROM transactions WHERE guid IN (?, ?, ?)`,
    ).all(a, b, c)) as { description: string }[];
    expect(rows.every((r) => r.description === "Tesco")).toBe(true);
  });

  it("reassigns the 'from' (source) account on all transactions", async () => {
    await seedExtraAccounts();
    const a = await createGbpTx("Lunch");
    const b = await createGbpTx("Lunch");

    await bulkEditTransactions(db, {
      transactionGuids: [a, b],
      newFromAccountGuid: SAVINGS,
    });

    // The negative-value split on each tx should now point at SAVINGS
    const fromSplits = (await db.prepare(
      `SELECT account_guid FROM splits WHERE tx_guid IN (?, ?) AND value_num < 0`,
    ).all(a, b)) as { account_guid: string }[];
    expect(fromSplits).toHaveLength(2);
    expect(fromSplits.every((s) => s.account_guid === SAVINGS)).toBe(true);

    // The positive-value (destination) split should still point at GROCERIES
    const toSplits = (await db.prepare(
      `SELECT account_guid FROM splits WHERE tx_guid IN (?, ?) AND value_num > 0`,
    ).all(a, b)) as { account_guid: string }[];
    expect(toSplits.every((s) => s.account_guid === GROCERIES)).toBe(true);
  });

  it("reassigns the 'to' (destination) account on all transactions", async () => {
    await seedExtraAccounts();
    const a = await createGbpTx("Cinema");
    const b = await createGbpTx("Cinema");

    await bulkEditTransactions(db, {
      transactionGuids: [a, b],
      newToAccountGuid: ENTERTAINMENT,
    });

    const toSplits = (await db.prepare(
      `SELECT account_guid FROM splits WHERE tx_guid IN (?, ?) AND value_num > 0`,
    ).all(a, b)) as { account_guid: string }[];
    expect(toSplits.every((s) => s.account_guid === ENTERTAINMENT)).toBe(true);

    // The source split should still point at BANK
    const fromSplits = (await db.prepare(
      `SELECT account_guid FROM splits WHERE tx_guid IN (?, ?) AND value_num < 0`,
    ).all(a, b)) as { account_guid: string }[];
    expect(fromSplits.every((s) => s.account_guid === BANK)).toBe(true);
  });

  it("rolls back and throws when a target account has mismatched commodity", async () => {
    const a = await createGbpTx("Coffee");
    const b = await createGbpTx("Coffee");
    const originalDescription = "Coffee";

    // AAPL_ACCOUNT has commodity AAPL, not GBP — should refuse the batch
    await expect(
      bulkEditTransactions(db, {
        transactionGuids: [a, b],
        newDescription: "Starbucks",
        newToAccountGuid: AAPL_ACCOUNT,
      }),
    ).rejects.toThrow(/commodity does not match/i);

    // Nothing should have changed because the whole batch rolls back
    const rows = (await db.prepare(
      `SELECT description FROM transactions WHERE guid IN (?, ?)`,
    ).all(a, b)) as { description: string }[];
    expect(rows.every((r) => r.description === originalDescription)).toBe(true);
  });

  it("rolls back and throws when any transaction has more than 2 splits", async () => {
    // Create a simple 2-split transaction
    const simple = await createGbpTx("Snack");

    // Create a 3-split transaction (one bank, two expense categories)
    const multi = (await new TransactionBuilder(db, ctx)
      .currency(GBP)
      .postDate(new Date(2025, 1, 3))
      .description("Big shop")
      .addSimpleSplit(GROCERIES, new GncNumeric(3000, 100))
      .addSimpleSplit(GROCERIES, new GncNumeric(2000, 100))
      .addSimpleSplit(BANK, new GncNumeric(-5000, 100))
      .commit())
      .transactionGuid;

    await expect(
      bulkEditTransactions(db, {
        transactionGuids: [simple, multi],
        newDescription: "Anything",
      }),
    ).rejects.toThrow(/requires exactly 2/);

    // Nothing changed — both descriptions are as originally created
    const rows = (await db.prepare(
      `SELECT description FROM transactions WHERE guid IN (?, ?) ORDER BY description`,
    ).all(simple, multi)) as { description: string }[];
    expect(rows.map((r) => r.description).sort()).toEqual(["Big shop", "Snack"]);
  });

  it("rejects empty input and no-op input", async () => {
    await expect(bulkEditTransactions(db, { transactionGuids: [] })).rejects.toThrow(/empty/);
    const a = await createGbpTx("x");
    await expect(bulkEditTransactions(db, { transactionGuids: [a] })).rejects.toThrow(/no changes/);
  });

  it("applies rename and both account reassignments in one call", async () => {
    await seedExtraAccounts();
    const a = await createGbpTx("AMZN PURCHASE");
    const b = await createGbpTx("AMZN PURCHASE");

    const result = await bulkEditTransactions(db, {
      transactionGuids: [a, b],
      newDescription: "Amazon",
      newFromAccountGuid: SAVINGS,
      newToAccountGuid: ENTERTAINMENT,
    });

    expect(result.descriptionsUpdated).toBe(2);
    expect(result.fromSplitsUpdated).toBe(2);
    expect(result.toSplitsUpdated).toBe(2);

    const descRows = (await db.prepare(
      `SELECT description FROM transactions WHERE guid IN (?, ?)`,
    ).all(a, b)) as { description: string }[];
    expect(descRows.every((r) => r.description === "Amazon")).toBe(true);

    const splits = (await db.prepare(
      `SELECT tx_guid, account_guid, value_num FROM splits WHERE tx_guid IN (?, ?)`,
    ).all(a, b)) as { tx_guid: string; account_guid: string; value_num: number }[];

    for (const s of splits) {
      if (s.value_num < 0) expect(s.account_guid).toBe(SAVINGS);
      else expect(s.account_guid).toBe(ENTERTAINMENT);
    }
  });
});
