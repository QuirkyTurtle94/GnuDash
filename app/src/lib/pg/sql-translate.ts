/**
 * Translate engine-emitted SQLite dialect SQL to Postgres.
 *
 * The GnuDash engine emits a narrow subset of SQL:
 *   INSERT INTO t (...) VALUES (?, ?, ...)
 *   UPDATE t SET col = ? WHERE ...
 *   DELETE FROM t WHERE ...
 * The only SQLite-specific syntax inside that subset is the `?` placeholder;
 * Postgres needs numbered `$1, $2, ...` parameters. This helper rewrites
 * placeholders while leaving everything else untouched.
 *
 * Anything that does not begin with an allowed opcode throws so that future
 * dialect drift (e.g. someone introducing `INSERT OR REPLACE` or
 * `last_insert_rowid()`) surfaces as a loud test failure rather than a silent
 * at-runtime bug against a real Postgres.
 *
 * SELECT statements are *not* in the allowlist because the Postgres adapter
 * routes reads to the local WASM cache — a SELECT reaching the translator
 * indicates a bug upstream.
 */

const ALLOWED_OPCODE = /^\s*(INSERT|UPDATE|DELETE)\b/i;

export function translate(sql: string): string {
  if (!ALLOWED_OPCODE.test(sql)) {
    const head = sql.trimStart().slice(0, 60);
    throw new Error(
      `sql-translate: unsupported opcode. Only INSERT/UPDATE/DELETE are allowed; got "${head}${sql.length > 60 ? "..." : ""}"`
    );
  }

  let out = "";
  let paramIdx = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (inSingle) {
      out += ch;
      if (ch === "'") {
        // Doubled '' is the SQL-standard escape for a literal apostrophe and
        // is accepted identically by SQLite and Postgres. Swallow both chars.
        if (sql[i + 1] === "'") {
          out += "'";
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      out += ch;
      continue;
    }

    if (ch === "?") {
      paramIdx += 1;
      out += `$${paramIdx}`;
      continue;
    }

    out += ch;
  }

  if (inSingle || inDouble) {
    throw new Error(
      `sql-translate: unterminated string literal in SQL: ${sql}`
    );
  }

  return out;
}

/** Number of `$N` placeholders the translation will produce for `sql`. */
export function countPlaceholders(sql: string): number {
  let count = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "?") count++;
  }
  return count;
}
