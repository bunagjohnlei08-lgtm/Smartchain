import { allocationLabel, capacityAreas } from '../../lib/warehouseCapacity';
import type { CapacitySnapshot } from '../../lib/warehouseCapacity';

export default function CapacitySummary({ capacity }: { capacity: CapacitySnapshot }) {
  return <section className="min-w-0 space-y-3 rounded-xl bg-white p-3 text-slate-900 dark:bg-transparent dark:text-slate-100" aria-label="Warehouse storage-area allocations">
    <p className="text-sm font-semibold">{allocationLabel(capacity)}</p>
    {!capacity.allocation_configured && <p role="status" className="text-sm leading-6 text-amber-800 dark:text-amber-300">An administrator must configure the four storage-area limits before new stock can be added or transferred here.</p>}
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[560px] table-fixed border-collapse text-left text-xs">
        <colgroup><col className="w-[40%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
        <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{['Storage Area', 'Allocated', 'Used', 'Remaining'].map(label => <th key={label} scope="col" className={`px-3 py-2 font-semibold ${label === 'Storage Area' ? '' : 'text-right'}`}>{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {capacityAreas.map(area => {
            const row = capacity.area_capacity?.[area]; if (!row) return null;
            const unit = area === 'RETURNED' ? 'Mixed original package units' : row.supported_unit;
            const value = (amount: number | null) => amount === null ? 'Not configured' : amount.toLocaleString();
            return <tr key={area} className="align-top bg-white dark:bg-slate-900/30">
              <th scope="row" className="min-w-0 px-3 py-3 font-semibold text-slate-900 dark:text-slate-100"><span className="block break-words">{row.label}</span><span className="mt-0.5 block break-words font-normal text-slate-600 dark:text-slate-400">{unit}</span>{row.unit_breakdown && <span className="mt-1 block break-words font-normal text-slate-600 dark:text-slate-300">{Object.entries(row.unit_breakdown).length ? Object.entries(row.unit_breakdown).map(([name, quantity]) => `${name}: ${quantity.toLocaleString()}`).join(' · ') : 'No physically received returns'}</span>}</th>
              <td className="break-words px-3 py-3 text-right font-medium tabular-nums">{value(row.allocated)}</td>
              <td className="break-words px-3 py-3 text-right font-medium tabular-nums">{row.used.toLocaleString()}</td>
              <td className="break-words px-3 py-3 text-right font-medium tabular-nums">{value(row.remaining)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {capacity.unsupported_unit_usage?.map(row => <p key={row.unit} className="text-xs leading-5 text-amber-800 dark:text-amber-300">{row.used.toLocaleString()} {row.unit} of legacy regular stock is preserved without package conversion. New operations remain blocked pending product-specific reconfiguration.</p>)}
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">Powder uses SACK, liquid uses DRUM, solid uses PCS, and returned products retain their original package units. Available and reserved stock are counted once; physically returned stock is counted only in the Returned Products Area.</p>
  </section>;
}
