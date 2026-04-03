/**
 * Given a sorted array of category objects (largest first) that all share
 * the same base color, assign each one a different shade ranging from
 * darker (0.7×) to lighter (1.3×) of the base color.
 */
export function assignShades<T extends { color: string }>(cats: T[]): void {
  if (cats.length <= 1) return;
  const base = cats[0].color;
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const count = cats.length;
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  for (let i = 0; i < count; i++) {
    const factor = 0.7 + (0.6 * i) / (count - 1);
    cats[i].color = `#${clamp(r * factor).toString(16).padStart(2, "0")}${clamp(g * factor).toString(16).padStart(2, "0")}${clamp(b * factor).toString(16).padStart(2, "0")}`;
  }
}
