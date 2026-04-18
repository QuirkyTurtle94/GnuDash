import path from "path";
import { openAndValidate } from "../db/connection";
import { buildParseContext, type ParseContext } from "../context";
import type { DbAdapter } from "../db/adapter";

export const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "test.gnucash"
);

let _ctx: ParseContext | null = null;
let _dbRef: DbAdapter | null = null;

/**
 * Returns a shared ParseContext backed by the test fixture.
 * The DB is opened once and reused across all tests in a suite.
 */
export async function getTestContext(): Promise<ParseContext> {
  if (!_ctx) {
    _dbRef = await openAndValidate(FIXTURE_PATH);
    _ctx = await buildParseContext(_dbRef);
  }
  return _ctx;
}

export function closeTestDb(): void {
  if (_dbRef) {
    _dbRef.close();
    _dbRef = null;
    _ctx = null;
  }
}
