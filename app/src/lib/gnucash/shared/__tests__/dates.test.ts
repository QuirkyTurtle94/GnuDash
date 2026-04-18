import { describe, it, expect } from "vitest";
import { sqlMonth, sqlYear, sqlMonthNum } from "../dates";

describe("SQL date helpers — SQLite dialect", () => {
  it("sqlMonth handles both ISO and compact formats", () => {
    expect(sqlMonth("t.post_date", "sqlite"))
      .toBe("CASE WHEN t.post_date LIKE '____-__-%' THEN strftime('%Y-%m', t.post_date) ELSE substr(t.post_date, 1, 4) || '-' || substr(t.post_date, 5, 2) END");
  });

  it("sqlYear handles both ISO and compact formats", () => {
    expect(sqlYear("t.post_date", "sqlite"))
      .toBe("CASE WHEN t.post_date LIKE '____-__-%' THEN strftime('%Y', t.post_date) ELSE substr(t.post_date, 1, 4) END");
  });

  it("sqlMonthNum handles both ISO and compact formats", () => {
    expect(sqlMonthNum("t.post_date", "sqlite"))
      .toBe("CASE WHEN t.post_date LIKE '____-__-%' THEN strftime('%m', t.post_date) ELSE substr(t.post_date, 5, 2) END");
  });
});

describe("SQL date helpers — Postgres dialect", () => {
  it("sqlMonth uses native to_char", () => {
    expect(sqlMonth("t.post_date", "postgres"))
      .toBe("to_char(t.post_date, 'YYYY-MM')");
  });

  it("sqlYear uses native to_char", () => {
    expect(sqlYear("t.post_date", "postgres"))
      .toBe("to_char(t.post_date, 'YYYY')");
  });

  it("sqlMonthNum uses native to_char", () => {
    expect(sqlMonthNum("t.post_date", "postgres"))
      .toBe("to_char(t.post_date, 'MM')");
  });

  it("handles qualified column names unchanged", () => {
    expect(sqlMonth("prices.date", "postgres"))
      .toBe("to_char(prices.date, 'YYYY-MM')");
  });
});
