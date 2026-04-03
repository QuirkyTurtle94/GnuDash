import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { buildAccountTree } from "../../domain/accounts";

afterAll(() => closeTestDb());

describe("buildAccountTree", () => {
  it("returns non-empty account tree", () => {
    const tree = buildAccountTree(getTestContext());
    expect(tree.length).toBeGreaterThan(0);
  });

  it("snapshot", () => {
    const tree = buildAccountTree(getTestContext());
    expect(tree).toMatchSnapshot();
  });
});
