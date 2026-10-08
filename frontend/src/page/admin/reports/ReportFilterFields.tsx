import React from 'react';
import CompactDatePicker from '../../../components/ui/CompactDatePicker';
import type { ReportDefinition, ReportFilterValues, ReportOptions } from './reportApi';

export const fieldClass = 'w-full min-h-11 rounded-xl border border-slate-800 bg-[#070a12] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm';
export const labelClass = 'mb-1.5 block text-xs font-medium text-slate-300';

interface Props {
  definition: ReportDefinition;
  values: ReportFilterValues;
  onChange: (values: ReportFilterValues) => void;
  options: ReportOptions | null;
  hideDates?: boolean;
  idPrefix: string;
}

/** Renders only the filters the selected report definition declares. */
const ReportFilterFields: React.FC<Props> = ({ definition, values, onChange, options, hideDates = false, idPrefix }) => {
  const set = (key: keyof ReportFilterValues, value: string) => onChange({ ...values, [key]: value || undefined });
  const has = (filter: ReportDefinition['filters'][number]) => definition.filters.includes(filter);
  const dateInvalid = Boolean(values.date_from && values.date_to && values.date_to < values.date_from);
  const visible = definition.filters.filter((filter) => !(hideDates && filter === 'date'));

  if (visible.length === 0) {
    return <p className="text-xs text-slate-500">This report has no filters. It always reflects current data.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {has('date') && !hideDates && (
        <>
          <div>
            <span className={labelClass}>{definition.date_label ?? 'Date'} — From</span>
            <CompactDatePicker value={values.date_from ?? ''} max={values.date_to || undefined} onChange={(value) => set('date_from', value)} label={`${definition.date_label ?? 'Date'} from`} />
          </div>
          <div>
            <span className={labelClass}>{definition.date_label ?? 'Date'} — To</span>
            <CompactDatePicker value={values.date_to ?? ''} min={values.date_from || undefined} onChange={(value) => set('date_to', value)} label={`${definition.date_label ?? 'Date'} to`} />
            {dateInvalid && <p role="alert" className="mt-1 text-xs text-red-500">To date must be on or after the From date.</p>}
          </div>
        </>
      )}
      {has('warehouse') && (
        <div>
          <label htmlFor={`${idPrefix}-warehouse`} className={labelClass}>Warehouse</label>
          <select id={`${idPrefix}-warehouse`} value={values.warehouse_id ?? ''} onChange={(event) => set('warehouse_id', event.target.value)} className={fieldClass}>
            <option value="">All warehouses</option>
            {options?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
          </select>
        </div>
      )}
      {has('product') && (
        <div>
          <label htmlFor={`${idPrefix}-product`} className={labelClass}>Product</label>
          <select id={`${idPrefix}-product`} value={values.product_id ?? ''} onChange={(event) => set('product_id', event.target.value)} className={fieldClass}>
            <option value="">All products</option>
            {options?.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </div>
      )}
      {has('supplier') && (
        <div>
          <label htmlFor={`${idPrefix}-supplier`} className={labelClass}>Supplier</label>
          <select id={`${idPrefix}-supplier`} value={values.supplier_id ?? ''} onChange={(event) => set('supplier_id', event.target.value)} className={fieldClass}>
            <option value="">All suppliers</option>
            {options?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.supplier_code})</option>)}
          </select>
        </div>
      )}
      {has('category') && (
        <div>
          <label htmlFor={`${idPrefix}-category`} className={labelClass}>Product category</label>
          <select id={`${idPrefix}-category`} value={values.category ?? ''} onChange={(event) => set('category', event.target.value)} className={fieldClass}>
            <option value="">All categories</option>
            {options?.product_categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      )}
      {has('status') && definition.statuses.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-status`} className={labelClass}>Status</label>
          <select id={`${idPrefix}-status`} value={values.status ?? ''} onChange={(event) => set('status', event.target.value)} className={fieldClass}>
            <option value="">All statuses</option>
            {definition.statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>
      )}
      {has('movement_type') && (
        <div>
          <label htmlFor={`${idPrefix}-movement`} className={labelClass}>Movement type</label>
          <select id={`${idPrefix}-movement`} value={values.movement_type ?? ''} onChange={(event) => set('movement_type', event.target.value)} className={fieldClass}>
            <option value="">Stock In and Stock Out</option>
            <option value="STOCK_IN">Stock In</option>
            <option value="STOCK_OUT">Stock Out</option>
          </select>
        </div>
      )}
    </div>
  );
};

export default ReportFilterFields;
