import { describe, expect, it } from "vitest";
import { formatAmount, formatCurrency } from "../format";

describe("formatCurrency", () => {
  it("formats known ISO 4217 codes via Intl.NumberFormat", () => {
    expect(formatCurrency(1234.5, "GBP")).toMatch(/1,234\.50/);
    expect(formatCurrency(1234.5, "USD")).toMatch(/1,234\.50/);
  });

  it("does not throw on non-ISO commodity mnemonics (regression: #94 follow-up)", () => {
    // STOCK/MUTUAL rows pass their ticker mnemonic in as the currency arg;
    // Intl.NumberFormat would previously throw RangeError. Fall back to the
    // number + suffix formatting path instead.
    expect(() => formatCurrency(10, "NEWT")).not.toThrow();
    expect(formatCurrency(10, "NEWT")).toMatch(/NEWT/);
  });
});

describe("formatAmount", () => {
  it("uses currency formatting for known codes", () => {
    expect(formatAmount(100, "USD")).toMatch(/\$100\.00/);
  });

  it("uses ticker suffix for stock/mutual mnemonics", () => {
    expect(formatAmount(10, "VWRL")).toMatch(/\b10\b.* VWRL/);
    expect(formatAmount(10.5, "VWRL")).toMatch(/10\.5 VWRL/);
  });
});
