export const capacityUnits = ['KG', 'PCS', 'L'] as const;
export type CapacityUnit = typeof capacityUnits[number];
export interface UnitCapacity {
  allocated: number | null;
  used: number;
  remaining: number | null;
  utilization_percentage: number | null;
  capacity_state: 'normal' | 'warning' | 'full' | 'setup_required';
  available_stock: number;
  reserved_stock: number;
  backload: number;
}
export interface CapacitySnapshot {
  capacity: number | null;
  capacity_kg: number | null;
  capacity_pcs: number | null;
  capacity_l: number | null;
  allocated_total: number;
  allocation_configured: boolean;
  unit_capacity: Record<CapacityUnit, UnitCapacity>;
  unsupported_unit_usage: Array<{ unit: string; used: number }>;
}

export function allocationLabel(capacity: Pick<CapacitySnapshot, 'capacity' | 'allocated_total' | 'allocation_configured'>): string {
  if (capacity.capacity === null) return 'Total capacity not configured';
  return capacity.allocation_configured ? `${capacity.allocated_total.toLocaleString()} fully allocated` : `${capacity.capacity.toLocaleString()} total · allocation setup required`;
}

export function stockAdditionIssue(capacity: CapacitySnapshot | null, items: Array<{ unit: string; stockableQuantity: number; capacityUnit?: string }>): string | null {
  if (!capacity) return null; // The server still validates under lock.
  if (!capacity.allocation_configured) return 'Ask an administrator to configure KG, PCS, and L allocations before adding stock.';
  const additions = new Map<string, number>();
  for (const item of items) {
    if (item.stockableQuantity <= 0) continue;
    const unit = (item.capacityUnit ?? item.unit).trim().toUpperCase();
    additions.set(unit, (additions.get(unit) ?? 0) + item.stockableQuantity);
  }
  for (const [unit, quantity] of additions) {
    if (!capacityUnits.includes(unit as CapacityUnit)) return `No warehouse allocation is defined for ${unit || 'this unit'}.`;
    const remaining = capacity.unit_capacity[unit as CapacityUnit].remaining;
    if (remaining === null || quantity > remaining) return `Only ${(remaining ?? 0).toLocaleString()} ${unit} remain in this unit's allocation; ${quantity.toLocaleString()} ${unit} are incoming.`;
  }
  return null;
}
