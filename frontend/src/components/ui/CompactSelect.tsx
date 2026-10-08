import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface CompactSelectOption { value: string; label: string }

interface CompactSelectProps {
  value: string;
  label: string;
  options: CompactSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

const CompactSelect: React.FC<CompactSelectProps> = ({ value, label, options, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const allOptions = [{ value: '', label }, ...options];

  return (
    <div ref={rootRef} className={`relative min-w-[130px] flex-1 ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-xs text-black transition-colors hover:bg-slate-50 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-[#090d16] dark:text-white dark:hover:bg-slate-900"
      >
        <span className="min-w-0 flex-1 truncate" title={selected?.label ?? label}>{selected?.label ?? label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="absolute left-0 top-full z-40 mt-1 max-h-56 w-full min-w-0 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1 text-black shadow-xl dark:border-slate-700 dark:bg-[#090d16] dark:text-white">
          {allOptions.map((option) => (
            <button
              key={option.value || '__all'}
              type="button"
              role="option"
              aria-selected={value === option.value}
              title={option.label}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-xs text-black transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 dark:text-white dark:hover:bg-slate-800 ${value === option.value ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'bg-white dark:bg-[#090d16]'}`}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {value === option.value && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompactSelect;
