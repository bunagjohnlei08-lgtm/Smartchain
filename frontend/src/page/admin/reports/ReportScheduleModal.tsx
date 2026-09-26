import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Pause, Play, Trash2, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import ReportFilterFields, { fieldClass, labelClass } from './ReportFilterFields';
import { StatusPill } from './ReportTable';
import {
  applicableFilters, errorMessage, FORMAT_LABELS, formatDateTime,
  type ReportDefinition, type ReportFilterValues, type ReportFormat, type ReportOptions, type ReportSchedule, type SchedulerState,
} from './reportApi';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WINDOW_LABELS: Record<string, string> = { ALL: 'All records', LAST_1_DAY: 'Last 1 day', LAST_7_DAYS: 'Last 7 days', LAST_30_DAYS: 'Last 30 days' };

interface Props {
  definitions: ReportDefinition[];
  categories: Array<{ id: string; label: string }>;
  options: ReportOptions | null;
  initialCategory: string;
  onClose: () => void;
  onChanged: () => void;
}

const describe = (schedule: ReportSchedule) => {
  const at = `at ${schedule.run_time}`;
  if (schedule.frequency === 'WEEKLY') return `Weekly on ${DAYS[schedule.day_of_week ?? 0]} ${at}`;
  if (schedule.frequency === 'MONTHLY') return `Monthly on day ${schedule.day_of_month} ${at}`;
  return `Daily ${at}`;
};

