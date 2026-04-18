/**
 * Fuzz + corner-case tests for the SQLite→Postgres placeholder rewrite.
 *
 * The tokenizer is the load-bearing safety piece for the Postgres adapter
 * (see docs/architecture/storage-adapters-security-review.md §0). Any bug
 * here silently corrupts queries or, worse, lets an attacker-controlled
 * string literal shift parameter bindings. The fixtures below aim to
 * cover every surface the reviewer flagged.
 */
import { describe, it, expect } from "vitest";
import { rewritePlaceholders } from "../rewrite-placeholders";

describe("rewritePlaceholders — basic rewriting", () => {
  it("leaves SQL with no placeholders untouched", () => {
    expect(rewritePlaceholders("SELECT 1")).toBe("SELECT 1");
  });

  it("rewrites a single ?", () => {
    expect(rewritePlaceholders("SELECT * FROM t WHERE a = ?"))
      .toBe("SELECT * FROM t WHERE a = $1");
  });

  it("rewrites multiple ? in order", () => {
    expect(rewritePlaceholders("SELECT ?, ?, ?"))
      .toBe("SELECT $1, $2, $3");
  });

  it("rewrites ? at the very start", () => {
    expect(rewritePlaceholders("?")).toBe("$1");
  });

  it("rewrites ? at the very end", () => {
    expect(rewritePlaceholders("SELECT 1 FROM t WHERE a=?"))
      .toBe("SELECT 1 FROM t WHERE a=$1");
  });

  it("handles empty input", () => {
    expect(rewritePlaceholders("")).toBe("");
  });

  it("handles many placeholders", () => {
    const sql = Array(20).fill("?").join(",");
    const expected = Array.from({ length: 20 }, (_, i) => `$${i + 1}`).join(",");
    expect(rewritePlaceholders(sql)).toBe(expected);
  });
});

describe("rewritePlaceholders — single-quoted strings", () => {
  it("does not rewrite ? inside a string literal", () => {
    expect(rewritePlaceholders("SELECT '?' FROM t"))
      .toBe("SELECT '?' FROM t");
  });

  it("handles '' escape inside strings", () => {
    expect(rewritePlaceholders("SELECT 'it''s a ? inside' FROM t WHERE a = ?"))
      .toBe("SELECT 'it''s a ? inside' FROM t WHERE a = $1");
  });

  it("counts ? correctly before and after a string", () => {
    expect(rewritePlaceholders("SELECT ?, '?', ?"))
      .toBe("SELECT $1, '?', $2");
  });

  it("handles multiple adjacent strings", () => {
    expect(rewritePlaceholders("SELECT '?' || '?' || ? FROM t"))
      .toBe("SELECT '?' || '?' || $1 FROM t");
  });
});

describe("rewritePlaceholders — E-strings (backslash escapes)", () => {
  it("does not rewrite ? inside E'...'", () => {
    expect(rewritePlaceholders("SELECT E'a?b' FROM t WHERE x = ?"))
      .toBe("SELECT E'a?b' FROM t WHERE x = $1");
  });

  it("respects backslash escapes in E-strings", () => {
    expect(rewritePlaceholders("SELECT E'back\\\\slash ?' FROM t"))
      .toBe("SELECT E'back\\\\slash ?' FROM t");
  });

  it("handles \\' escape inside E-strings", () => {
    expect(rewritePlaceholders("SELECT E'quote\\'? still inside' FROM t WHERE x = ?"))
      .toBe("SELECT E'quote\\'? still inside' FROM t WHERE x = $1");
  });

  it("handles '' escape inside E-strings", () => {
    expect(rewritePlaceholders("SELECT E'double '' quote ?' FROM t WHERE x = ?"))
      .toBe("SELECT E'double '' quote ?' FROM t WHERE x = $1");
  });

  it("accepts lowercase e'...'", () => {
    expect(rewritePlaceholders("SELECT e'?' FROM t WHERE x = ?"))
      .toBe("SELECT e'?' FROM t WHERE x = $1");
  });

  it("does NOT treat e' after an identifier as an E-string (word boundary)", () => {
    // `employee'x'` is identifier `employee` followed by string `'x'` —
    // the `e'` inside 'employee' must not trigger E-string mode.
    expect(rewritePlaceholders("SELECT employee, ? FROM t"))
      .toBe("SELECT employee, $1 FROM t");
  });
});

