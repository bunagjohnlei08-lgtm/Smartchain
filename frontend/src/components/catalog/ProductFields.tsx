import { classificationLabel } from '../../lib/catalog';
import type { Classification, StockUnit } from '../../lib/catalog';

export function ClassificationBadge({ value }: { value: Classification }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${value === 'RAW_MATERIAL' ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200' : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200'}`}>{classificationLabel(value)}</span>;
}

export function ClassificationSelect({ value, onChange, label = 'Classification' }: { value: Classification | ''; onChange: (value: Classification | '') => void; label?: string }) {
  return <label className="block text-sm text-slate-700 dark:text-slate-300"><span className="mb-1.5 block">{label}</span><select value={value} onChange={event => onChange(event.target.value as Classification | '')} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm">{label === 'Inventory Classification' || label === 'Filter Classification' ? <option value="">All</option> : null}<option value="RAW_MATERIAL">Raw Materials</option><option value="FINISHED_PRODUCT">Finished Products</option></select></label>;
}

export function StockUnitSelect({ value, units, onChange, reason, existing = false }: { value: string; units: StockUnit[]; onChange: (value: string) => void; reason?: string | null; existing?: boolean }) {
  const names = { PCS: 'pieces', SACK: 'sacks', DRUM: 'drums' };
  return <label className="block text-sm text-slate-700 dark:text-slate-300"><span className="mb-1.5 block">Stock Unit *</span>
    <select required value={value} disabled={!!reason || !units.length} onChange={event => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm">
      <option value="">Select Stock Unit</option>{existing && value && !units.includes(value as StockUnit) && <option value={value}>{value} (current unit)</option>}{units.map(unit => <option key={unit} value={unit}>{unit} — {names[unit]}</option>)}
    </select>
    {reason ? <span className="mt-2 block text-xs leading-5 text-slate-600 dark:text-slate-400">{reason}</span> : !units.length ? <span role="status" className="mt-2 block text-xs leading-5 text-amber-800 dark:text-amber-300">Select a warehouse with saved unit allocations. Configure setup in Manage Locations → Edit Location.</span> : <span className="mt-2 block text-xs leading-5 text-slate-600 dark:text-slate-400">Unit selection is independent of classification. Full allocations still allow empty catalog setup.</span>}
  </label>;
}
