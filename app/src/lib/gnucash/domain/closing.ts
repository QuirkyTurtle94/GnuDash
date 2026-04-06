import type { ParseContext } from "../context";

/** SQL fragment to exclude book-closing transactions via LEFT JOIN. */
export const EXCLUDE_CLOSING_JOIN =
  `LEFT JOIN slots cl ON cl.obj_guid = t.guid AND cl.name = 'book-closing'`;

export const EXCLUDE_CLOSING_WHERE = `cl.id IS NULL`;

/** Check whether the database contains any book-closing transactions. */
export function hasClosingTransactions(ctx: ParseContext): boolean {
  // The slots table may not exist in older GNUCash files
  const tableExists = ctx.db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='slots'`)
    .get();
  if (!tableExists) return false;

  const row = ctx.db
    .prepare(`SELECT 1 FROM slots WHERE name = 'book-closing' LIMIT 1`)
    .get();
  return !!row;
}
