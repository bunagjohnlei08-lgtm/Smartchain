import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock3, History, Info, LayoutDashboard, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import logo from '../assets/logo.png';
import { MeetingDateBlock, PortalHistory, PortalMeetingDetails, PortalOverview } from './supplier-portal/PortalSections';
import { formatDate, formatMeetingTime } from './supplier-portal/portalPresentation';
import type { PortalApplication, PortalOffering } from './supplier-portal/portalPresentation';

const SESSION_KEY = 'supplierPortalSession';
const SESSION_EXPIRY_KEY = 'supplierPortalSessionExpiresAt';
const SESSION_INVITATION_KEY = 'supplierPortalInvitationHash';

type Tab = 'overview' | 'history' | 'meeting';
type EditableOffering = PortalOffering & { key: number };

/** Revision editor; inputs are named so the surrounding form's FormData carries them. */
function RevisionOfferings({ initial }: { initial: PortalOffering[] }) {
  const [rows, setRows] = useState<EditableOffering[]>(() => initial.map((offering, index) => ({ ...offering, key: index })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (index: number, patch: Partial<PortalOffering>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 sm:text-sm';

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
  const navigate = useNavigate();
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
    sessionStorage.removeItem(SESSION_INVITATION_KEY);
  };

  const loadApplication = useCallback(async (isActive: () => boolean = () => true) => {
    const session = sessionToken();
    if (!session) {
      setError('Open the secure link sent to your application email to access this portal.');
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/api/supplier-portal/application', { headers: portalHeaders(session) });
      if (!isActive()) return;
      setApplication(response.data.data);
      setError('');
    } catch (requestError: any) {
      if (!isActive()) return;
      if ([401, 410].includes(requestError?.response?.status)) {
        clearSession();
        setApplication(null);
      }
      setError(requestError?.response?.status === 401
        ? 'Your temporary supplier portal session has expired.'
        : 'Unable to load your application right now. Please try again.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setApplication(null);
    setSelectedSlot(null);
    setError('');
    const openPortal = async () => {
      if (!accessToken) {
        await loadApplication(() => active);
        return;
      }
      try {
        // Reopening the same invitation resumes only its existing, unexpired
        // session. A different invitation must exchange its own token, so a
        // previous supplier's cached session cannot select the destination.
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
        const invitationHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (!active) return;
        const expiresAt = sessionStorage.getItem(SESSION_EXPIRY_KEY);
        if (sessionToken() && sessionStorage.getItem(SESSION_INVITATION_KEY) === invitationHash
          && expiresAt && Date.parse(expiresAt) > Date.now()) {
          void navigate('/supplier-portal', { replace: true });
          return;
        }
        const response = await exchangeAccessToken(accessToken);
        if (!active) return;
        sessionStorage.setItem(SESSION_KEY, response.data.session_token);
        sessionStorage.setItem(SESSION_EXPIRY_KEY, response.data.expires_at);
        sessionStorage.setItem(SESSION_INVITATION_KEY, invitationHash);
        void navigate('/supplier-portal', { replace: true });
      } catch (requestError: any) {
        if (!active) return;
        clearSession();
        setError(requestError?.response?.data?.message || 'Unable to load your application right now. Please try again.');
        setLoading(false);
      }
    };
    void openPortal();
    return () => { active = false; };
  }, [accessToken, loadApplication, navigate]);

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

  return <main className="supplier-portal-page min-h-screen bg-slate-50 text-slate-950 [color-scheme:light]">
    <header className="border-b border-slate-800 bg-[#0b1730] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1730]">
          <span className="flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1"><img src={logo} alt="Archon Nell Incorporated" className="h-auto w-[112px] object-contain sm:w-[156px]" /></span>
          <span className="min-w-0"><span className="block text-base font-semibold leading-6 tracking-tight text-white">SmartChain</span><span className="block text-xs leading-5 text-slate-300 sm:text-[13px]">Supplier Application Portal</span></span>
        </Link>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-md border border-slate-600 bg-white/5 px-3 text-[11px] font-medium text-slate-200 sm:text-xs"><LockKeyhole className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />Temporary secure access</span>
      </div>
    </header>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {loading && <div role="status" className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center"><Clock3 className="mx-auto h-6 w-6 text-slate-500" aria-hidden="true" /><p className="mt-3 text-sm text-slate-600">Loading your application…</p></div>}
      {!loading && error && !application && <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50"><LockKeyhole className="h-6 w-6 text-sky-800" aria-hidden="true" /></span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Secure portal access</h1><p role="alert" className="mt-3 text-sm leading-7 text-slate-600">{error}</p>
        <Link to="/supplier-application" className="mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">Return to supplier application</Link>
      </section>}
      {application && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Supplier application">
        <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 px-4 py-5 sm:flex-row sm:px-7 sm:py-6">
          <div className="min-w-0"><p className="text-xs font-semibold text-slate-600">Supplier application</p><h1 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-[28px]">{application.company_name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"><p className="min-w-0 font-mono text-[13px] text-slate-600 [overflow-wrap:anywhere]">{application.application_number}</p><p className="text-xs leading-5 text-slate-600">Submitted <time dateTime={application.submitted_at}>{formatDate(application.submitted_at)}</time></p></div>
          </div>
          <span className={`inline-flex w-fit max-w-full shrink-0 items-center rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${statusStyles[application.status]}`}>{application.status.replaceAll('_', ' ')}</span>
        </div>
        <nav aria-label="Supplier portal sections" aria-orientation="horizontal" className="flex overflow-x-auto border-b border-slate-200 px-1 sm:px-5" role="tablist">
          {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`supplier-portal-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`supplier-portal-panel-${id}`} tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
              if (nextIndex === null) return;
              event.preventDefault();
              setTab(tabs[nextIndex].id);
              document.getElementById(`supplier-portal-tab-${tabs[nextIndex].id}`)?.focus();
            }}
            className={`inline-flex min-h-12 flex-1 shrink-0 cursor-pointer items-center justify-center gap-2 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-700 sm:flex-none sm:px-5 sm:text-[13px] ${tab === id ? 'border-sky-700 text-sky-800' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>)}
        </nav>
        <div className="p-4 sm:p-7">
          {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">{error}</div>}
          {application.status === 'NEEDS_REVISION' && <section className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 sm:p-5" aria-labelledby="revision-heading">
            <h2 id="revision-heading" className="text-lg font-semibold text-orange-950">Action required: update your application</h2><p className="mt-2 text-sm leading-6 text-orange-900 [overflow-wrap:anywhere]">{application.supplier_message}</p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-orange-950">{application.revision_reason_codes?.map((code) => <li key={code}>{revisionLabels[code] || code}</li>)}</ul>
            <form onSubmit={submitCorrections} className="mt-5 space-y-4 rounded-lg border border-orange-100 bg-white p-4" encType="multipart/form-data">
              {(application.revision_reason_codes?.some((code) => ['BUSINESS_CERTIFICATE', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Business Certificate<input name="business_certificate[]" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
              {(application.revision_reason_codes?.some((code) => ['BUSINESS_PERMIT', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Business Permit<input name="business_permit[]" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
              {(application.revision_reason_codes?.some((code) => ['PRODUCT_SERVICE_IMAGE', 'UNREADABLE_DOCUMENT', 'OTHER'].includes(code))) && <label className="block text-sm font-semibold">Replacement Product / Service Images<input name="product_service_image[]" type="file" multiple accept=".jpg,.jpeg,.png" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
              {(application.revision_reason_codes?.some((code) => ['INFORMATION_MISMATCH', 'INCOMPLETE_INFORMATION', 'OTHER'].includes(code))) && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Contact person<input name="contact_person" defaultValue={application.contact_person} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 sm:text-sm" /></label><RevisionOfferings initial={application.offerings ?? []} /></div>}
              <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-orange-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto">{saving ? 'Submitting corrections…' : 'Submit Corrections'}</button>
            </form>
          </section>}
          <div id={`supplier-portal-panel-${tab}`} role="tabpanel" aria-labelledby={`supplier-portal-tab-${tab}`} tabIndex={0} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-4">
            {tab === 'overview' && <PortalOverview application={application} statusText={statusMessage[application.status]} />}
            {tab === 'history' && <PortalHistory events={application.history} />}
            {tab === 'meeting' && <section aria-labelledby="meeting-heading">
              <h2 id="meeting-heading" className="text-xl font-semibold tracking-tight text-slate-950">Meeting schedule</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{application.confirmed_meeting ? application.confirmed_meeting.status === 'COMPLETED' ? 'Review your completed appointment.' : 'Review your confirmed appointment.' : application.available_meeting_slots.length > 0 ? 'Choose an appointment from the schedules offered below.' : 'Meeting information for your supplier application.'}</p>
              {application.confirmed_meeting ? <PortalMeetingDetails application={application} /> : application.available_meeting_slots.length > 0 ? <>
                <fieldset className="mt-5 space-y-3"><legend className="sr-only">Available meeting schedules</legend>{application.available_meeting_slots.map((slot) => <label key={slot.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:gap-4 sm:px-4 ${selectedSlot === slot.id ? 'border-sky-700 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50'}`}>
                  <input type="radio" name="meeting-slot" value={slot.id} checked={selectedSlot === slot.id} onChange={() => setSelectedSlot(slot.id)} className="h-4 w-4 shrink-0 accent-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2" />
                  <MeetingDateBlock startsAt={slot.starts_at} /><span className="min-w-0"><span className="block text-sm font-semibold leading-6 text-slate-900">{formatDate(slot.starts_at)}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{formatMeetingTime(slot)} · Asia/Manila</span></span>
                </label>)}</fieldset>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />Your selection is confirmed when you select Confirm Schedule.</p>
                <button type="button" disabled={!selectedSlot || saving} onClick={() => void confirmMeeting()} className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-sky-800 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving ? 'Confirming…' : 'Confirm Schedule'}</button>
              </> : <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" /><p className="text-sm leading-6 text-slate-600">{application.status === 'QUALIFIED_FOR_MEETING' ? 'Your application has been qualified for a meeting. Available schedules have not yet been posted. Please check again later.' : 'No meeting schedules are currently available.'}</p></div>}
              {application.status === 'QUALIFIED_FOR_MEETING' && application.available_meeting_slots.length > 0 && <section className="mt-6 border-t border-slate-200 pt-5" aria-label="Alternative meeting schedule">
                {!alternativeOpen ? <button type="button" disabled={application.alternative_schedule_requested} onClick={() => setAlternativeOpen(true)} className="min-h-11 max-w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold leading-6 text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{application.alternative_schedule_requested ? 'Another schedule requested' : 'None of these schedules work for me'}</button> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 id="alternative-heading" className="text-[15px] font-semibold text-slate-900">Request another schedule</h3><label className="mt-3 block text-sm font-medium text-slate-700">Preferred availability / message<textarea value={alternativeMessage} onChange={(event) => setAlternativeMessage(event.target.value)} rows={3} maxLength={2000} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-base font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 sm:text-sm" /></label>
                  <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => setAlternativeOpen(false)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">Cancel</button><button type="button" disabled={saving || alternativeMessage.trim().length < 3} onClick={() => void requestAnotherSchedule()} className="min-h-11 cursor-pointer rounded-lg bg-sky-800 px-4 text-sm font-semibold text-white hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Send Request</button></div>
                </div>}
              </section>}
            </section>}
          </div>
        </div>
      </section>}
      <p className="mx-auto mt-5 max-w-xl text-center text-[11px] leading-5 text-slate-600 sm:text-xs">This temporary portal only provides access to this supplier application. It does not grant access to SmartChain’s internal system.</p>
    </div>
  </main>;
};

export default SupplierPortalPage;
