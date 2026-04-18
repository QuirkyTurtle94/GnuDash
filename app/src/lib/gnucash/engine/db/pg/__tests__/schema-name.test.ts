import { describe, it, expect } from "vitest";
import { isValidSchemaName, assertValidSchemaName } from "../schema-name";

describe("isValidSchemaName", () => {
  it("accepts the Phase 1 fixed schema", () => {
    expect(isValidSchemaName("gnudash_book")).toBe(true);
  });

  it("accepts Phase 2 book_<uuid> schemas", () => {
    expect(isValidSchemaName("book_a1b2c3d4_e5f6_7890_abcd_ef0123456789")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidSchemaName("")).toBe(false);
  });

  it("rejects injection-looking content", () => {
    expect(isValidSchemaName("gnudash_book; DROP TABLE accounts")).toBe(false);
    expect(isValidSchemaName("gnudash_book, public")).toBe(false);
    expect(isValidSchemaName("book_'; SELECT 1 --")).toBe(false);
    expect(isValidSchemaName("\"gnudash_book\"")).toBe(false);
    expect(isValidSchemaName("pg_catalog")).toBe(false);
    expect(isValidSchemaName("public")).toBe(false);
  });

  it("rejects case variants — names must be exact", () => {
    expect(isValidSchemaName("Gnudash_Book")).toBe(false);
    expect(isValidSchemaName("GNUDASH_BOOK")).toBe(false);
  });

  it("rejects Phase 2 names with uppercase hex", () => {
    expect(isValidSchemaName("book_A1B2C3D4_e5f6_7890_abcd_ef0123456789")).toBe(false);
  });

  it("rejects Phase 2 names with wrong dash count", () => {
    expect(isValidSchemaName("book_a1b2c3d4e5f67890abcdef0123456789")).toBe(false);
    expect(isValidSchemaName("book_a1b2c3d4-e5f6-7890-abcd-ef0123456789")).toBe(false);
  });

  it("assertValidSchemaName throws on invalid", () => {
    expect(() => assertValidSchemaName("bad; --")).toThrow(/Invalid book schema name/);
  });
});
