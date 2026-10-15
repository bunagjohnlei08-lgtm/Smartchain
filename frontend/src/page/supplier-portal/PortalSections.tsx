import { Building2, Check, CheckCircle2, FileText, Info, Package, UserRound, Wrench, X } from 'lucide-react';

import { formatDate, formatDateTime, formatMeetingTime, formatSize, TIME_ZONE } from './portalPresentation';
import type { PortalApplication, PortalEvent } from './portalPresentation';

export function MeetingDateBlock({ startsAt }: { startsAt: string }) {
  const date = new Date(startsAt);
  return <div aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-sky-200 bg-sky-50 py-2">
    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">{new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, month: 'short' }).format(date)}</span>
    <span className="mt-0.5 text-[28px] font-semibold leading-none text-slate-900">{new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, day: '2-digit' }).format(date)}</span>
  </div>;
}

function DetailCard({ title, icon: Icon, fields }: {
  title: string; icon: typeof Building2; fields: { label: string; value: string | null | undefined }[];
}) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
    <h3 className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3.5 text-[15px] font-semibold text-slate-900 sm:px-5"><Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />{title}</h3>
    <dl className="divide-y divide-slate-100 px-4 sm:px-5">{fields.map(({ label, value }) => <div key={label} className="grid gap-1 py-3.5">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="min-w-0 text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{value || <span className="font-normal text-slate-500">Not provided</span>}</dd>
    </div>)}</dl>
  </section>;
}

export function PortalOverview({ application, statusText }: { application: PortalApplication; statusText: string }) {
  const latestEvent = application.history.at(-1);
  const offerings = application.offerings ?? [];
  return <section aria-labelledby="overview-heading" className="space-y-5">
    <div><h2 id="overview-heading" className="text-xl font-semibold tracking-tight text-slate-950">Application overview</h2><p className="mt-1 text-sm leading-6 text-slate-600">Your submitted information and latest application updates.</p></div>
    <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5"><Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-800" aria-hidden="true" /><p className="text-sm leading-6 text-sky-950">{statusText}</p></div>
      {latestEvent && <time dateTime={latestEvent.occurred_at} className="shrink-0 pl-6 text-xs text-sky-900 sm:pl-0">Updated {formatDateTime(latestEvent.occurred_at)}</time>}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <DetailCard title="Company details" icon={Building2} fields={[
        { label: 'Company', value: application.company_name },
        { label: 'Business type', value: application.business_type },
        { label: 'Supply category', value: application.supply_category },
      ]} />
      <DetailCard title="Contact & submission" icon={UserRound} fields={[
        { label: 'Contact person', value: application.contact_person },
        { label: 'Business email', value: application.email },
        { label: 'Submitted', value: formatDateTime(application.submitted_at) },
      ]} />
    </div>
    <section aria-labelledby="portal-offerings" className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5"><h3 id="portal-offerings" className="text-[15px] font-semibold text-slate-900">Products / services offered</h3></div>
      {offerings.length > 0 ? <ul className="divide-y divide-slate-100">{offerings.map((offering, index) => {
        const Icon = offering.type === 'SERVICE' ? Wrench : Package;
        return <li key={`${offering.type}-${offering.name}-${index}`} className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50"><Icon className="h-4 w-4 text-slate-600" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between">
            <div className="min-w-0"><p className="text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{offering.name}</p><p className="text-xs text-slate-600">{offering.type === 'PRODUCT' ? 'Product' : 'Service'}</p></div>
            {offering.category && <span className="max-w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 [overflow-wrap:anywhere] sm:max-w-[40%]">{offering.category}</span>}
          </div>{offering.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{offering.description}</p>}</div>
        </li>;
      })}</ul> : !application.products_services && <p className="px-4 py-4 text-sm text-slate-600 sm:px-5">No offerings listed.</p>}
      {application.products_services && <div className={`px-4 py-4 sm:px-5 ${offerings.length ? 'border-t border-slate-100' : ''}`}>
        <p className="text-xs font-semibold text-slate-600">{offerings.length ? 'Additional capabilities' : 'Products / services description'}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{application.products_services}</p>
      </div>}
    </section>
    {application.supplier_message && <section aria-labelledby="application-update-heading" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 sm:px-5"><h3 id="application-update-heading" className="text-sm font-semibold text-sky-950">Application update</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-900 [overflow-wrap:anywhere]">{application.supplier_message}</p></section>}
    <section aria-labelledby="submitted-files" className="rounded-xl border border-slate-200 bg-white">
      <h3 id="submitted-files" className="border-b border-slate-200 px-4 py-3.5 text-[15px] font-semibold text-slate-900 sm:px-5">Submitted files</h3>
      {application.attachments.length > 0 ? <ul className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">{application.attachments.map((file, index) => <li key={`${file.attachment_type}-${file.original_name}-${index}`} className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
        <FileText className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><div className="min-w-0"><p className="text-sm font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{file.original_name}</p><p className="mt-1 text-xs text-slate-600">{file.attachment_type.replaceAll('_', ' ')} · {formatSize(file.file_size)}</p></div>
      </li>)}</ul> : <p className="px-4 py-4 text-sm text-slate-600 sm:px-5">No submitted files are available.</p>}
    </section>
  </section>;
}

