/**
 * GncNumeric — Immutable rational number for exact monetary arithmetic.
 *
 * All accounting values are stored as integer numerator/denominator pairs
 * (matching GNUCash's GncNumeric). Arithmetic never uses floating point;
 * conversion to float happens only at the display boundary via toNumber().
 */

export enum RoundMode {
  /** Round toward negative infinity */
  FLOOR,
  /** Round toward positive infinity */
  CEIL,
  /** Round toward zero */
  TRUNCATE,
  /** Round half away from zero (GNUCash default) */
  ROUND_HALF_UP,
  /** Banker's rounding: half to even */
  BANKERS,
}

/** Iterative Euclidean GCD. Always returns a positive value. */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % t;
    a = t;
  }
  return a;
}

/** Least common multiple. */
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return safeMultiply(Math.abs(a) / gcd(a, b), Math.abs(b));
}

/**
 * Multiply two numbers, throwing if the result exceeds safe integer range.
 */
function safeMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  if (Math.abs(a) > Number.MAX_SAFE_INTEGER / Math.abs(b)) {
    throw new Error(
      `GncNumeric overflow: ${a} * ${b} exceeds safe integer range`
    );
  }
  return a * b;
}

/**
 * Add two numbers, throwing if the result exceeds safe integer range.
 */
function safeAdd(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      `GncNumeric overflow: ${a} + ${b} exceeds safe integer range`
    );
  }
  return result;
}

function assertSafeInteger(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`GncNumeric: ${label} must be a safe integer, got ${n}`);
  }
}

/**
 * Apply rounding to the result of integer division.
 *
 * Given a division `dividend / divisor` that may not be exact,
 * returns the rounded quotient according to the specified mode.
 */
function roundedDivide(
  dividend: number,
  divisor: number,
  mode: RoundMode
): number {
  const quotient = Math.trunc(dividend / divisor);
  const remainder = dividend - quotient * divisor;

  if (remainder === 0) return quotient;

  switch (mode) {
    case RoundMode.TRUNCATE:
      return quotient;

    case RoundMode.FLOOR:
      return dividend < 0 !== divisor < 0 ? quotient - 1 : quotient;

    case RoundMode.CEIL:
      return dividend < 0 !== divisor < 0 ? quotient : quotient + 1;

    case RoundMode.ROUND_HALF_UP: {
      const absRemainder = Math.abs(remainder);
      const absDivisor = Math.abs(divisor);
      if (absRemainder * 2 >= absDivisor) {
        return dividend < 0 !== divisor < 0 ? quotient - 1 : quotient + 1;
      }
      return quotient;
    }

    case RoundMode.BANKERS: {
      const absRemainder = Math.abs(remainder);
      const absDivisor = Math.abs(divisor);
      const doubled = absRemainder * 2;
      if (doubled > absDivisor) {
        return dividend < 0 !== divisor < 0 ? quotient - 1 : quotient + 1;
      }
      if (doubled === absDivisor) {
        // Round to even
        if (quotient % 2 !== 0) {
          return dividend < 0 !== divisor < 0 ? quotient - 1 : quotient + 1;
        }
        return quotient;
      }
      return quotient;
    }
  }
}

export class GncNumeric {
  readonly num: number;
  readonly denom: number;

  constructor(num: number, denom: number) {
    assertSafeInteger(num, "numerator");
    assertSafeInteger(denom, "denominator");
    if (denom <= 0) {
      throw new Error(`GncNumeric: denominator must be positive, got ${denom}`);
    }
    this.num = num;
    this.denom = denom;
  }

  // ── Arithmetic ──────────────────────────────────────────────────

  add(other: GncNumeric): GncNumeric {
    if (this.denom === other.denom) {
      return new GncNumeric(safeAdd(this.num, other.num), this.denom);
    }
    const commonDenom = lcm(this.denom, other.denom);
    const a = safeMultiply(this.num, commonDenom / this.denom);
    const b = safeMultiply(other.num, commonDenom / other.denom);
    return new GncNumeric(safeAdd(a, b), commonDenom);
  }

  sub(other: GncNumeric): GncNumeric {
    return this.add(other.negate());
  }

  mul(other: GncNumeric): GncNumeric {
    // Reduce cross-terms first to minimize overflow risk:
    // (a/b) * (c/d) = (a/gcd(a,d)) * (c/gcd(c,b)) / ((b/gcd(c,b)) * (d/gcd(a,d)))
    const g1 = gcd(Math.abs(this.num), other.denom);
    const g2 = gcd(Math.abs(other.num), this.denom);
    const newNum = safeMultiply(this.num / g1, other.num / g2);
    const newDenom = safeMultiply(this.denom / g2, other.denom / g1);
    return new GncNumeric(newNum, newDenom);
  }

