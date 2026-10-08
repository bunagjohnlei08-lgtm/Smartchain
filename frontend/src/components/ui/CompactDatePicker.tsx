import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface CompactDatePickerProps {
  value: string;
  label: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  className?: string;
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

const CompactDatePicker: React.FC<CompactDatePickerProps> = ({ value, label, min, max, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseIsoDate(value) ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

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

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const days = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - first.getDay() + 1));
  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(first);
  const today = isoDate(new Date());
  const selectDate = (date: Date) => {
    const next = isoDate(date);
    if ((min && next < min) || (max && next > max)) return;
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setViewDate(parseIsoDate(value) ?? new Date()); setOpen((current) => !current); }} className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 transition-colors hover:bg-slate-50 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-[#090d16] dark:text-white dark:hover:bg-slate-900">
        <span className={`min-w-0 truncate ${value ? '' : 'text-slate-500 dark:text-slate-400'}`}>{value || label}</span>
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label={`${label} calendar`} className="absolute right-0 top-full z-50 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-[#090d16] dark:text-white">
          <div className="flex h-8 items-center justify-between">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-xs font-semibold">{monthLabel}</p>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{day}</span>)}
            {days.map((date) => {
              const dateValue = isoDate(date);
              const outside = date.getMonth() !== month;
              const disabled = Boolean((min && dateValue < min) || (max && dateValue > max));
              const selected = dateValue === value;
              return <button key={dateValue} type="button" disabled={disabled} onClick={() => selectDate(date)} aria-label={date.toLocaleDateString('en-PH', { dateStyle: 'long' })} aria-pressed={selected} className={`h-8 w-8 cursor-pointer rounded-lg text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-30 ${selected ? 'bg-cyan-700 font-semibold text-white dark:bg-cyan-500 dark:text-slate-950' : outside ? 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800' : dateValue === today ? 'font-semibold text-cyan-700 hover:bg-slate-100 dark:text-cyan-300 dark:hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{date.getDate()}</button>;
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="min-h-8 cursor-pointer rounded-lg px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-slate-200 dark:hover:bg-slate-800">Clear</button>
            <button type="button" disabled={Boolean((min && today < min) || (max && today > max))} onClick={() => selectDate(new Date())} className="min-h-8 cursor-pointer rounded-lg px-2 text-xs font-semibold text-cyan-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-cyan-300 dark:hover:bg-slate-800">Today</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompactDatePicker;
