import { describe, it, expect } from "vitest";
import { GncNumeric, RoundMode } from "../../engine/gnc-numeric";

describe("GncNumeric", () => {
  // ── Construction ──────────────────────────────────────────────

  describe("constructor", () => {
    it("creates a valid rational number", () => {
      const n = new GncNumeric(500, 100);
      expect(n.num).toBe(500);
      expect(n.denom).toBe(100);
    });

    it("rejects non-integer numerator", () => {
      expect(() => new GncNumeric(1.5, 100)).toThrow("safe integer");
    });

    it("rejects non-integer denominator", () => {
      expect(() => new GncNumeric(100, 1.5)).toThrow("safe integer");
    });

    it("rejects zero denominator", () => {
      expect(() => new GncNumeric(100, 0)).toThrow("positive");
    });

    it("rejects negative denominator", () => {
      expect(() => new GncNumeric(100, -1)).toThrow("positive");
    });

    it("allows negative numerator", () => {
      const n = new GncNumeric(-500, 100);
      expect(n.num).toBe(-500);
    });

    it("allows zero numerator", () => {
      const n = new GncNumeric(0, 100);
      expect(n.num).toBe(0);
    });
  });

  // ── Arithmetic ────────────────────────────────────────────────

  describe("add", () => {
    it("adds with same denominator", () => {
      const a = new GncNumeric(300, 100);
      const b = new GncNumeric(250, 100);
      const result = a.add(b);
      expect(result.num).toBe(550);
      expect(result.denom).toBe(100);
    });

    it("adds with different denominators (LCD)", () => {
      const a = new GncNumeric(1, 3); // 1/3
      const b = new GncNumeric(1, 4); // 1/4
      const result = a.add(b);
      // LCD(3,4) = 12, so 4/12 + 3/12 = 7/12
      expect(result.num).toBe(7);
      expect(result.denom).toBe(12);
    });

    it("adds negative values", () => {
      const a = new GncNumeric(500, 100);
      const b = new GncNumeric(-500, 100);
      const result = a.add(b);
      expect(result.num).toBe(0);
    });
  });

  describe("sub", () => {
    it("subtracts same denominator", () => {
      const a = new GncNumeric(500, 100);
      const b = new GncNumeric(200, 100);
      const result = a.sub(b);
      expect(result.num).toBe(300);
      expect(result.denom).toBe(100);
    });

    it("subtracts to negative", () => {
      const a = new GncNumeric(100, 100);
      const b = new GncNumeric(300, 100);
      const result = a.sub(b);
      expect(result.num).toBe(-200);
    });
  });

  describe("mul", () => {
    it("multiplies two rationals", () => {
      const a = new GncNumeric(3, 4); // 3/4
      const b = new GncNumeric(2, 3); // 2/3
      const result = a.mul(b);
      // (3/4) * (2/3) = 6/12 but cross-reduction gives 1/2
      expect(result.toNumber()).toBeCloseTo(0.5);
    });

    it("multiplies currency amounts", () => {
      // 45.50 * 3 = 136.50
      const price = new GncNumeric(4550, 100);
      const qty = new GncNumeric(3, 1);
      const result = price.mul(qty);
      expect(result.num).toBe(13650);
      expect(result.denom).toBe(100);
    });

    it("handles zero", () => {
      const a = new GncNumeric(500, 100);
      const b = GncNumeric.zero();
      expect(a.mul(b).isZero()).toBe(true);
    });
  });

  describe("div", () => {
    it("divides two rationals", () => {
      const a = new GncNumeric(3, 4);
      const b = new GncNumeric(2, 3);
      const result = a.div(b);
      // (3/4) / (2/3) = (3/4) * (3/2) = 9/8
      expect(result.toNumber()).toBeCloseTo(1.125);
    });

    it("throws on division by zero", () => {
      const a = new GncNumeric(100, 1);
      const b = GncNumeric.zero();
      expect(() => a.div(b)).toThrow("division by zero");
    });
  });

  describe("negate", () => {
    it("negates positive", () => {
      const n = new GncNumeric(500, 100);
      expect(n.negate().num).toBe(-500);
    });

    it("negates negative", () => {
      const n = new GncNumeric(-500, 100);
      expect(n.negate().num).toBe(500);
    });

    it("negating zero stays zero", () => {
      expect(GncNumeric.zero(100).negate().num).toBe(0);
    });
  });

  describe("abs", () => {
    it("abs of negative", () => {
      const n = new GncNumeric(-500, 100);
      expect(n.abs().num).toBe(500);
    });

    it("abs of positive is unchanged", () => {
      const n = new GncNumeric(500, 100);
      expect(n.abs().num).toBe(500);
    });
  });

  // ── Comparison ────────────────────────────────────────────────

  describe("comparison", () => {
    it("eq with same denom", () => {
      const a = new GncNumeric(500, 100);
      const b = new GncNumeric(500, 100);
      expect(a.eq(b)).toBe(true);
    });

    it("eq with different denom (equivalent fractions)", () => {
      const a = new GncNumeric(1, 2);
      const b = new GncNumeric(2, 4);
      expect(a.eq(b)).toBe(true);
    });

    it("lt", () => {
      const a = new GncNumeric(100, 100);
      const b = new GncNumeric(200, 100);
      expect(a.lt(b)).toBe(true);
      expect(b.lt(a)).toBe(false);
    });

    it("gt", () => {
      const a = new GncNumeric(300, 100);
      const b = new GncNumeric(200, 100);
      expect(a.gt(b)).toBe(true);
    });

    it("isZero", () => {
      expect(new GncNumeric(0, 100).isZero()).toBe(true);
      expect(new GncNumeric(1, 100).isZero()).toBe(false);
    });

    it("isNegative", () => {
      expect(new GncNumeric(-1, 100).isNegative()).toBe(true);
      expect(new GncNumeric(1, 100).isNegative()).toBe(false);
    });

    it("isPositive", () => {
      expect(new GncNumeric(1, 100).isPositive()).toBe(true);
      expect(new GncNumeric(-1, 100).isPositive()).toBe(false);
      expect(new GncNumeric(0, 100).isPositive()).toBe(false);
    });
  });

  // ── Conversion ────────────────────────────────────────────────

  describe("convert", () => {
    it("converts to same denom (no-op)", () => {
      const n = new GncNumeric(500, 100);
      const result = n.convert(100);
      expect(result.num).toBe(500);
      expect(result.denom).toBe(100);
    });

    it("converts to higher precision", () => {
      // 5.00 (500/100) → 50000/10000
      const n = new GncNumeric(500, 100);
      const result = n.convert(10000);
      expect(result.num).toBe(50000);
      expect(result.denom).toBe(10000);
    });

    it("converts to lower precision with TRUNCATE", () => {
      // 1/3 (≈0.3333...) → 33/100 with TRUNCATE
      const n = new GncNumeric(1, 3);
      const result = n.convert(100, RoundMode.TRUNCATE);
      expect(result.num).toBe(33);
      expect(result.denom).toBe(100);
    });

    it("converts with ROUND_HALF_UP", () => {
      // 1/3 → 33/100 (0.333... rounds down)
      const n = new GncNumeric(1, 3);
      const result = n.convert(100, RoundMode.ROUND_HALF_UP);
      expect(result.num).toBe(33);

      // 1/2 → 50/100 (0.5 rounds up)
      const half = new GncNumeric(1, 2);
      expect(half.convert(100, RoundMode.ROUND_HALF_UP).num).toBe(50);

      // 2/3 → 67/100 (0.666... rounds up)
      const twoThirds = new GncNumeric(2, 3);
      expect(twoThirds.convert(100, RoundMode.ROUND_HALF_UP).num).toBe(67);
    });

    it("converts negative values correctly", () => {
      const n = new GncNumeric(-1, 3);
      const result = n.convert(100, RoundMode.ROUND_HALF_UP);
      expect(result.num).toBe(-33);
    });

    it("converts with BANKERS rounding (half to even)", () => {
      // 0.5 → 0 (even) or 1 (odd)? 0 is even → stays 0
      // 250/100 → denom 1: 2.50 → banker rounds to 2 (even)
      const n = new GncNumeric(250, 100);
      const result = n.convert(1, RoundMode.BANKERS);
      expect(result.num).toBe(2);

      // 350/100 → denom 1: 3.50 → banker rounds to 4 (even)
      const m = new GncNumeric(350, 100);
      expect(m.convert(1, RoundMode.BANKERS).num).toBe(4);
    });
  });

  describe("reduce", () => {
    it("simplifies a fraction", () => {
      const n = new GncNumeric(50, 100);
      const r = n.reduce();
      expect(r.num).toBe(1);
      expect(r.denom).toBe(2);
    });

    it("reduces zero to 0/1", () => {
      const n = new GncNumeric(0, 100);
      const r = n.reduce();
      expect(r.num).toBe(0);
      expect(r.denom).toBe(1);
    });

    it("already reduced stays the same", () => {
      const n = new GncNumeric(7, 11);
      const r = n.reduce();
      expect(r.num).toBe(7);
      expect(r.denom).toBe(11);
    });
  });

  describe("toNumber", () => {
    it("converts to float", () => {
      expect(new GncNumeric(500, 100).toNumber()).toBe(5.0);
      expect(new GncNumeric(-4550, 100).toNumber()).toBe(-45.5);
      expect(new GncNumeric(1, 3).toNumber()).toBeCloseTo(0.3333);
    });
  });

  // ── Static Factories ──────────────────────────────────────────

  describe("fromNumber", () => {
    it("converts decimal to rational", () => {
      const n = GncNumeric.fromNumber(45.5, 100);
      expect(n.num).toBe(4550);
      expect(n.denom).toBe(100);
    });

    it("handles negative decimal", () => {
      const n = GncNumeric.fromNumber(-123.45, 100);
      expect(n.num).toBe(-12345);
      expect(n.denom).toBe(100);
    });

    it("handles whole number", () => {
      const n = GncNumeric.fromNumber(100, 100);
      expect(n.num).toBe(10000);
      expect(n.denom).toBe(100);
    });

    it("handles zero", () => {
      const n = GncNumeric.fromNumber(0, 100);
      expect(n.num).toBe(0);
    });

    it("rounds correctly with ROUND_HALF_UP", () => {
      // 1/3 = 0.33333... → with denom 100 → 33/100
      const n = GncNumeric.fromNumber(1 / 3, 100);
      expect(n.num).toBe(33);

      // 2/3 = 0.66666... → with denom 100 → 67/100
      const m = GncNumeric.fromNumber(2 / 3, 100);
      expect(m.num).toBe(67);
    });
  });

  describe("fromSplit", () => {
    it("creates from database values", () => {
      const n = GncNumeric.fromSplit(120000, 100);
      expect(n.num).toBe(120000);
      expect(n.denom).toBe(100);
      expect(n.toNumber()).toBe(1200);
    });
  });

  describe("zero", () => {
    it("creates zero with default denom", () => {
      const z = GncNumeric.zero();
      expect(z.num).toBe(0);
      expect(z.denom).toBe(1);
    });

    it("creates zero with specified denom", () => {
      const z = GncNumeric.zero(100);
      expect(z.num).toBe(0);
      expect(z.denom).toBe(100);
    });
  });

  // ── Double-Entry Balance Invariant ────────────────────────────

  describe("double-entry balance check", () => {
    it("balanced transaction: salary deposit", () => {
      const bankDebit = new GncNumeric(300000, 100); //  +3000 GBP
      const incomeCredit = new GncNumeric(-300000, 100); // -3000 GBP
      expect(bankDebit.add(incomeCredit).isZero()).toBe(true);
    });

    it("balanced transaction: stock purchase", () => {
      const stockDebit = new GncNumeric(120000, 100); //  +1200 GBP (value in tx currency)
      const bankCredit = new GncNumeric(-120000, 100); // -1200 GBP
      expect(stockDebit.add(bankCredit).isZero()).toBe(true);
    });

    it("unbalanced transaction detected", () => {
      const a = new GncNumeric(500, 100);
      const b = new GncNumeric(-499, 100);
      expect(a.add(b).isZero()).toBe(false);
    });

    it("multi-split balance", () => {
      // Grocery trip with split categories
      const food = new GncNumeric(3000, 100); //  30.00
      const drink = new GncNumeric(1500, 100); // 15.00
      const bank = new GncNumeric(-4500, 100); // -45.00
      const sum = food.add(drink).add(bank);
      expect(sum.isZero()).toBe(true);
    });
  });

  // ── toString ──────────────────────────────────────────────────

  describe("toString", () => {
    it("formats as num/denom", () => {
      expect(new GncNumeric(4550, 100).toString()).toBe("4550/100");
      expect(new GncNumeric(-500, 100).toString()).toBe("-500/100");
    });
  });
});
