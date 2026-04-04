import { describe, it, expect } from "vitest";
import { generateGuid } from "../../engine/guid";

describe("generateGuid", () => {
  it("produces a 32-character hex string", () => {
    const guid = generateGuid();
    expect(guid).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces unique values", () => {
    const guids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      guids.add(generateGuid());
    }
    expect(guids.size).toBe(1000);
  });

  it("uses lowercase hex", () => {
    const guid = generateGuid();
    expect(guid).toBe(guid.toLowerCase());
  });
});