describe("rewritePlaceholders — double-quoted identifiers", () => {
  it("does not rewrite ? inside a quoted identifier", () => {
    expect(rewritePlaceholders('SELECT "odd?col" FROM t WHERE a = ?'))
      .toBe('SELECT "odd?col" FROM t WHERE a = $1');
  });

  it('handles "" escape inside identifiers', () => {
    expect(rewritePlaceholders('SELECT "a""b?" FROM t WHERE x = ?'))
      .toBe('SELECT "a""b?" FROM t WHERE x = $1');
  });
});

describe("rewritePlaceholders — line comments", () => {
  it("does not rewrite ? inside a line comment", () => {
    expect(rewritePlaceholders("SELECT 1 -- ? in comment\nFROM t WHERE a = ?"))
      .toBe("SELECT 1 -- ? in comment\nFROM t WHERE a = $1");
  });

  it("line comment without trailing newline", () => {
    expect(rewritePlaceholders("SELECT 1 -- trailing ?"))
      .toBe("SELECT 1 -- trailing ?");
  });

  it("-- in middle of expression still starts a comment", () => {
    // SQL standard: `--` is a line comment regardless of context
    // (outside strings). `SELECT a--?` means SELECT a, followed by line comment.
    expect(rewritePlaceholders("SELECT 1--?\nFROM t WHERE a = ?"))
      .toBe("SELECT 1--?\nFROM t WHERE a = $1");
  });
});

describe("rewritePlaceholders — block comments", () => {
  it("does not rewrite ? inside a block comment", () => {
    expect(rewritePlaceholders("SELECT 1 /* ? skipped */ FROM t WHERE a = ?"))
      .toBe("SELECT 1 /* ? skipped */ FROM t WHERE a = $1");
  });

  it("handles nested block comments (Postgres allows nesting)", () => {
    expect(rewritePlaceholders("SELECT 1 /* outer /* inner ? */ still in outer ? */ FROM t WHERE a = ?"))
      .toBe("SELECT 1 /* outer /* inner ? */ still in outer ? */ FROM t WHERE a = $1");
  });

  it("handles deeply nested block comments", () => {
    expect(rewritePlaceholders("/*/*/*?*/*/*/  ?"))
      .toBe("/*/*/*?*/*/*/  $1");
  });

  it("throws on unterminated block comment", () => {
    expect(() => rewritePlaceholders("SELECT 1 /* unterminated ?"))
      .toThrow(/unterminated block comment/);
  });
});

describe("rewritePlaceholders — dollar-quoted strings", () => {
  it("does not rewrite ? inside $$...$$", () => {
    expect(rewritePlaceholders("SELECT $$a?b$$ FROM t WHERE x = ?"))
      .toBe("SELECT $$a?b$$ FROM t WHERE x = $1");
  });

  it("does not rewrite ? inside $tag$...$tag$", () => {
    expect(rewritePlaceholders("SELECT $body$a?b$body$ FROM t WHERE x = ?"))
      .toBe("SELECT $body$a?b$body$ FROM t WHERE x = $1");
  });

  it("mismatched tags do NOT close the quote", () => {
    expect(rewritePlaceholders("SELECT $outer$ a ? $inner$ b ? $outer$ FROM t WHERE x = ?"))
      .toBe("SELECT $outer$ a ? $inner$ b ? $outer$ FROM t WHERE x = $1");
  });

  it("$1 (Postgres placeholder style) is passed through as literal", () => {
    // Input uses SQLite style, but if a caller accidentally includes $N,
    // the tokenizer leaves it alone — `$` followed by a digit isn't a
    // valid dollar-quote opener (tag must start with letter/underscore).
    expect(rewritePlaceholders("SELECT $1, ? FROM t"))
      .toBe("SELECT $1, $1 FROM t");
  });

  it("throws on unterminated dollar-quoted string", () => {
    expect(() => rewritePlaceholders("SELECT $tag$ open but never closed"))
      .toThrow(/unterminated dollar-quoted string/);
  });
});

