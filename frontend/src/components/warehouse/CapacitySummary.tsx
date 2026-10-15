import { allocationLabel, capacityUnits } from '../../lib/warehouseCapacity';
import type { CapacitySnapshot } from '../../lib/warehouseCapacity';

export default function CapacitySummary({ capacity }: { capacity: CapacitySnapshot }) {
  return <section className="min-w-0 space-y-3 rounded-xl bg-white p-3 text-slate-900 dark:bg-transparent dark:text-slate-100" aria-label="Warehouse capacity allocations">
    <p className="text-sm font-semibold">{allocationLabel(capacity)}</p>
    {!capacity.allocation_configured && <p role="status" className="text-sm leading-6 text-amber-800 dark:text-amber-300">Existing stock is preserved. An administrator must save the allocation split before new stock can be added or transferred here.</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      {capacityUnits.map((unit) => {
        const row = capacity.unit_capacity[unit];
        if (!row) return null;
        return <article key={unit} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <h3 className="text-sm font-semibold">{unit}</h3>
          <dl className="mt-2 space-y-1 text-xs leading-5">
            {([['Allocated', row.allocated], ['Used', row.used], ['Remaining', row.remaining]] as const).map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3"><dt className="text-slate-600 dark:text-slate-400">{label}</dt><dd className="break-words font-medium">{value === null ? 'Not configured' : `${value.toLocaleString()} ${unit}`}</dd></div>)}
          </dl>
          {row.utilization_percentage !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label={`${unit} allocation usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.utilization_percentage}><div className={`h-full ${row.capacity_state === 'full' ? 'bg-red-600' : row.capacity_state === 'warning' ? 'bg-amber-600' : 'bg-sky-600'}`} style={{ width: `${row.utilization_percentage}%` }} /></div>}
          {['warning', 'full'].includes(row.capacity_state) && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{row.capacity_state === 'full' ? 'Allocation full' : 'Allocation near capacity'}</p>}
        </article>;
      })}
    </div>
    {capacity.unsupported_unit_usage?.map((row) => <p key={row.unit} className="text-xs leading-5 text-amber-800 dark:text-amber-300">{row.used.toLocaleString()} {row.unit} of existing stock has no matching allocation. New additions in this unit are blocked.</p>)}
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">Used capacity includes available and reserved stock in each matching unit. These are business allocation limits.</p>
  </section>;
}
