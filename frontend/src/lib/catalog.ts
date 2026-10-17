export type Classification = 'RAW_MATERIAL' | 'FINISHED_PRODUCT';
export type StockUnit = 'PCS' | 'SACK' | 'DRUM';
export type CatalogWarehouse = { id: number; name: string; supported_units: StockUnit[]; allocation_configured: boolean };
export const classificationLabel = (value: Classification) => value === 'RAW_MATERIAL' ? 'Raw Material' : 'Finished Product';

export function unitForWarehouseChange(current: string, previousWarehouse: string, warehouse?: CatalogWarehouse): string {
  const units = warehouse?.supported_units ?? [];
  if (units.includes(current as StockUnit)) return current;
  return !previousWarehouse && !current && units.includes('PCS') ? 'PCS' : '';
}
