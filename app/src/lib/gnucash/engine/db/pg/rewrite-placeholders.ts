/**
 * SQLite → Postgres placeholder rewrite.
 *
 * The project's domain SQL uses SQLite-style `?` placeholders. Postgres uses
 * `$1, $2, ...`. This module rewrites a SQL string by replacing each `?`
 * with `$N` (incrementing per occurrence).
 *
 * Why this file exists: the adversarial security review flagged a naive
 * regex rewrite as the single load-bearing design risk (see
 * docs/architecture/storage-adapters-security-review.md §0). A global
 * replace would corrupt `?`-characters that sit inside string literals,
 * identifier quoting, comments, or dollar-quoted strings — silently breaking
 * queries, or worse, producing a query whose parameter bindings an attacker
 * can influence via a crafted literal. A proper context-aware tokenizer is
 * the required mitigation.
 *
 * The tokenizer recognises:
 *   - Single-quoted strings with `''` escapes ('it''s fine')
 *   - E-strings with backslash escapes and `''` (E'back\\slash' + 'quote''')
 *   - Double-quoted identifiers with `""` escapes ("odd ""name""")
 *   - Dollar-quoted strings with balanced tags ($tag$ ... $tag$, including $$)
 *   - Line comments (-- ... \n)
 *   - Block comments with nesting (Postgres nests slash-star blocks)
 *
 * Only `?` characters outside all of the above are rewritten.
 */

/** Rewrite each `?` placeholder to `$1, $2, ...` positionally. */
export function rewritePlaceholders(sql: string): string {
  const out: string[] = [];
  let i = 0;
  let paramIdx = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    // ── Line comment: -- until newline or EOF ────────────────────────
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? len : end + 1;
      out.push(sql.slice(i, stop));
      i = stop;
      continue;
    }

    // ── Block comment: /* ... */ with nesting ────────────────────────
    if (ch === "/" && next === "*") {
      let depth = 1;
      out.push("/*");
      i += 2;
      while (i < len && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          out.push("/*");
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          out.push("*/");
          i += 2;
        } else {
          out.push(sql[i]);
          i++;
        }
      }
      if (depth !== 0) {
        throw new Error("rewritePlaceholders: unterminated block comment");
      }
      continue;
    }

    // ── E-string: E'...' or e'...' with backslash escapes ────────────
    //
    // Only valid at a word boundary — `employee'x'` is not an E-string,
    // it's identifier + string. Check the previous character isn't part
    // of an identifier.
    if ((ch === "E" || ch === "e") && next === "'") {
      const prev = i > 0 ? sql[i - 1] : "";
      const prevIsIdChar = /[A-Za-z0-9_]/.test(prev);
      if (!prevIsIdChar) {
        out.push(ch);
        out.push("'");
        i += 2;
        while (i < len) {
          const c = sql[i];
          if (c === "\\" && i + 1 < len) {
            out.push(c);
            out.push(sql[i + 1]);
            i += 2;
            continue;
          }
          if (c === "'") {
            if (sql[i + 1] === "'") {
              out.push("''");
              i += 2;
              continue;
            }
            out.push("'");
            i++;
            break;
          }
          out.push(c);
          i++;
        }
        continue;
      }
      // fall through: E is part of an identifier
    }

    // ── Single-quoted string: '...' with '' escape ────────────────────
    if (ch === "'") {
      out.push("'");
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out.push("''");
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out.push("'");
          i++;
          break;
        }
        out.push(sql[i]);
        i++;
      }
      continue;
    }

    // ── Double-quoted identifier: "..." with "" escape ────────────────
    if (ch === '"') {
      out.push('"');
      i++;
      while (i < len) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          out.push('""');
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          out.push('"');
          i++;
          break;
        }
        out.push(sql[i]);
        i++;
      }
      continue;
    }

    // ── Dollar-quoted string: $tag$...$tag$ or $$...$$ ────────────────
    //
    // The opening tag looks like $IDENT? $ — an optional identifier
    // (must start with letter or underscore) between two `$`s. The
    // closing tag is the same string. Postgres doesn't nest dollar
    // quotes; it just looks for the exact matching tag.
    if (ch === "$") {
      const tagMatch = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        out.push(tag);
        i += tag.length;
        const endIdx = sql.indexOf(tag, i);
        if (endIdx === -1) {
          throw new Error(
            `rewritePlaceholders: unterminated dollar-quoted string for tag ${tag}`
          );
        }
        out.push(sql.slice(i, endIdx + tag.length));
        i = endIdx + tag.length;
        continue;
      }
      // Otherwise `$` is just a literal character (e.g. `$1`, `$foo` without
      // closing `$`, `$` in math). Pass through.
    }

    // ── The actual rewrite ───────────────────────────────────────────
    if (ch === "?") {
      paramIdx++;
      out.push(`$${paramIdx}`);
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}
