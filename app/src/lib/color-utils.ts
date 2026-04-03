/**
 * Distinct color palette for drill-down subcategories.
 * Chosen to be visually distinguishable from each other.
 */
const DRILL_DOWN_PALETTE = [
  "#4A7A6B", "#E07A5F", "#81B29A", "#F2CC8F", "#3D405B",
  "#F4845F", "#7EC8E3", "#C97C5D", "#B8B8FF", "#2EC4B6",
  "#E36588", "#48BF84", "#D4A373", "#577590", "#F9C74F",
  "#90BE6D", "#F94144", "#43AA8B", "#F8961E", "#277DA1",
];

/**
 * Assign each category a distinct color from a diverse palette,
 * making it easy to distinguish subcategories in pie chart drill-downs.
 */
export function assignShades<T extends { color: string }>(cats: T[]): void {
  if (cats.length <= 1) return;
  for (let i = 0; i < cats.length; i++) {
    cats[i].color = DRILL_DOWN_PALETTE[i % DRILL_DOWN_PALETTE.length];
  }
}