  div(other: GncNumeric): GncNumeric {
    if (other.num === 0) {
      throw new Error("GncNumeric: division by zero");
    }
    // a/b / c/d = a/b * d/c
    const sign = other.num < 0 ? -1 : 1;
    return this.mul(
      new GncNumeric(sign * other.denom, Math.abs(other.num))
    );
  }

  negate(): GncNumeric {
    return new GncNumeric(this.num === 0 ? 0 : -this.num, this.denom);
  }

  abs(): GncNumeric {
    return this.num < 0 ? this.negate() : this;
  }

  // ── Comparison ──────────────────────────────────────────────────

  compare(other: GncNumeric): -1 | 0 | 1 {
    if (this.denom === other.denom) {
      return this.num < other.num ? -1 : this.num > other.num ? 1 : 0;
    }
    // Cross-multiply to avoid LCD computation for comparison
    const lhs = safeMultiply(this.num, other.denom);
    const rhs = safeMultiply(other.num, this.denom);
    return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
  }

  eq(other: GncNumeric): boolean {
    return this.compare(other) === 0;
  }

  lt(other: GncNumeric): boolean {
    return this.compare(other) === -1;
  }

  gt(other: GncNumeric): boolean {
    return this.compare(other) === 1;
  }

  lte(other: GncNumeric): boolean {
    return this.compare(other) !== 1;
  }

  gte(other: GncNumeric): boolean {
    return this.compare(other) !== -1;
  }

  isZero(): boolean {
    return this.num === 0;
  }

  isNegative(): boolean {
    return this.num < 0;
  }

  isPositive(): boolean {
    return this.num > 0;
  }

  // ── Conversion ──────────────────────────────────────────────────

  /**
   * Convert to a new denominator with rounding.
   *
   * This is the critical method for ensuring split denominators match
   * commodity fractions. For example, converting 1/3 to denom 100
   * gives 33/100 with TRUNCATE or 34/100 with CEIL.
   */
  convert(
    newDenom: number,
    mode: RoundMode = RoundMode.ROUND_HALF_UP
  ): GncNumeric {
    assertSafeInteger(newDenom, "newDenom");
    if (newDenom <= 0) {
      throw new Error(
        `GncNumeric: target denominator must be positive, got ${newDenom}`
      );
    }
    if (this.denom === newDenom) return this;
    // newNum = num * newDenom / denom, with rounding
    const dividend = safeMultiply(this.num, newDenom);
    const newNum = roundedDivide(dividend, this.denom, mode);
    return new GncNumeric(newNum, newDenom);
  }

  /** Simplify by dividing both num and denom by their GCD. */
  reduce(): GncNumeric {
    if (this.num === 0) return new GncNumeric(0, 1);
    const g = gcd(Math.abs(this.num), this.denom);
    return new GncNumeric(this.num / g, this.denom / g);
  }

  /** Convert to floating point. ONLY for display rendering. */
  toNumber(): number {
    return this.num / this.denom;
  }

  toString(): string {
    return `${this.num}/${this.denom}`;
  }

  // ── Static Factories ────────────────────────────────────────────

  /** Zero value with the given denominator (default 1). */
  static zero(denom: number = 1): GncNumeric {
    return new GncNumeric(0, denom);
  }

  /**
   * Create from a decimal number and target denominator.
   * Used for user input: e.g., fromNumber(45.50, 100) → 4550/100
   */
  static fromNumber(
    n: number,
    denom: number,
    mode: RoundMode = RoundMode.ROUND_HALF_UP
  ): GncNumeric {
    assertSafeInteger(denom, "denominator");
    if (denom <= 0) {
      throw new Error(
        `GncNumeric: denominator must be positive, got ${denom}`
      );
    }
    const raw = n * denom;
    let num: number;
    switch (mode) {
      case RoundMode.FLOOR:
        num = Math.floor(raw);
        break;
      case RoundMode.CEIL:
        num = Math.ceil(raw);
        break;
      case RoundMode.TRUNCATE:
        num = Math.trunc(raw);
        break;
      case RoundMode.ROUND_HALF_UP:
        num = Math.sign(raw) * Math.round(Math.abs(raw));
        break;
      case RoundMode.BANKERS: {
        const rounded = Math.round(raw);
        if (Math.abs(raw - rounded) === 0.5 && rounded % 2 !== 0) {
          num = rounded - Math.sign(raw);
        } else {
          num = rounded;
        }
        break;
      }
    }
    if (!Number.isSafeInteger(num)) {
      throw new Error(
        `GncNumeric: ${n} with denominator ${denom} exceeds safe integer range`
      );
    }
    return new GncNumeric(num, denom);
  }

  /**
   * Create from raw database num/denom columns.
   * Alias for the constructor with clearer intent.
   */
  static fromSplit(num: number, denom: number): GncNumeric {
    return new GncNumeric(num, denom);
  }
}
