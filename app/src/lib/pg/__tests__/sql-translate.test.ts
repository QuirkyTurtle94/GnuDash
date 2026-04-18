import { describe, expect, it } from "vitest";
import { countPlaceholders, translate } from "../sql-translate";

describe("translate", () => {
  it("rewrites a single-placeholder DELETE", () => {
    expect(translate("DELETE FROM transactions WHERE guid = ?")).toBe(
      "DELETE FROM transactions WHERE guid = $1"
    );
  });

  it("numbers placeholders left-to-right across an INSERT", () => {
    expect(
      translate("INSERT INTO splits (guid, tx_guid, value_num) VALUES (?, ?, ?)")
    ).toBe(
      "INSERT INTO splits (guid, tx_guid, value_num) VALUES ($1, $2, $3)"
    );
  });

  it("numbers placeholders across an UPDATE with SET and WHERE", () => {
    expect(
      translate("UPDATE accounts SET name = ?, hidden = ? WHERE guid = ?")
    ).toBe("UPDATE accounts SET name = $1, hidden = $2 WHERE guid = $3");
  });

  it("leaves ? inside single-quoted literals alone", () => {
    expect(
      translate("INSERT INTO transactions (description) VALUES ('huh?')")
    ).toBe("INSERT INTO transactions (description) VALUES ('huh?')");
  });

  it("honours '' as an escaped apostrophe inside literals", () => {
    // 'O''Brien' is a single string containing O'Brien — the ? before it must
    // still be translated, and the literal must come through unchanged.
    expect(
      translate(
        "UPDATE accounts SET description = 'O''Brien' WHERE name = ?"
      )
    ).toBe(
      "UPDATE accounts SET description = 'O''Brien' WHERE name = $1"
    );
  });

  it("handles a ? immediately after a closed literal", () => {
    expect(
      translate("UPDATE t SET a = 'x', b = ? WHERE c = ?")
    ).toBe("UPDATE t SET a = 'x', b = $1 WHERE c = $2");
  });

  it("passes SQL with no placeholders through unchanged", () => {
    expect(translate("DELETE FROM transactions")).toBe(
      "DELETE FROM transactions"
    );
  });

  it("is case-insensitive on the opcode", () => {
    expect(translate("insert into t (a) values (?)")).toBe(
      "insert into t (a) values ($1)"
    );
  });

  it("tolerates leading whitespace before the opcode", () => {
    expect(translate("  \n  UPDATE t SET a = ? WHERE b = ?")).toBe(
      "  \n  UPDATE t SET a = $1 WHERE b = $2"
    );
  });

  it("throws on an unterminated single-quoted string", () => {
    expect(() =>
      translate("INSERT INTO t (a) VALUES ('oops")
    ).toThrow(/unterminated string literal/i);
  });

  it("throws on SELECT (reads should go to the local cache)", () => {
    expect(() => translate("SELECT * FROM accounts")).toThrow(
      /unsupported opcode/i
    );
  });

  it("throws on DDL", () => {
    expect(() => translate("CREATE TABLE x (id INT)")).toThrow(
      /unsupported opcode/i
    );
  });

  it("throws on PRAGMA", () => {
    expect(() => translate("PRAGMA table_info(accounts)")).toThrow(
      /unsupported opcode/i
    );
  });

  it("throws on BEGIN / COMMIT / ROLLBACK (handled at adapter layer)", () => {
    expect(() => translate("BEGIN IMMEDIATE")).toThrow(/unsupported opcode/i);
    expect(() => translate("COMMIT")).toThrow(/unsupported opcode/i);
    expect(() => translate("ROLLBACK")).toThrow(/unsupported opcode/i);
  });
});

describe("countPlaceholders", () => {
  it("counts ? outside string literals", () => {
    expect(
      countPlaceholders("UPDATE t SET a = ?, b = ? WHERE c = ?")
    ).toBe(3);
  });

  it("ignores ? inside literals and escaped quotes", () => {
    expect(
      countPlaceholders("UPDATE t SET a = 'is this ok?' WHERE b = ?")
    ).toBe(1);
    expect(
      countPlaceholders("UPDATE t SET a = 'O''?Brien' WHERE b = ?")
    ).toBe(1);
  });

  it("returns 0 for parameter-less SQL", () => {
    expect(countPlaceholders("DELETE FROM t")).toBe(0);
  });
});
