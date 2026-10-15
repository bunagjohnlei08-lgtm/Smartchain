import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { secondaryClass } from './ProductionUi';

/** Native modal supplies focus trapping/Escape semantics; discard review stays inside this one dialog. */
export default function ProductionDialog({ title, children, footer, busy = false, dirty = false, onClose }: {
  title: string; children: ReactNode; footer?: ReactNode; busy?: boolean; dirty?: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [discard, setDiscard] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else { dialog.current?.close(); onClose(); } };
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="production-dialog-title" className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-100">
    <div className="flex max-h-[92dvh] flex-col"><header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-800"><h2 id="production-dialog-title" className="min-w-0 break-words text-lg font-semibold">{title}</h2><button type="button" onClick={close} disabled={busy} aria-label="Close production dialog" className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" aria-hidden="true"/></button></header>
      <div className="min-h-0 overflow-y-auto p-5">{discard && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Discard unsaved changes?</p><p>Your entered values have not been saved.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={() => setDiscard(false)}>Keep Editing</button><button type="button" className={`${secondaryClass} text-red-800 dark:text-red-300`} onClick={() => { dialog.current?.close(); onClose(); }}>Discard Changes</button></div></div>}{children}</div>
      {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</footer>}
    </div>
  </dialog>;
}