describe("rewritePlaceholders — realistic domain-style queries", () => {
  it("handles a dashboard-style WHERE with params", () => {
    const sql = `
      SELECT account_guid, SUM(quantity_num * 1.0 / quantity_denom) AS qty
      FROM splits s JOIN transactions t ON s.tx_guid = t.guid
      WHERE t.post_date BETWEEN ? AND ?
        AND s.account_guid IN (?, ?, ?)
      GROUP BY account_guid
    `;
    const expected = sql
      .replace("BETWEEN ?", "BETWEEN $1")
      .replace("AND ?", "AND $2")
      .replace("IN (?, ?, ?)", "IN ($3, $4, $5)");
    expect(rewritePlaceholders(sql)).toBe(expected);
  });

  it("handles SQLite-style strftime calls (UDF-mapped on Postgres)", () => {
    const sql = "SELECT strftime('%Y-%m', post_date) FROM transactions WHERE guid = ?";
    expect(rewritePlaceholders(sql))
      .toBe("SELECT strftime('%Y-%m', post_date) FROM transactions WHERE guid = $1");
  });

  it("handles multiline SQL with comments and strings", () => {
    const sql = `
      -- look up a transaction by guid
      SELECT * FROM transactions
      WHERE guid = ?  /* the guid we're looking for */
        AND description LIKE '%?%'   -- literal ? in pattern
        AND post_date > ?
    `;
    expect(rewritePlaceholders(sql)).toContain("WHERE guid = $1");
    expect(rewritePlaceholders(sql)).toContain("post_date > $2");
    expect(rewritePlaceholders(sql)).toContain("LIKE '%?%'");
  });
});

describe("rewritePlaceholders — security-review adversarial fixtures", () => {
  it("an attacker-controlled literal cannot shift parameter numbering", () => {
    // If a caller builds SQL like `WHERE name = 'attacker??' AND guid = ?`
    // the two ?s inside the string must NOT be rewritten, so the real
    // parameter stays bound at $1. A regex-based rewriter would mis-number
    // everything after the attacker's injected ?.
    const sql = "WHERE name = 'attacker??' AND guid = ?";
    expect(rewritePlaceholders(sql))
      .toBe("WHERE name = 'attacker??' AND guid = $1");
  });

  it("injected /* and */ inside a string are inert", () => {
    const sql = "WHERE x = '/* ? */' AND y = ?";
    expect(rewritePlaceholders(sql))
      .toBe("WHERE x = '/* ? */' AND y = $1");
  });

  it("injected -- inside a string is inert", () => {
    const sql = "WHERE x = '-- ? not a comment' AND y = ?";
    expect(rewritePlaceholders(sql))
      .toBe("WHERE x = '-- ? not a comment' AND y = $1");
  });

  it("dollar-quote-looking content inside a string is inert", () => {
    const sql = "WHERE x = '$tag$ ? $tag$' AND y = ?";
    expect(rewritePlaceholders(sql))
      .toBe("WHERE x = '$tag$ ? $tag$' AND y = $1");
  });

  it("handles a string containing every kind of quote-breaker", () => {
    const sql = `SELECT 'a''b -- /* ? */ $$x$$ c' AS s, ? AS p`;
    expect(rewritePlaceholders(sql))
      .toBe(`SELECT 'a''b -- /* ? */ $$x$$ c' AS s, $1 AS p`);
  });
});
