import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit, Loader2, MapPin, Save, Warehouse, X } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import { apiClient } from '../../../lib/api';

interface WarehouseLocation {
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
  status: 'Active' | 'Inactive';
}

type WarehouseForm = Pick<WarehouseLocation, 'name' | 'code' | 'address' | 'latitude' | 'longitude' | 'capacity' | 'status'>;

const MAP_URL = 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d14717.63615355505!2d121.0884979!3d14.6352911!3m2!1i1024!1i768!4f13.1!3m3!1m2!1s0x3397b9485ea55b87%3A0x2e093784a1e3763b!2sArchon%20Nell%20Incorporated!5e1!3m2!1sen!2sph!4v1787998954055!5m2!1sen!2sph';
const FIELD_CLASS = 'w-full rounded-xl border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30';

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
    setForm({ name: location.name, code: location.code, address: location.address, latitude: location.latitude, longitude: location.longitude, capacity: location.capacity, status: location.status });
  };

  const saveLocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
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

  const units = (value: number | null) => value === null ? 'Not configured' : `${value.toLocaleString()} units`;

  return (
    <PageContainer>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Manage Locations</h1>
          <p className="mt-2 text-sm text-gray-400">View and maintain the primary warehouse location.</p>
        </div>

        {loading && <div className="flex min-h-56 items-center justify-center rounded-2xl border border-gray-800/50 bg-[#0d1322] text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading warehouse…</div>}
        {!loading && !location && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">{error || 'No warehouse location is configured.'}</div>}

        {location && <>
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
          <section className="rounded-2xl border border-gray-800/50 bg-[#0d1322] p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400"><Warehouse className="h-6 w-6" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-white">{location.name}</h2><StatusBadge status={location.status} /></div>
                  <p className="mt-1 text-sm text-gray-400">{location.code}</p>
                  <p className="mt-2 flex items-start gap-2 text-sm text-gray-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />{location.address || 'Address not configured'}</p>
                </div>
              </div>
              <button type="button" onClick={openEditor} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-400"><Edit className="h-4 w-4" /> Edit Location</button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[['Total Capacity', units(location.capacity)], ['Utilized', units(location.utilized)], ['Available', units(location.available)]].map(([label, value]) => <div key={label} className="rounded-xl bg-gray-800/50 p-4"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 font-medium text-white">{value}</p></div>)}
            </div>
            <div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span className="text-gray-400">Capacity utilization</span><span className="text-white">{location.utilization_percentage === null ? 'Not available' : `${location.utilization_percentage}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${location.utilization_percentage ?? 0}%` }} /></div></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-800/50 bg-[#0d1322] shadow-sm">
            <div className="border-b border-gray-800 p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><MapPin className="h-5 w-5 text-blue-400" /> Warehouse Location</h2><div className="mt-3 grid gap-2 text-sm text-gray-400 sm:grid-cols-2 lg:grid-cols-5"><span><strong className="text-gray-300">Warehouse:</strong> {location.name}</span><span><strong className="text-gray-300">Status:</strong> {location.status}</span><span className="sm:col-span-2"><strong className="text-gray-300">Address:</strong> {location.address || 'Not configured'}</span><span><strong className="text-gray-300">Coordinates:</strong> {location.latitude ?? '—'}, {location.longitude ?? '—'}</span></div></div>
            <iframe src={MAP_URL} width="100%" height="450" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" title="Main Warehouse location on Google Maps" />
          </section>
        </>}
      </div>

      {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-warehouse-title">
        <form onSubmit={saveLocation} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-[#0d1322] p-6 shadow-2xl">
          <div className="mb-6 flex items-center justify-between"><div><h2 id="edit-warehouse-title" className="text-xl font-semibold text-white">Edit Warehouse Location</h2><p className="mt-1 text-sm text-gray-400">Update the primary warehouse details.</p></div><button type="button" onClick={() => setForm(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Warehouse name"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={FIELD_CLASS} /></Field>
            <Field label="Warehouse code"><input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className={FIELD_CLASS} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><textarea rows={3} value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value || null })} className={`${FIELD_CLASS} resize-none`} /></Field></div>
            <Field label="Latitude"><input type="number" step="any" value={form.latitude ?? ''} onChange={e => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Longitude"><input type="number" step="any" value={form.longitude ?? ''} onChange={e => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Capacity (units)"><input type="number" min="0" value={form.capacity ?? ''} onChange={e => setForm({ ...form, capacity: e.target.value === '' ? null : Number(e.target.value) })} className={FIELD_CLASS} /></Field>
            <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as WarehouseForm['status'] })} className={FIELD_CLASS}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></Field>
          </div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-xl border border-gray-700 px-4 text-sm text-gray-300 hover:bg-gray-800">Cancel</button><button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button></div>
        </form>
      </div>}
    </PageContainer>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-sm text-gray-300">{label}</span>{children}</label>;
const StatusBadge: React.FC<{ status: WarehouseLocation['status'] }> = ({ status }) => <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status === 'Active' ? 'border-green-400/20 bg-green-400/10 text-green-400' : 'border-gray-400/20 bg-gray-400/10 text-gray-400'}`}>{status}</span>;

export { ManageLocations };
export default ManageLocations;
