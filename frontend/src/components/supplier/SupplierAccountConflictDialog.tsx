import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { mapSupplierAccount, supplierConflictTitle, type SupplierAccountInfo } from '../../lib/supplierAccount';

export default function SupplierAccountConflictDialog({ supplier, onClose, onReviewSupplier }: {
  supplier: { id: string; name: string; code: string; email: string };
  onClose: () => void;
  onReviewSupplier: () => void;
}) {
  const [account, setAccount] = useState<SupplierAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    apiClient.get(`/suppliers/${supplier.id}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setAccount(mapSupplierAccount(response.data.data.account)); })
      .catch(requestError => { if (!controller.signal.aborted) setError(requestError?.response?.data?.message || 'Unable to load current account status. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [supplier.id, attempt]);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, [onClose]);
  const details = account?.conflict;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="supplier-account-review-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-100 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id="supplier-account-review-title" className="text-lg font-semibold">Supplier Account Review</h2><p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{supplier.code} · {supplier.name}</p></div><button ref={close} type="button" onClick={onClose} aria-label="Close account review" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
      {loading ? <p role="status" className="py-6 text-sm">Loading current account state…</p> : error ? <p role="alert" className="my-4 break-words text-sm text-rose-700 dark:text-rose-300">{error}</p> : account && <div className="my-4 space-y-4 text-sm">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{account.status === 'CONFLICT' ? supplierConflictTitle(details?.code) : account.status === 'ACCOUNT_ACTIVE' ? 'Account Active' : 'Account state has changed'}</h3><p className="mt-2 break-words">{account.reason}</p></div>
        {details?.account && <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">{Object.entries({ 'User ID': details.account.userId, Role: details.account.role || 'Not recorded', 'Account status': details.account.status, 'Supplier relationship': details.account.supplierId === null ? 'Not linked' : `Supplier #${details.account.supplierId}` }).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>}
        {account.status === 'CONFLICT' && <div><h3 className="font-semibold">Next action</h3><p className="mt-1 break-words leading-6">{details?.nextAction || 'Verify the supplier contact email and existing account ownership. If the email was entered incorrectly, review Supplier Details. Linkage or role corrections require an authorized account administrator; email matching alone does not prove ownership.'}</p></div>}
        <p className="border-t border-slate-200 pt-3 leading-6 text-slate-600 dark:border-slate-700 dark:text-slate-400">This is a read-only review. It does not link users, change roles, reset passwords or send invitations. Account activation does not approve accreditation or grant bidding eligibility.</p>
      </div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh account status</button><button type="button" onClick={onReviewSupplier} className="min-h-11 cursor-pointer rounded-lg bg-[#092635] px-3 text-sm font-semibold text-white hover:bg-[#163b4a] focus-visible:outline-2 focus-visible:outline-cyan-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">Review Supplier Details</button></div>
    </div>
  </div>;
}
