export const orderUnitOptions = ['PCS', 'DRUM', 'SACK'] as const;

export function catalogOrderUnit(unit?: string | null): string {
  const canonical = unit?.trim().toUpperCase() ?? '';
  return orderUnitOptions.some(value => value === canonical) ? canonical : '';
}
