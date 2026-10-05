import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Eye, Loader2, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import { EvidenceGallery, type QaAttachment } from './components/EvidenceGallery';

type Audit = {
  id: number; audit_reference: string; attempt_number: number; cycle: string; audited_quantity: number;
  failed_quantity: number; result: 'PASSED' | 'FAILED'; status: string; failure_reason?: string | null;
  qa_remarks?: string | null; admin_remarks?: string | null; submitted_at: string; evidence: QaAttachment[];
};
type Inventory = { id: number; barcode: string; product: string; category?: string | null; brand?: string | null; unit: string; warehouse: string; available_stock: number; backload: number; latest_audit?: Audit | null; attempts: Audit[] };
type Response = { schedule: { months: number[] }; cycle: { id: number; name: string; reference: string; status: string } | null; data: Inventory[] };

const MAX_EVIDENCE_FILES = 5;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_REQUIRED_MESSAGE = 'At least one photo is required for a failed audit.';
const FAILURE_REASONS = [
  'Damaged Packaging / Container',
  'Broken or Tampered Seal',
  'Leakage / Spillage',
  'Product Deterioration',
  'Contamination',
  'Expired / Beyond Shelf Life',
  'Moisture / Water Damage',
  'Cracked / Broken / Deformed Product',
  'Missing or Unreadable Label',
  'Does Not Meet Quality Standard',
  'Other',
] as const;

const statusLabel = (status?: string) => status ? status.replaceAll('_', ' ') : 'NOT AUDITED';
const errorMessage = (error: unknown) => {
  const response = (error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>).response?.data;
  return Object.values(response?.errors ?? {})[0]?.[0] ?? response?.message ?? 'Unable to save the audit. Please try again.';
};

