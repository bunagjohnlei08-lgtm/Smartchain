import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, Clock3, FileText, History, Info, LayoutDashboard, LockKeyhole, Package, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import api from '../lib/api';
import logo from '../assets/logo.png';

const SESSION_KEY = 'supplierPortalSession';
const SESSION_EXPIRY_KEY = 'supplierPortalSessionExpiresAt';

type PortalEvent = { event_type: string; title: string; description?: string; occurred_at: string };
type MeetingSlot = { id: number; starts_at: string; ends_at?: string };
type PortalOffering = { type: 'PRODUCT' | 'SERVICE'; name: string; category: string | null; description: string | null };
type PortalApplication = {
  application_number: string; company_name: string; contact_person: string; email: string;
  business_type: string; supply_category: string; products_services: string | null; submitted_at: string;
  offerings?: PortalOffering[];
  status: 'PENDING' | 'UNDER_REVIEW' | 'NEEDS_REVISION' | 'QUALIFIED_FOR_MEETING' | 'MEETING_SCHEDULED' | 'MEETING_COMPLETED' | 'APPROVED' | 'REJECTED'; supplier_message?: string;
  revision_reason_codes?: string[]; alternative_schedule_requested?: boolean;
  attachments: { attachment_type: string; original_name: string; mime_type: string; file_size: number }[];
  history: PortalEvent[]; available_meeting_slots: MeetingSlot[];
  confirmed_meeting?: { id: number; starts_at: string; ends_at?: string; status: 'CONFIRMED' | 'COMPLETED' };
};
type Tab = 'overview' | 'history' | 'meeting';
type EditableOffering = PortalOffering & { key: number };

