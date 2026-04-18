import { describe, it, expect, afterAll } from "vitest";
import { getTestContext, closeTestDb } from "../helpers";
import { buildAccountTree } from "../../domain/accounts";

afterAll(() => closeTestDb());

describe("buildAccountTree", () => {
  it("returns non-empty account tree", async () => {
    const tree = await buildAccountTree(await getTestContext());
    expect(tree.length).toBeGreaterThan(0);
  });

  it("snapshot", async () => {
    const tree = await buildAccountTree(await getTestContext());
    expect(tree).toMatchSnapshot();
  });
});