export default function InventoryQualityAudit() {
  const [payload, setPayload] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [result, setResult] = useState<'PASSED' | 'FAILED'>('PASSED');
  const [failedQuantity, setFailedQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPayload((await apiClient.get<Response>('/qa/inventory-audits')).data); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => (payload?.data ?? []).filter((item) =>
    `${item.product} ${item.barcode} ${item.warehouse}`.toLowerCase().includes(search.toLowerCase())), [payload, search]);
  const canAudit = (item: Inventory) => !item.latest_audit || item.latest_audit.status === 'RETURNED_FOR_REINSPECTION';
  const closePreview = () => setPreview(null);
  const closeAudit = () => { setSelected(null); setPreview(null); setReasonError(null); setRemarksError(null); setFileError(null); };
  const open = (item: Inventory) => { setSelected(item); setResult('PASSED'); setFailedQuantity(Math.min(1, item.available_stock + (item.latest_audit?.status === 'RETURNED_FOR_REINSPECTION' ? item.latest_audit.failed_quantity : 0))); setReason(''); setRemarks(''); setReasonError(null); setRemarksError(null); setFiles([]); setFileError(null); setPreview(null); setError(null); };

  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closePreview(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const selectFiles = (incoming: FileList | null) => {
    const next = Array.from(incoming ?? []);
    if (next.length === 0) return;
    if (files.length + next.length > MAX_EVIDENCE_FILES) return setFileError('A maximum of 5 images is allowed.');
    const invalidType = next.find((file) => !['image/jpeg', 'image/png'].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name));
    if (invalidType) return setFileError('Only JPG, JPEG, or PNG images are allowed.');
    const oversized = next.find((file) => file.size > MAX_EVIDENCE_BYTES);
    if (oversized) return setFileError(`${oversized.name} exceeds the 5 MB limit.`);
    setFileError(null); setFiles((current) => [...current, ...next]);
  };

  const removeFile = (index: number) => {
    const removed = files[index];
    const remaining = files.filter((_, fileIndex) => fileIndex !== index);
    if (preview?.file === removed) closePreview();
    setFiles(remaining);
    setFileError(result === 'FAILED' && remaining.length === 0 ? EVIDENCE_REQUIRED_MESSAGE : null);
  };

  const openPreview = (file: File) => setPreview({ file, url: URL.createObjectURL(file) });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return;
    if (result === 'FAILED' && !reason) return setReasonError('Select a failure reason.');
    if (result === 'FAILED' && reason === 'Other' && !remarks.trim()) return setRemarksError('Please specify the failure reason in Remarks.');
    if (result === 'FAILED' && files.length === 0) return setFileError(EVIDENCE_REQUIRED_MESSAGE);
    const form = new FormData(); form.append('result', result);
    if (result === 'FAILED') { form.append('failed_quantity', String(failedQuantity)); form.append('failure_reason', reason); if (remarks.trim()) form.append('remarks', remarks.trim()); files.forEach((file) => form.append('evidence[]', file)); }
    setSaving(true); setError(null);
    try { await apiClient.post(`/qa/inventory-audits/${selected.id}`, form); closeAudit(); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const monthNames = (payload?.schedule.months ?? []).map((month) => new Date(2026, month - 1).toLocaleString('en-US', { month: 'long' })).join(', ');
  return <div className="mx-auto max-w-[1400px] space-y-6 p-4 text-slate-100 sm:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-cyan-400">QUALITY ASSURANCE</p><h1 className="mt-1 text-2xl font-bold text-white">Inventory Quality Audit</h1><p className="mt-1 text-sm text-slate-400">Inspect stock already stored in the warehouse. Schedule: {monthNames || 'Not configured'}.</p></div>
      {payload?.cycle && <span className="w-fit rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-300">{payload.cycle.name} · Active</span>}
    </header>
    {!payload?.cycle && !loading && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200"><AlertTriangle className="mr-2 inline h-5 w-5" />No inventory audit is scheduled for this month.</div>}
    <div className="rounded-2xl border border-slate-800 bg-[#0d1322] p-4 shadow-sm">
      <label className="relative block max-w-md"><span className="sr-only">Search inventory</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, barcode, or warehouse" className="h-11 w-full rounded-xl border border-slate-700 bg-[#090d16] pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" /></label>
    </div>
    {error && !selected && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1322]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-800 bg-[#090d16]/70 text-xs uppercase tracking-wide text-slate-400"><tr>{['Product', 'Barcode', 'Warehouse', 'Available', 'Backload', 'Audit status', 'Action'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">
        {loading && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Loading inventory…</td></tr>}
        {!loading && filtered.map((item) => <tr key={item.id} className="hover:bg-slate-800/30"><td className="px-4 py-3"><p className="font-semibold text-white">{item.product}</p><p className="text-xs text-slate-500">{[item.category, item.brand].filter(Boolean).join(' · ') || 'No catalog details'}</p></td><td className="px-4 py-3 font-mono text-slate-300">{item.barcode}</td><td className="px-4 py-3 text-slate-300">{item.warehouse}</td><td className="px-4 py-3 font-semibold text-emerald-300">{item.available_stock} {item.unit}</td><td className="px-4 py-3 text-rose-300">{item.backload}</td><td className="px-4 py-3"><span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300">{statusLabel(item.latest_audit?.status)}</span>{item.latest_audit?.admin_remarks && <p className="mt-2 max-w-xs text-xs text-amber-300">Admin: {item.latest_audit.admin_remarks}</p>}</td><td className="px-4 py-3"><button type="button" disabled={!payload?.cycle || !canAudit(item)} onClick={() => open(item)} className="min-h-11 cursor-pointer rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">{item.latest_audit?.status === 'RETURNED_FOR_REINSPECTION' ? 'Reinspect' : canAudit(item) ? 'Inspect' : 'Submitted'}</button></td></tr>)}
        {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No inventory records match this search.</td></tr>}
      </tbody></table></div>
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3" role="dialog" aria-modal="true" aria-labelledby="audit-title"><form onSubmit={submit} className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0d1322] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 id="audit-title" className="text-xl font-bold text-white">{selected.latest_audit?.status === 'RETURNED_FOR_REINSPECTION' ? 'Reinspect' : 'Inspect'} {selected.product}</h2><p className="mt-1 text-sm text-slate-400">{selected.barcode} · {selected.warehouse}</p></div><button type="button" onClick={closeAudit} disabled={saving} aria-label="Close" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-800/40 p-3"><p className="text-xs text-slate-400">Available now</p><p className="text-xl font-bold text-white">{selected.available_stock}</p></div><div className="rounded-xl bg-slate-800/40 p-3"><p className="text-xs text-slate-400">Backload</p><p className="text-xl font-bold text-white">{selected.backload}</p></div></div>
      <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold text-slate-200">Inspection result</legend><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { setResult('PASSED'); setReasonError(null); setRemarksError(null); setFileError(null); }} className={`min-h-11 cursor-pointer rounded-xl border px-4 font-semibold ${result === 'PASSED' ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-300'}`}><CheckCircle2 className="mr-2 inline h-5 w-5" />Passed</button><button type="button" onClick={() => { setResult('FAILED'); setFileError(files.length === 0 ? EVIDENCE_REQUIRED_MESSAGE : null); }} className={`min-h-11 cursor-pointer rounded-xl border px-4 font-semibold ${result === 'FAILED' ? 'border-red-400 bg-red-500/15 text-red-300' : 'border-slate-700 text-slate-300'}`}><AlertTriangle className="mr-2 inline h-5 w-5" />Failed</button></div></fieldset>
      {result === 'FAILED' && <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-200">Failed quantity<input required type="number" min={1} max={selected.available_stock + (selected.latest_audit?.status === 'RETURNED_FOR_REINSPECTION' ? selected.latest_audit.failed_quantity : 0)} value={failedQuantity} onChange={(e) => setFailedQuantity(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-[#090d16] px-3 text-white focus:border-cyan-500 focus:outline-none" /></label>
        <label className="block text-sm font-medium text-slate-200">Failure Reason *<select value={reason} aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? 'failure-reason-error' : undefined} onChange={(event) => { setReason(event.target.value); setReasonError(null); if (event.target.value !== 'Other') setRemarksError(null); }} className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-slate-700 bg-[#090d16] px-3 text-white focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"><option value="" disabled>Select a failure reason</option>{FAILURE_REASONS.map((failureReason) => <option key={failureReason} value={failureReason}>{failureReason}</option>)}</select>{reasonError && <span id="failure-reason-error" role="alert" className="mt-1 block text-sm text-red-300">{reasonError}</span>}</label>
        <label className="block text-sm font-medium text-slate-200">{reason === 'Other' ? 'Remarks *' : 'Remarks (Optional)'}<textarea maxLength={2000} rows={3} value={remarks} aria-invalid={Boolean(remarksError)} aria-describedby={remarksError ? 'remarks-error' : undefined} onChange={(event) => { setRemarks(event.target.value); if (event.target.value.trim()) setRemarksError(null); }} placeholder="Add additional observations or details..." className="mt-1 w-full rounded-xl border border-slate-700 bg-[#090d16] p-3 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20" />{remarksError && <span id="remarks-error" role="alert" className="mt-1 block text-sm text-red-300">{remarksError}</span>}</label>
        <label className="block rounded-xl border border-dashed border-slate-600 p-4 text-sm text-slate-300"><Camera className="mr-2 inline h-5 w-5 text-cyan-400" />Photo evidence (1–5 JPG/PNG, 5 MB each)<input multiple type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" disabled={saving} aria-required="true" aria-invalid={Boolean(fileError)} aria-describedby={fileError ? 'photo-evidence-error' : 'photo-evidence-count'} onChange={(event) => { selectFiles(event.currentTarget.files); event.currentTarget.value = ''; }} className="mt-3 block w-full cursor-pointer text-sm disabled:cursor-not-allowed disabled:opacity-50" /></label>
        <div id="photo-evidence-count" className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{files.length} / {MAX_EVIDENCE_FILES} photos selected</span>{files.length >= MAX_EVIDENCE_FILES && <span>Maximum reached</span>}</div>
        {files.length > 0 && <ul className="space-y-2">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-700 bg-[#090d16] p-2 pl-3"><span className="min-w-0 flex-1 truncate text-sm text-slate-200" title={file.name}>{file.name}</span><button type="button" disabled={saving} onClick={() => openPreview(file)} aria-label={`Preview ${file.name}`} title={`Preview ${file.name}`} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-cyan-300 transition-colors hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><Eye className="h-4 w-4" aria-hidden="true" /></button><button type="button" disabled={saving} onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></li>)}</ul>}
        {fileError && <p id="photo-evidence-error" role="alert" className="text-sm text-red-300">{fileError}</p>}
      </div>}
      {selected.latest_audit?.status === 'RETURNED_FOR_REINSPECTION' && <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><RotateCcw className="mr-2 inline h-4 w-4" />Admin remarks: {selected.latest_audit.admin_remarks}</div>}
      {(selected.latest_audit?.evidence?.length ?? 0) > 0 && <div className="mt-5"><EvidenceGallery attachments={selected.latest_audit?.evidence ?? []} receivingId={selected.id} title="Previous evidence" readOnlyLabel="Historical" description="Evidence from the prior inspection attempt." /></div>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeAudit} disabled={saving} className="min-h-11 cursor-pointer rounded-lg px-4 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button disabled={saving} className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-cyan-500 px-5 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit audit</button></div>
    </form></div>}
    {preview && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="photo-preview-title" onClick={closePreview}><div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1322] shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3"><h3 id="photo-preview-title" className="truncate font-semibold text-white" title={preview.file.name}>{preview.file.name}</h3><button type="button" onClick={closePreview} aria-label="Close photo preview" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"><X className="h-5 w-5" aria-hidden="true" /></button></div><div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5"><img src={preview.url} alt={`Preview of ${preview.file.name}`} className="mx-auto max-h-[calc(100vh-9rem)] max-w-full rounded-lg object-contain" /></div></div></div>}
  </div>;
}