/** Revision editor; inputs are named so the surrounding form's FormData carries them. */
function RevisionOfferings({ initial }: { initial: PortalOffering[] }) {
  const [rows, setRows] = useState<EditableOffering[]>(() => initial.map((offering, index) => ({ ...offering, key: index })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (index: number, patch: Partial<PortalOffering>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal';

  return <fieldset className="sm:col-span-2 min-w-0">
    <legend className="text-sm font-semibold">Products offered</legend>
    <div className="mt-2 grid gap-3">{rows.map((row, index) => <div key={row.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Product name<input name={`offerings[${index}][name]`} required minLength={2} maxLength={150} value={row.name} onChange={(event) => update(index, { name: event.target.value })} className={inputClass} /></label>
      <label className="text-sm font-semibold">Category<input name={`offerings[${index}][category]`} required maxLength={150} value={row.category ?? ''} onChange={(event) => update(index, { category: event.target.value })} className={inputClass} /></label>
      <label className="text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span><input name={`offerings[${index}][description]`} maxLength={1000} value={row.description ?? ''} onChange={(event) => update(index, { description: event.target.value })} className={inputClass} /></label>
      {rows.length > 1 && <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40 sm:col-span-2 sm:justify-self-end"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</button>}
    </div>)}</div>
    {rows.length < 20 && <button type="button" onClick={() => { setRows((current) => [...current, { key: nextKey, type: 'PRODUCT', name: '', category: '', description: '' }]); setNextKey((key) => key + 1); }} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-sky-700 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40"><Plus className="h-4 w-4" aria-hidden="true" />Add another product</button>}
  </fieldset>;
}
type ExchangeResponse = { data: { session_token: string; expires_at: string } };

let pendingExchange: { token: string; request: Promise<ExchangeResponse> } | null = null;

const exchangeAccessToken = (token: string): Promise<ExchangeResponse> => {
  if (pendingExchange?.token === token) return pendingExchange.request;

  const request = api.post('/api/supplier-portal/access', { access_token: token }) as Promise<ExchangeResponse>;
  pendingExchange = { token, request };
  const clearPending = () => { if (pendingExchange?.request === request) pendingExchange = null; };
  void request.then(clearPending, clearPending);

  return request;
};

const statusStyles: Record<PortalApplication['status'], string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  UNDER_REVIEW: 'border-sky-200 bg-sky-50 text-sky-800',
  NEEDS_REVISION: 'border-orange-200 bg-orange-50 text-orange-800',
  QUALIFIED_FOR_MEETING: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  MEETING_SCHEDULED: 'border-violet-200 bg-violet-50 text-violet-800',
  MEETING_COMPLETED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
};
const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' }).format(new Date(value));
const formatMeeting = (meeting: MeetingSlot) => `${formatDateTime(meeting.starts_at)}${meeting.ends_at ? ` – ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', timeStyle: 'short' }).format(new Date(meeting.ends_at))}` : ''} Asia/Manila`;
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const statusMessage: Record<PortalApplication['status'], string> = {
  PENDING: 'Your application was submitted and is pending review.',
  UNDER_REVIEW: 'Your application is currently under review.',
  NEEDS_REVISION: 'Action required: your application needs corrections before review can continue.',
  QUALIFIED_FOR_MEETING: 'Your application passed the initial review. Please select an available meeting schedule.',
  MEETING_SCHEDULED: 'Your meeting has been confirmed.',
  MEETING_COMPLETED: 'Your meeting has been completed. Your application is awaiting final evaluation.',
  APPROVED: 'Your supplier application has been approved.',
  REJECTED: 'Your supplier application was not approved.',
};
const revisionLabels: Record<string, string> = {
  BUSINESS_CERTIFICATE: 'Business Certificate requires correction',
  BUSINESS_PERMIT: 'Business Permit requires correction',
  PRODUCT_SERVICE_IMAGE: 'Product / Service image requires correction',
  UNREADABLE_DOCUMENT: 'A submitted document is unreadable',
  INFORMATION_MISMATCH: 'Submitted information does not match the document',
  INCOMPLETE_INFORMATION: 'Required information is incomplete',
  OTHER: 'Other correction requested',
};

const SupplierPortalPage: React.FC = () => {
  const location = useLocation();
  const accessToken = new URLSearchParams(location.hash.slice(1)).get('token') || undefined;
  const [application, setApplication] = useState<PortalApplication | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const [alternativeMessage, setAlternativeMessage] = useState('');

  const sessionToken = () => sessionStorage.getItem(SESSION_KEY);
  const portalHeaders = (session: string) => ({ 'X-Supplier-Portal-Session': session });
  const clearSession = () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  };

  const loadApplication = useCallback(async () => {
    const session = sessionToken();
    if (!session) {
      setError('Open the secure link sent to your application email to access this portal.');
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/api/supplier-portal/application', { headers: portalHeaders(session) });
      setApplication(response.data.data);
      setError('');
    } catch (requestError: any) {
      if ([401, 410].includes(requestError?.response?.status)) clearSession();
      setError(requestError?.response?.status === 401
        ? 'Your temporary supplier portal session has expired.'
        : 'Unable to load your application right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const openPortal = async () => {
      if (!accessToken) {
        await loadApplication();
        return;
      }
      try {
        const response = await exchangeAccessToken(accessToken);
        if (!active) return;
        sessionStorage.setItem(SESSION_KEY, response.data.session_token);
        sessionStorage.setItem(SESSION_EXPIRY_KEY, response.data.expires_at);
        window.history.replaceState(window.history.state, '', '/supplier-portal');
        await loadApplication();
      } catch (requestError: any) {
        if (!active) return;
        clearSession();
        setError(requestError?.response?.data?.message || 'Unable to load your application right now. Please try again.');
        setLoading(false);
      }
    };
    void openPortal();
    return () => { active = false; };
  }, [accessToken, loadApplication]);

  const confirmMeeting = async () => {
    if (!selectedSlot || !sessionToken()) return;
    setSaving(true); setError('');
    try {
      const response = await api.post(`/api/supplier-portal/meeting-slots/${selectedSlot}/select`, {}, { headers: portalHeaders(sessionToken()!) });
      setApplication(response.data.data); setSelectedSlot(null);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to confirm this meeting schedule.');
      await loadApplication();
    } finally { setSaving(false); }
  };

  const requestAnotherSchedule = async () => {
    if (!sessionToken() || alternativeMessage.trim().length < 3) return;
    setSaving(true); setError('');
    try {
      const response = await api.post('/api/supplier-portal/request-another-schedule', { message: alternativeMessage }, { headers: portalHeaders(sessionToken()!) });
      setApplication(response.data.data); setAlternativeMessage(''); setAlternativeOpen(false);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to request another schedule.');
    } finally { setSaving(false); }
  };

  const submitCorrections = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionToken()) return;
    setSaving(true); setError('');
    try {
      const response = await api.post('/api/supplier-portal/resubmit', new FormData(event.currentTarget), { headers: portalHeaders(sessionToken()!) });
      setApplication(response.data.data);
    } catch (requestError: any) {
      const validation = requestError?.response?.data?.errors;
      setError(validation ? String(Object.values(validation).flat()[0]) : requestError?.response?.data?.message || 'Unable to submit corrections.');
    } finally { setSaving(false); }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'history', label: 'History', icon: History },
    { id: 'meeting', label: 'Meeting', icon: CalendarDays },
  ];

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-800 bg-slate-950 text-white"><div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6"><Link to="/" className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-4 focus:ring-sky-400/40"><span className="flex shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-white px-1 py-0.5"><img src={logo} alt="Archon Nell Incorporated" className="h-auto w-[64px] object-contain sm:w-[80px]" /></span><span className="min-w-0"><span className="block text-sm font-bold">SmartChain</span><span className="block whitespace-nowrap text-[11px] text-slate-300 sm:text-xs">Supplier Application Portal</span></span></Link><span className="hidden items-center gap-2 text-xs text-slate-300 sm:flex"><LockKeyhole className="h-4 w-4 text-sky-400" />Temporary secure access</span></div></header>
    <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
      {loading && <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading your application…</div>}
      {!loading && error && !application && <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8"><LockKeyhole className="mx-auto h-10 w-10 text-sky-700" /><h1 className="mt-4 text-2xl font-bold">Secure portal access</h1><p role="alert" className="mt-3 leading-7 text-slate-600">{error}</p><Link to="/supplier-application" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-400/40">Return to supplier application</Link></section>}
      {application && <>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white sm:p-7"><p className="font-mono text-xs font-semibold tracking-wide text-sky-300">{application.application_number}</p><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{application.company_name}</h1><p className="mt-1 text-sm text-slate-300">Submitted {formatDate(application.submitted_at)}</p></div><span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${statusStyles[application.status]}`}>{application.status.replaceAll('_', ' ')}</span></div></div>
          <nav aria-label="Supplier portal sections" className="flex overflow-x-auto border-b border-slate-200 px-2 sm:px-5" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500/40 ${tab === id ? 'border-sky-600 text-sky-800' : 'border-transparent text-slate-600 hover:text-slate-950'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
          <div className="p-5 sm:p-7">
            {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
            {application.status === 'NEEDS_REVISION' && <section className="mb-7 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-5" aria-labelledby="revision-heading">
              <h2 id="revision-heading" className="text-lg font-bold text-orange-950">Action required: update your application</h2>
              <p className="mt-2 text-sm leading-6 text-orange-900">{application.supplier_message}</p>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-orange-950">{application.revision_reason_codes?.map((code) => <li key={code}>{revisionLabels[code] || code}</li>)}</ul>
              <form onSubmit={submitCorrections} className="mt-5 space-y-4 rounded-xl bg-white p-4" encType="multipart/form-data">
                {(application.revision_reason_codes?.some((code) => ['BUSINESS_CERTIFICATE', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Business Certificate<input name="business_certificate[]" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
                {(application.revision_reason_codes?.some((code) => ['BUSINESS_PERMIT', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Business Permit<input name="business_permit[]" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
                {(application.revision_reason_codes?.some((code) => ['PRODUCT_SERVICE_IMAGE', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Product / Service Images<input name="product_service_image[]" type="file" multiple accept=".jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
                {(application.revision_reason_codes?.some((code) => ['INFORMATION_MISMATCH', 'INCOMPLETE_INFORMATION', 'OTHER'].includes(code))) && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Contact person<input name="contact_person" defaultValue={application.contact_person} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label><RevisionOfferings initial={application.offerings ?? []} /></div>}
                <button type="submit" disabled={saving} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-orange-700 px-5 font-semibold text-white hover:bg-orange-800 focus:outline-none focus:ring-4 focus:ring-orange-700/30 disabled:opacity-50 sm:w-auto">{saving ? 'Submitting corrections…' : 'Submit Corrections'}</button>
              </form>
            </section>}
            {tab === 'meeting' && application.status === 'QUALIFIED_FOR_MEETING' && application.available_meeting_slots.length > 0 && <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="alternative-heading">
              {!alternativeOpen ? <button type="button" disabled={application.alternative_schedule_requested} onClick={() => setAlternativeOpen(true)} className="min-h-11 cursor-pointer rounded-xl border border-sky-700 px-4 font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60">{application.alternative_schedule_requested ? 'Another schedule requested' : 'None of these schedules work for me'}</button> : <><h2 id="alternative-heading" className="font-bold">Request another schedule</h2><label className="mt-3 block text-sm font-semibold">Preferred availability / message<textarea value={alternativeMessage} onChange={(event) => setAlternativeMessage(event.target.value)} rows={3} maxLength={2000} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal focus:ring-2 focus:ring-sky-500" /></label><div className="mt-3 flex gap-3"><button type="button" onClick={() => setAlternativeOpen(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold">Cancel</button><button type="button" disabled={saving || alternativeMessage.trim().length < 3} onClick={() => void requestAnotherSchedule()} className="min-h-11 rounded-xl bg-sky-700 px-4 font-semibold text-white disabled:opacity-50">Send Request</button></div></>}
            </section>}
            {tab === 'overview' && <div className="space-y-7"><div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div><h2 className="font-semibold text-sky-950">Current status</h2><p className="mt-1 text-sm leading-6 text-sky-900">{statusMessage[application.status]}</p></div></div></div><div className="grid gap-5 sm:grid-cols-2">{[['Company', application.company_name], ['Contact person', application.contact_person], ['Business email', application.email], ['Business type', application.business_type], ['Supply category', application.supply_category], ['Submitted', formatDateTime(application.submitted_at)]].map(([label, value]) => <div key={label}><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-medium leading-6 text-slate-900">{value}</p></div>)}</div><section aria-labelledby="portal-offerings"><h2 id="portal-offerings" className="text-xs font-bold uppercase tracking-wider text-slate-500">Products offered</h2>{(application.offerings ?? []).length > 0 ? <ul className="mt-2 grid gap-3 sm:grid-cols-2">{(application.offerings ?? []).map((offering, index) => <li key={`${offering.type}-${offering.name}-${index}`} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><Package className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-sm font-semibold">{offering.name}</p><p className="mt-1 text-xs text-slate-600">{offering.type === 'PRODUCT' ? 'Product' : 'Service'}{offering.category ? ` · ${offering.category}` : ''}</p>{offering.description && <p className="mt-1 break-words text-xs text-slate-600">{offering.description}</p>}</div></li>)}</ul> : !application.products_services && <p className="mt-2 text-sm text-slate-600">No offerings listed.</p>}{application.products_services && <><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{(application.offerings ?? []).length > 0 ? 'Additional capabilities' : 'Products / services description'}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{application.products_services}</p></>}</section>{application.supplier_message && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div><h2 className="font-semibold text-sky-950">Application update</h2><p className="mt-1 text-sm leading-6 text-sky-900">{application.supplier_message}</p></div></div></div>}<section aria-labelledby="submitted-files"><h2 id="submitted-files" className="font-bold">Submitted files</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{application.attachments.map((file, index) => <div key={`${file.attachment_type}-${file.original_name}-${index}`} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div className="min-w-0"><p className="break-all text-sm font-semibold">{file.original_name}</p><p className="mt-1 text-xs text-slate-500">{file.attachment_type.replaceAll('_', ' ')} · {formatSize(file.file_size)}</p></div></div>)}</div></section></div>}
            {tab === 'history' && <section aria-labelledby="history-heading"><h2 id="history-heading" className="text-lg font-bold">Application history</h2><ol className="mt-5 space-y-0">{application.history.map((event, index) => <li key={`${event.event_type}-${event.occurred_at}`} className="relative flex gap-4 pb-6 last:pb-0"><div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800">{index === application.history.length - 1 ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-3 w-3 fill-current" />}</div>{index < application.history.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-slate-200" />}<div className="min-w-0 pt-0.5"><p className="font-semibold text-slate-900">{event.title}</p><p className="mt-1 text-sm text-slate-600">{event.description}</p><time className="mt-1.5 block text-xs text-slate-500" dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time></div></li>)}</ol></section>}
            {tab === 'meeting' && <section aria-labelledby="meeting-heading"><h2 id="meeting-heading" className="text-lg font-bold">Meeting schedule</h2>{application.confirmed_meeting ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex gap-3"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" /><div><p className="font-bold text-emerald-950">{application.confirmed_meeting.status === 'COMPLETED' ? 'Meeting completed' : 'Meeting confirmed'}</p><p className="mt-1 text-sm text-emerald-900">{formatMeeting(application.confirmed_meeting)}</p></div></div></div> : application.available_meeting_slots.length > 0 ? <><p className="mt-2 text-sm leading-6 text-slate-600">Select one of the schedules provided by SmartChain. Your selection is confirmed immediately.</p><fieldset className="mt-4 space-y-3"><legend className="sr-only">Available meeting schedules</legend>{application.available_meeting_slots.map((slot) => <label key={slot.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${selectedSlot === slot.id ? 'border-sky-600 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}><input type="radio" name="meeting-slot" value={slot.id} checked={selectedSlot === slot.id} onChange={() => setSelectedSlot(slot.id)} className="h-4 w-4 accent-sky-700" /><Clock3 className="h-5 w-5 shrink-0 text-sky-700" /><span className="text-sm font-semibold">{formatMeeting(slot)}</span></label>)}</fieldset><button type="button" disabled={!selectedSlot || saving} onClick={() => void confirmMeeting()} className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-sky-700 px-5 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving ? 'Confirming…' : 'Confirm Schedule'}</button></> : <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">{application.status === 'QUALIFIED_FOR_MEETING' ? 'Your application has been qualified for a meeting. Available schedules have not yet been posted. Please check again later.' : 'No meeting schedules are currently available.'}</div>}</section>}
          </div>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">This temporary portal only provides access to this supplier application. It does not grant access to SmartChain’s internal system.</p>
      </>}
    </div>
  </main>;
};

export default SupplierPortalPage;
