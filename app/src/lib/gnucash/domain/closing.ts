import type { ParseContext } from "../context";

/** SQL fragment to exclude book-closing transactions via LEFT JOIN. */
export const EXCLUDE_CLOSING_JOIN =
  `LEFT JOIN slots cl ON cl.obj_guid = t.guid AND cl.name IN ('book-closing', 'book_closing')`;

export const EXCLUDE_CLOSING_WHERE = `cl.id IS NULL`;

/** Check whether the database contains any book-closing transactions. */
export async function hasClosingTransactions(ctx: ParseContext): Promise<boolean> {
  // The slots table may not exist in older GNUCash files
  const tableExists = await ctx.db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='slots'`)
    .get();
  if (!tableExists) return false;

  const row = await ctx.db
    .prepare(`SELECT 1 FROM slots WHERE name IN ('book-closing', 'book_closing') LIMIT 1`)
    .get();
  return !!row;
}
