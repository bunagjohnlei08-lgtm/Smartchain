import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit, Loader2, MapPin, Navigation, Save, Warehouse, X } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import { apiClient } from '../../../lib/api';
import CapacitySummary from '../../../components/warehouse/CapacitySummary';
import type { CapacitySnapshot } from '../../../lib/warehouseCapacity';

interface WarehouseLocation extends CapacitySnapshot {
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
  show_on_public_website: boolean;
  map_embed_url: string | null;
  directions_url: string | null;
}

type WarehouseForm = Pick<WarehouseLocation, 'name' | 'code' | 'address' | 'latitude' | 'longitude' | 'capacity' | 'capacity_powder' | 'capacity_liquid' | 'capacity_solid' | 'capacity_returned' | 'status' | 'show_on_public_website'>;

const FIELD_CLASS = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white sm:text-sm';

const ManageLocations: React.FC = () => {
  const [location, setLocation] = useState<WarehouseLocation | null>(null);
  const [form, setForm] = useState<WarehouseForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get<WarehouseLocation>('/admin/warehouse/location')
      .then(({ data }) => { if (active) setLocation(data); })
      .catch(() => { if (active) setError('Unable to load the warehouse location.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openEditor = () => {
    if (!location) return;
    setError('');
    setForm({ name: location.name, code: location.code, address: location.address, latitude: location.latitude, longitude: location.longitude, capacity: location.capacity, capacity_powder: location.capacity_powder, capacity_liquid: location.capacity_liquid, capacity_solid: location.capacity_solid, capacity_returned: location.capacity_returned, status: location.status, show_on_public_website: location.show_on_public_website });
  };

  const saveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (allocationError) { setError(allocationError); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await apiClient.put<WarehouseLocation>('/admin/warehouse/location', form);
      setLocation(data);
      setForm(null);
    } catch (requestError) {
      const validationErrors = axios.isAxiosError(requestError)
        ? requestError.response?.data?.errors as Record<string, string[]> | undefined
        : undefined;
      const firstValidationMessage = validationErrors
        ? Object.values(validationErrors).flat().find((message): message is string => typeof message === 'string')
        : undefined;
      setError(firstValidationMessage || 'The warehouse details could not be saved. Please check the values and try again.');
    } finally {
      setSaving(false);
    }
  };

  const allocationValues = form ? [form.capacity, form.capacity_powder, form.capacity_liquid, form.capacity_solid, form.capacity_returned] : [];
  const allocationTotal = form ? (form.capacity_powder ?? 0) + (form.capacity_liquid ?? 0) + (form.capacity_solid ?? 0) + (form.capacity_returned ?? 0) : 0;
  const allocationError = !form ? '' : allocationValues.some(value => value === null || value === undefined)
    ? 'Enter Total Capacity and all four storage-area allocations.'
    : allocationValues.some(value => !Number.isInteger(value) || value! < 0 || value! > 2147483647)
      ? 'Capacity and allocations must be nonnegative whole numbers.'
      : allocationTotal !== form.capacity ? 'Powder, Liquid, Solid, and Returned allocations must add up exactly to Total Capacity.' : '';

  return (
    <PageContainer>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Locations</h1>
          <p className="mt-2 text-sm text-gray-400">View and maintain the primary warehouse location.</p>
        </div>

        {loading && <div className="flex min-h-56 items-center justify-center rounded-2xl border border-gray-800/50 bg-[#0d1322] text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading warehouse…</div>}
        {!loading && !location && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">{error || 'No warehouse location is configured.'}</div>}

        {location && <>
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 shrink-0 self-start items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 sm:h-auto sm:w-auto sm:p-3"><Warehouse className="h-5 w-5 sm:h-6 sm:w-6" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold text-slate-900 dark:text-white sm:text-lg">{location.name}</h2><StatusBadge status={location.status} />{location.show_on_public_website && <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300 sm:px-2.5 sm:py-1 sm:text-xs">Shown publicly</span>}</div>
                  <p className="mt-1 text-[12px] text-slate-600 dark:text-gray-400 sm:text-sm">{location.code}</p>
                  <p className="mt-2 flex items-start gap-2 text-[12px] text-slate-700 dark:text-gray-300 sm:text-sm"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500 sm:h-4 sm:w-4" />{location.address || 'Address not configured'}</p>
                </div>
              </div>
              <button type="button" onClick={openEditor} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[12px] font-medium text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-400 sm:min-h-11 sm:h-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"><Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Edit Location</button>
            </div>
            <div className="mt-6"><CapacitySummary capacity={location} /></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-800/50 bg-[#0d1322] shadow-sm">
            <div className="border-b border-gray-800 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><MapPin className="h-5 w-5 text-blue-400" /> Warehouse Location</h2>{location.directions_url && <a href={location.directions_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 self-start rounded-xl border border-blue-700 bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:border-blue-800 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 dark:focus:ring-blue-400 dark:focus:ring-offset-[#0d1322] sm:self-auto"><Navigation className="h-4 w-4" /> Get Directions</a>}</div><div className="mt-3 grid gap-2 text-sm text-gray-400 sm:grid-cols-2 lg:grid-cols-5"><span><strong className="text-gray-300">Warehouse:</strong> {location.name}</span><span><strong className="text-gray-300">Status:</strong> {location.status}</span><span className="sm:col-span-2"><strong className="text-gray-300">Address:</strong> {location.address || 'Not configured'}</span><span><strong className="text-gray-300">Coordinates:</strong> {location.latitude ?? '—'}, {location.longitude ?? '—'}</span></div></div>
            {location.map_embed_url
              ? <iframe src={location.map_embed_url} width="100%" height="450" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" title="Main Warehouse location on Google Maps" />
              : <div className="flex min-h-56 items-center justify-center px-5 text-center text-sm text-gray-400">Add latitude and longitude to display the map.</div>}
          </section>
        </>}
      </div>

      {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-warehouse-title">
        <form onSubmit={saveLocation} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-[#0d1322]">
          <div className="mb-6 flex items-center justify-between"><div><h2 id="edit-warehouse-title" className="text-xl font-semibold text-slate-900 dark:text-white">Edit Warehouse Location</h2><p className="mt-1 text-sm text-slate-600 dark:text-gray-400">Update the primary warehouse details.</p></div><button type="button" onClick={() => setForm(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Warehouse name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={FIELD_CLASS} /></Field>
            <Field label="Warehouse code"><input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className={FIELD_CLASS} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><textarea rows={3} value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value || null })} className={`${FIELD_CLASS} resize-none`} /></Field></div>
            <Field label="Latitude"><input type="number" step="any" value={form.latitude ?? ''} onChange={e => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Longitude"><input type="number" step="any" value={form.longitude ?? ''} onChange={e => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Total Capacity"><input required type="number" min="0" max="2147483647" step="1" value={form.capacity ?? ''} onChange={e => setForm({ ...form, capacity: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as WarehouseForm['status'] })} className={FIELD_CLASS}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>
            <fieldset className="min-w-0 sm:col-span-2" aria-describedby="allocation-validation">
              <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Divide Total Capacity among storage areas</legend>
              <div className="grid gap-3 sm:grid-cols-2">{([
                ['capacity_powder', 'Powder Products Area — SACK'], ['capacity_liquid', 'Liquid Products Area — DRUM'],
                ['capacity_solid', 'Solid Products Area — PCS'], ['capacity_returned', 'Returned Products Area — mixed units'],
              ] as const).map(([field, label]) => {
                return <Field key={field} label={label}><input required type="number" min="0" max="2147483647" step="1" value={form[field] ?? ''} onChange={e => setForm({ ...form, [field]: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} aria-invalid={!!allocationError} aria-describedby="allocation-validation" /></Field>;
              })}</div>
              <p className="mt-3 text-sm text-slate-700 dark:text-gray-300">Total Capacity: {form.capacity?.toLocaleString() ?? '—'} | Allocated: {allocationTotal.toLocaleString()} | {allocationTotal <= (form.capacity ?? 0) ? 'Unallocated' : 'Overallocated'}: {Math.abs((form.capacity ?? 0) - allocationTotal).toLocaleString()}</p>
              <p id="allocation-validation" aria-live="polite" className={`mt-2 text-sm leading-6 ${allocationError ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-gray-400'}`}>{allocationError || 'Fully allocated. Each stock unit uses only its matching allocation.'}</p>
              {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
            </fieldset>
            <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-800/40 p-4 sm:col-span-2">
              <input type="checkbox" checked={form.show_on_public_website} onChange={e => setForm({ ...form, show_on_public_website: e.target.checked })} className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-2 focus:ring-blue-500/40" />
              <span><span className="block text-sm font-medium text-slate-900 dark:text-white">Show on public website</span><span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-gray-400">Publishes only the warehouse name, address, latitude, and longitude. An active status, address, and coordinates are required before it can appear.</span></span>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-xl border border-gray-700 px-4 text-sm text-gray-300 hover:bg-gray-800">Cancel</button><button disabled={saving || !!allocationError} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button></div>
        </form>
      </div>}
    </PageContainer>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-sm text-slate-700 dark:text-gray-300">{label}</span>{children}</label>;
const StatusBadge: React.FC<{ status: WarehouseLocation['status'] }> = ({ status }) => <span className={`admin-badge rounded-full border px-2 py-0.5 text-[10px] font-medium sm:px-2.5 sm:py-1 sm:text-xs ${status === 'Active' ? 'border-green-400/20 bg-green-400/10 text-green-400' : 'border-gray-400/20 bg-gray-400/10 text-gray-400'}`}>{status}</span>;

export { ManageLocations };
export default ManageLocations;
