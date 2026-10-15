import { PAGE_CONTENT_CLASS } from '../../components/layout/pageLayout';
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, RefreshCw, Warehouse as WarehouseIcon } from 'lucide-react';
import { apiClient } from '../../lib/api';

import CapacitySummary from '../../components/warehouse/CapacitySummary';
import type { CapacitySnapshot } from '../../lib/warehouseCapacity';

interface WarehouseOverview extends CapacitySnapshot {
  id: number;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  utilized: number;
  available: number | null;
  utilization_percentage: number | null;
  capacity_state: 'normal' | 'warning' | 'full';
  capacity_warning: boolean;
  status: 'Active' | 'Inactive';
  map_embed_url: string | null;
  inventory: {
    total_units: number;
    available_stock: number;
    reserved_stock: number;
    backload: number;
  };
}

const Warehouse: React.FC = () => {
  const [warehouse, setWarehouse] = useState<WarehouseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWarehouse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get<WarehouseOverview>('/plant-manager/warehouse');
      setWarehouse(data);
    } catch {
      setWarehouse(null);
      setError('Warehouse details could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWarehouse(); }, [loadWarehouse]);


  return (
    <main className={`${PAGE_CONTENT_CLASS} min-h-screen bg-[#090d16] text-slate-100`}>
      <div className="min-w-0 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Warehouse Overview</h1>
            <p className="mt-1 text-sm text-slate-400">Single-warehouse capacity, inventory, and location monitoring</p>
          </div>
          <button type="button" onClick={() => void loadWarehouse()} disabled={loading} className="hidden min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {loading && <section className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 text-slate-400" aria-live="polite"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading warehouse details…</section>}

        {!loading && error && <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6" role="alert"><h2 className="font-semibold text-rose-300">Unable to load warehouse</h2><p className="mt-1 text-sm text-rose-200/80">{error}</p><button type="button" onClick={() => void loadWarehouse()} className="mt-4 min-h-11 cursor-pointer rounded-xl bg-rose-500 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300">Try again</button></section>}

        {!loading && !error && !warehouse && <section className="rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 p-6 text-slate-300">Warehouse details are not configured yet.</section>}

        {warehouse && !loading && <>
          <section className="rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 p-5 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400"><WarehouseIcon className="h-6 w-6" /></div>
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-white">{warehouse.name}</h2><StatusBadge status={warehouse.status} /></div><p className="mt-1 text-sm text-slate-400">{warehouse.code}</p><p className="mt-3 flex max-w-2xl items-start gap-2 text-sm leading-6 text-slate-300"><MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" />{warehouse.address || 'Address is not configured yet.'}</p></div>
              </div>
              <span className="text-xs text-slate-500">Read-only configuration</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0f172a]/80 md:p-6">
            <CapacitySummary capacity={warehouse} />
            <h3 className="mt-5 text-sm font-semibold text-slate-900 dark:text-white">Inventory by unit</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">{(['KG', 'PCS', 'L'] as const).map(unit => <div key={unit} className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300"><p className="font-semibold">{unit}</p><p>Available: {warehouse.unit_capacity[unit].available_stock.toLocaleString()} {unit}</p><p>Reserved: {warehouse.unit_capacity[unit].reserved_stock.toLocaleString()} {unit}</p><p>Backload: {warehouse.unit_capacity[unit].backload.toLocaleString()} {unit}</p></div>)}</div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0f172a]/80">
            <div className="border-b border-slate-800 p-5 md:p-6"><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><MapPin className="h-5 w-5 text-cyan-400" /> Warehouse Location</h2><div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-3"><span><strong className="text-slate-300">Address:</strong> {warehouse.address || 'Not configured'}</span><span><strong className="text-slate-300">Latitude:</strong> {warehouse.latitude ?? '—'}</span><span><strong className="text-slate-300">Longitude:</strong> {warehouse.longitude ?? '—'}</span></div></div>
            {warehouse.map_embed_url ? <iframe src={warehouse.map_embed_url} width="100%" height="450" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" title={`${warehouse.name} location on Google Maps`} /> : <div className="flex min-h-56 items-center justify-center p-6 text-sm text-slate-400">Warehouse map location is not configured yet.</div>}
          </section>
        </>}
      </div>
    </main>
  );
};

const StatusBadge: React.FC<{ status: WarehouseOverview['status'] }> = ({ status }) => <span className={`plant-manager-badge rounded-full border px-2.5 py-1 text-xs font-medium ${status === 'Active' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-slate-600 bg-slate-700/30 text-slate-400'}`}>{status}</span>;
export default Warehouse;
