/** Presentation totals only. Never combine quantities with different stock units. */
export function stockOutProgressByUnit(items: ReadonlyArray<{ unit: string; orderedQty: number; releasedQty: number }>) {
  const groups = new Map<string, { unit: string; ordered: number; released: number; percentage: number }>();
  for (const item of items) {
    const progress = groups.get(item.unit) ?? { unit: item.unit, ordered: 0, released: 0, percentage: 0 };
    progress.ordered += item.orderedQty;
    progress.released += item.releasedQty;
    progress.percentage = progress.ordered ? Math.min(100, progress.released / progress.ordered * 100) : 0;
    groups.set(item.unit, progress);
  }
  return [...groups.values()];
}