const ReportScheduleModal: React.FC<Props> = ({ definitions, categories, options, initialCategory, onClose, onChanged }) => {
  const available = useMemo(() => definitions.filter((definition) => definition.available), [definitions]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(available.some((item) => item.category === initialCategory) ? initialCategory : (available[0]?.category ?? ''));
  const inCategory = available.filter((definition) => definition.category === category);
  const [reportKey, setReportKey] = useState(inCategory[0]?.key ?? '');
  const definition = available.find((item) => item.key === reportKey) ?? null;
  const [format, setFormat] = useState<ReportFormat>('CSV');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [runTime, setRunTime] = useState('08:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dateWindow, setDateWindow] = useState('ALL');
  const [filters, setFilters] = useState<ReportFilterValues>({});
  const [recipientId, setRecipientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ data: ReportSchedule[]; scheduler: SchedulerState }>('/admin/reports/schedules');
      setSchedules(data.data);
      setScheduler(data.scheduler);
    } catch (error) {
      setMessage({ type: 'error', text: await errorMessage(error, 'Unable to load report schedules.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!recipientId && options?.recipients[0]) setRecipientId(String(options.recipients[0].id)); }, [options, recipientId]);
  useEffect(() => { if (definition && !definition.formats.includes(format)) setFormat(definition.formats[0] ?? 'CSV'); }, [definition, format]);
  useEffect(() => { if (definition && !definition.filters.includes('date')) setDateWindow('ALL'); }, [definition]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!definition) return;
    setBusy(true);
    setMessage(null);
    // Fixed dates are not allowed on schedules; the relative date window applies instead.
    const rest = applicableFilters(definition, filters);
    delete rest.date_from;
    delete rest.date_to;
    try {
      const { data } = await apiClient.post<{ message: string; scheduler: SchedulerState }>('/admin/reports/schedules', {
        report_key: definition.key, format, frequency, run_time: runTime,
        ...(frequency === 'WEEKLY' ? { day_of_week: dayOfWeek } : {}),
        ...(frequency === 'MONTHLY' ? { day_of_month: dayOfMonth } : {}),
        date_window: dateWindow, recipient_user_id: Number(recipientId), ...rest,
      });
      setScheduler(data.scheduler);
      setMessage({ type: 'success', text: 'Schedule saved.' });
      setFilters({});
      await load();
      onChanged();
    } catch (error) {
      setMessage({ type: 'error', text: await errorMessage(error, 'Unable to save the schedule.') });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (schedule: ReportSchedule) => {
    setBusy(true);
    try {
      await apiClient.patch(`/admin/reports/schedules/${schedule.id}`, { status: schedule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
      await load();
      onChanged();
    } catch (error) {
      setMessage({ type: 'error', text: await errorMessage(error, 'Unable to update the schedule.') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (schedule: ReportSchedule) => {
    if (!window.confirm(`Delete the schedule for ${schedule.report_name}?`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/reports/schedules/${schedule.id}`);
      await load();
      onChanged();
    } catch (error) {
      setMessage({ type: 'error', text: await errorMessage(error, 'Unable to delete the schedule.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="report-schedule-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700/80 bg-white shadow-2xl dark:bg-[#0b101d]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 p-4 sm:p-5">
          <div>
            <h2 id="report-schedule-title" className="text-[15px] font-semibold text-slate-900 dark:text-white sm:text-lg">Schedule Report</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Scheduled reports are emailed as attachments to an active Admin account. Times use {options?.schedule.timezone ?? 'the server timezone'}.</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close schedule report" className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {scheduler?.running && (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Scheduler active — last run {formatDateTime(scheduler.last_run_at)}.
            </p>
          )}
          {/* Scheduler infrastructure warning intentionally hidden from Admin UI.
              Restore here if scheduled delivery is enabled/configured in production. */}

          <section aria-labelledby="new-schedule-heading" className="space-y-3">
            <h3 id="new-schedule-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">New schedule</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="schedule-category" className={labelClass}>Category</label>
                <select id="schedule-category" value={category} onChange={(event) => { setCategory(event.target.value); setReportKey(available.find((item) => item.category === event.target.value)?.key ?? ''); setFilters({}); }} className={fieldClass}>
                  {categories.filter((item) => available.some((definition) => definition.category === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="schedule-report" className={labelClass}>Report</label>
                <select id="schedule-report" value={reportKey} onChange={(event) => { setReportKey(event.target.value); setFilters({}); }} className={fieldClass}>
                  {inCategory.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="schedule-format" className={labelClass}>Format</label>
                <select id="schedule-format" value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)} className={fieldClass}>
                  {definition?.formats.map((item) => <option key={item} value={item}>{FORMAT_LABELS[item]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="schedule-frequency" className={labelClass}>Frequency</label>
                <select id="schedule-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} className={fieldClass}>
                  <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                </select>
              </div>
              {frequency === 'WEEKLY' && (
                <div>
                  <label htmlFor="schedule-day" className={labelClass}>Day of week</label>
                  <select id="schedule-day" value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))} className={fieldClass}>
                    {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </div>
              )}
              {frequency === 'MONTHLY' && (
                <div>
                  <label htmlFor="schedule-date" className={labelClass}>Day of month</label>
                  <select id="schedule-date" value={dayOfMonth} onChange={(event) => setDayOfMonth(Number(event.target.value))} className={fieldClass}>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="schedule-time" className={labelClass}>Time</label>
                <input id="schedule-time" type="time" value={runTime} onChange={(event) => setRunTime(event.target.value)} className={fieldClass} />
              </div>
              {definition?.filters.includes('date') && (
                <div>
                  <label htmlFor="schedule-window" className={labelClass}>{definition.date_label ?? 'Date'} range at run time</label>
                  <select id="schedule-window" value={dateWindow} onChange={(event) => setDateWindow(event.target.value)} className={fieldClass}>
                    {(options?.schedule.date_windows ?? ['ALL']).map((window) => <option key={window} value={window}>{WINDOW_LABELS[window] ?? window}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label htmlFor="schedule-recipient" className={labelClass}>Recipient (active Admin)</label>
                <select id="schedule-recipient" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className={fieldClass}>
                  {options?.recipients.length === 0 && <option value="">No eligible Admin recipients</option>}
                  {options?.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} — {recipient.email}</option>)}
                </select>
              </div>
            </div>
            {definition && <ReportFilterFields definition={definition} values={filters} onChange={setFilters} options={options} hideDates idPrefix="schedule" />}
            <div className="flex justify-end">
              <button onClick={() => void save()} disabled={busy || !definition || !recipientId}
                className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:text-sm">
                {busy ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </section>

          {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-xs sm:text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>{message.text}</p>}

          <section aria-labelledby="existing-schedules-heading" className="space-y-2">
            <h3 id="existing-schedules-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-300">Saved schedules</h3>
            {loading && <p className="text-xs text-slate-500">Loading schedules…</p>}
            {!loading && schedules.length === 0 && <p className="text-xs text-slate-500">No report schedules yet.</p>}
            {schedules.map((schedule) => (
              <div key={schedule.id} className="flex flex-col gap-2 rounded-xl border border-slate-800/80 bg-[#070a12] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-200"><span className="truncate">{schedule.report_name}</span><StatusPill value={schedule.status} /></p>
                  <p className="mt-1 text-slate-500">{describe(schedule)} · {FORMAT_LABELS[schedule.format]} · {WINDOW_LABELS[schedule.date_window] ?? schedule.date_window} · to {schedule.recipient?.name ?? 'removed user'}</p>
                  <p className="mt-0.5 text-slate-500">
                    Next run {schedule.status === 'ACTIVE' ? formatDateTime(schedule.next_run_at) : '— (paused)'}
                    {schedule.last_run_at && ` · Last run ${formatDateTime(schedule.last_run_at)} (${schedule.last_status ?? 'unknown'})`}
                  </p>
                  {schedule.last_error && <p className="mt-0.5 text-red-500">{schedule.last_error}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => void toggle(schedule)} disabled={busy} aria-label={schedule.status === 'ACTIVE' ? `Pause ${schedule.report_name} schedule` : `Resume ${schedule.report_name} schedule`} className="min-h-11 min-w-11 cursor-pointer rounded-lg border border-slate-700 p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50">
                    {schedule.status === 'ACTIVE' ? <Pause className="mx-auto h-3.5 w-3.5" /> : <Play className="mx-auto h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => void remove(schedule)} disabled={busy} aria-label={`Delete ${schedule.report_name} schedule`} className="min-h-11 min-w-11 cursor-pointer rounded-lg border border-slate-700 p-2 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50">
                    <Trash2 className="mx-auto h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ReportScheduleModal;
