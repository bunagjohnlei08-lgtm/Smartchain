export const capacityAreas = ['POWDER', 'LIQUID', 'SOLID', 'RETURNED'] as const;
export type CapacityArea = typeof capacityAreas[number];
export const capacityUnits = ['PCS', 'SACK', 'DRUM'] as const;
export type CapacityUnit = typeof capacityUnits[number];
export interface AreaCapacity {
  label: string; supported_unit: CapacityUnit | null; allocated: number | null; used: number; remaining: number | null;
  utilization_percentage: number | null; capacity_state: 'normal' | 'warning' | 'full' | 'setup_required';
  available_stock: number; reserved_stock: number; backload: number; unit_breakdown: Record<string, number> | null;
}
export interface CapacitySnapshot {
  capacity: number | null; capacity_powder: number | null; capacity_liquid: number | null; capacity_solid: number | null;
  capacity_returned: number | null; allocated_total: number; unallocated_capacity: number | null; allocation_configured: boolean;
  used_capacity: number; remaining_capacity: number | null; occupancy_percentage: number | null; over_capacity: boolean;
  area_capacity: Record<CapacityArea, AreaCapacity>; unit_capacity: Record<CapacityUnit, AreaCapacity>;
  unsupported_unit_usage: Array<{ unit: string; used: number; returned_stock?: number }>;
}
export function allocationLabel(capacity: Pick<CapacitySnapshot, 'capacity' | 'allocated_total' | 'allocation_configured'>): string {
  if (capacity.capacity === null) return 'Total capacity not configured';
  return capacity.allocation_configured ? `${capacity.allocated_total.toLocaleString()} fully allocated` : `${capacity.capacity.toLocaleString()} total · storage-area setup required`;
}
export function stockAdditionIssue(capacity: CapacitySnapshot | null, items: Array<{ unit: string; stockableQuantity: number; capacityUnit?: string }>): string | null {
  if (!capacity) return null;
  if (!capacity.allocation_configured) return 'Ask an administrator to configure Powder, Liquid, Solid, and Returned area allocations before adding stock.';
  const additions = new Map<string, number>();
  for (const item of items) { if (item.stockableQuantity > 0) { const unit = (item.capacityUnit ?? item.unit).trim().toUpperCase(); additions.set(unit, (additions.get(unit) ?? 0) + item.stockableQuantity); } }
  for (const [unit, quantity] of additions) {
    if (!capacityUnits.includes(unit as CapacityUnit)) return `No new-storage area is defined for ${unit || 'this legacy unit'}.`;
    const remaining = capacity.unit_capacity[unit as CapacityUnit].remaining;
    if (remaining === null || quantity > remaining) return `Only ${(remaining ?? 0).toLocaleString()} slots remain for ${unit}; ${quantity.toLocaleString()} are incoming.`;
  }
  return null;
}
