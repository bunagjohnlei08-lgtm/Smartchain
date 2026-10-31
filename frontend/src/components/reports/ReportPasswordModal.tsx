import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

export interface ReportAccessRequest {
  resource: string;
  format: string;
  action: 'DOWNLOAD' | 'EXPORT' | 'PREVIEW' | 'PRINT';
  label: string;
  opensPrintWindow?: boolean;
}

interface Props {
  request: ReportAccessRequest | null;
  onCancel: () => void;
  onAuthorized: (authorization: string, printWindow?: Window) => Promise<void> | void;
}

const ReportPasswordModal: React.FC<Props> = ({ request, onCancel, onAuthorized }) => {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassword(''); setVisible(false); setError(''); setBusy(false);
    if (request) queueMicrotask(() => inputRef.current?.focus());
  }, [request]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy, onCancel]);

  if (!request) return null;

  const cancel = () => { if (!busy) { setPassword(''); onCancel(); } };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true); setError('');
    const printWindow = request.opensPrintWindow ? window.open('', '_blank') : null;
    if (request.opensPrintWindow && !printWindow) {
      setError('The report window was blocked. Allow pop-ups and try again.');
      setBusy(false);
      return;
    }
    if (printWindow) {
      printWindow.opener = null;
      printWindow.document.write('<!doctype html><title>Preparing report</title><p style="font:14px Arial;padding:24px">Preparing your protected report&hellip;</p>');
    }
    let authorization: string;
    try {
      const response = await apiClient.post<{ authorization: string }>('/report-access/confirm', {
        password, resource: request.resource, format: request.format, action: request.action,
      });
      authorization = response.data.authorization;
      setPassword('');
    } catch (requestError: any) {
      printWindow?.close();
      setError(requestError?.response?.data?.errors?.password?.[0] || requestError?.response?.data?.message || 'Password confirmation failed. Please try again.');
      setBusy(false);
      return;
    }
    // Downstream export/print errors belong to the caller and must never be
    // mislabeled as an incorrect password.
    try { await onAuthorized(authorization, printWindow ?? undefined); } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-password-title" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-white shadow-2xl dark:bg-[#0b101d]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
        <div className="flex gap-3"><span className="rounded-xl bg-cyan-500/10 p-2 text-cyan-500"><LockKeyhole className="h-5 w-5" /></span><div><h2 id="report-password-title" className="font-semibold text-slate-900 dark:text-white">Confirm your password</h2><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">For security, confirm your SmartChain password before <strong>{request.label}</strong>.</p></div></div>
        <button type="button" onClick={cancel} disabled={busy} aria-label="Close password confirmation" className="min-h-11 min-w-11 cursor-pointer rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed dark:hover:bg-slate-800"><X className="mx-auto h-5 w-5" /></button>
      </div>
      <div className="space-y-3 p-5">
        <label htmlFor="report-current-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Current password</label>
        <div className="relative"><input ref={inputRef} id="report-current-password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'report-password-error' : undefined} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-12 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-[#0d1322] dark:text-white" />
          <button type="button" onClick={() => setVisible((current) => !current)} disabled={busy} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 min-w-11 cursor-pointer text-slate-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500">{visible ? <EyeOff className="mx-auto h-4 w-4" /> : <Eye className="mx-auto h-4 w-4" />}</button></div>
        {error && <p id="report-password-error" role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800"><button type="button" onClick={cancel} disabled={busy} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button><button type="submit" disabled={busy || !password} className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">{busy ? 'Confirming…' : 'Confirm & Continue'}</button></div>
    </form>
  </div>;
};

export default ReportPasswordModal;
