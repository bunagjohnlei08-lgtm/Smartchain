import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

type Readiness = {
  case_reference: string; purchase_order_reference: string | null; financial_po_reference: string | null;
  source_ready: boolean; validation_errors: Record<string, string[]>;
  contract_status: 'CONTRACT_PENDING'; transport_status: 'NOT_SUBMITTED'; can_submit: false;
};

export default function FinancialCaseReadiness({ type, caseId, revision = '' }: {
  type: 'excess' | 'rejection' | 'discrepancy'; caseId: number; revision?: string;
}) {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError('');
    apiClient.get(`/financial-case-events/${type}/${caseId}/preview`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data.data); })
      .catch(requestError => {
        if (!controller.signal.aborted) setError(requestError?.response?.status === 403
          ? 'Financial readiness is unavailable for your role.'
          : requestError?.response?.status === 404 ? 'This case is unavailable for your assignment.'
          : 'Financial readiness could not be loaded. Retry to check the current case.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, caseId, revision, reload]);

  return <section aria-label="Financial case readiness" className="my-4 min-w-0 rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100">
    <h3 className="text-sm font-semibold">Financial handoff</h3>
    <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">Financial API contract pending</p>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">No case data has been sent through this integration. Receipt acknowledgment and commercial approval will be tracked separately.</p>
    {loading && <p role="status" className="mt-3 text-sm">Checking source readiness…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {data && <>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        {Object.entries({ Case: data.case_reference, 'Purchase Order': data.purchase_order_reference ?? 'Unavailable',
          'Financial PO reference': data.financial_po_reference ?? 'Not recorded',
          'Source readiness': data.source_ready ? 'Internal payload validated; partner contract pending' : 'Held — source information incomplete or ineligible',
          'Case transmission': 'Not submitted', 'Financial case reference / response': 'Not available — contract pending',
        }).map(([title, value]) => <div key={title} className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">{title}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
      </dl>
      {Object.keys(data.validation_errors).length > 0 && <div className="mt-3 text-xs"><h4 className="font-semibold">Required before handoff</h4><ul className="mt-1 list-disc space-y-1 pl-5">{Object.entries(data.validation_errors).flatMap(([field, messages]) => messages.map((message, index) => <li key={`${field}-${index}`}>{message}</li>))}</ul></div>}
    </>}
    <button type="button" disabled={loading} onClick={() => setReload(value => value + 1)} className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-3 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">Refresh readiness</button>
  </section>;
}