export function PortalHistory({ events }: { events: PortalEvent[] }) {
  return <section aria-labelledby="history-heading">
    <h2 id="history-heading" className="text-xl font-semibold tracking-tight text-slate-950">Application history</h2><p className="mt-1 text-sm leading-6 text-slate-600">Track updates to your supplier application.</p>
    {events.length === 0 ? <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No application updates are available yet.</p> : <ol className="mt-6">{events.map((event, index) => {
      const rejected = event.event_type === 'REJECTED';
      const positive = ['MEETING_SELECTED', 'MEETING_COMPLETED', 'APPROVED', 'APPLICATION_PROCESS_COMPLETED'].includes(event.event_type);
      const highlighted = index === events.length - 1 && (positive || rejected);
      const badge = event.event_type === 'MEETING_SELECTED' ? 'Confirmed' : event.event_type === 'APPROVED' ? 'Approved' : rejected ? 'Rejected' : null;
      return <li key={`${event.event_type}-${event.occurred_at}-${index}`} className="relative flex min-w-0 gap-3 pb-5 last:pb-0 sm:gap-4">
        {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-slate-200" />}
        <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${rejected ? 'bg-rose-700' : positive ? 'bg-emerald-700' : 'bg-sky-700'} text-white`} aria-hidden="true">{rejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}</span>
        <div className={`min-w-0 flex-1 rounded-xl ${highlighted ? `border p-3.5 sm:p-4 ${rejected ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}` : 'pb-2 pt-1'}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{event.title}</h3>{badge && <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${rejected ? 'border-rose-200 bg-white text-rose-800' : 'border-emerald-200 bg-white text-emerald-800'}`}>{badge}</span>}</div>
            <time dateTime={event.occurred_at} className="shrink-0 text-xs leading-6 text-slate-600">{formatDateTime(event.occurred_at)}</time>
          </div>{event.description && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{event.description}</p>}
        </div>
      </li>;
    })}</ol>}
  </section>;
}

export function PortalMeetingDetails({ application }: { application: PortalApplication }) {
  const meeting = application.confirmed_meeting;
  if (!meeting) return null;
  const completed = meeting.status === 'COMPLETED';
  return <div className="mt-5 space-y-4">
    <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />{completed ? 'Meeting completed' : 'Meeting confirmed'}</div>
    <section aria-label="Appointment details" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex min-w-0 items-center gap-4 border-b border-slate-200 p-4 sm:p-5"><MeetingDateBlock startsAt={meeting.starts_at} /><div className="min-w-0"><h3 className="text-[15px] font-semibold leading-6 text-slate-900">Supplier application meeting</h3><p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{application.company_name}</p></div></div>
      <dl className="grid grid-cols-1 gap-4 p-4 min-[390px]:grid-cols-2 sm:p-5 lg:grid-cols-4">
        {[
          ['Date', formatDate(meeting.starts_at)],
          ['Time', formatMeetingTime(meeting)],
          ['Time zone', TIME_ZONE],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1.5 text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{value}</dd></div>)}
        <div><dt className="text-xs text-slate-600">Status</dt><dd className="mt-1.5"><span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">{completed ? 'Completed' : 'Confirmed'}</span></dd></div>
      </dl>
      <p className="flex items-start gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 sm:px-5"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />{completed ? 'Check your application status and history for further updates.' : 'Please be ready before the scheduled time.'}</p>
    </section>
  </div>;
}
