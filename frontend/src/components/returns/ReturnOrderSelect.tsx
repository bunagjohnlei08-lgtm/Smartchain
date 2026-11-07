import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type ReturnSelectOption = { value: string; label: string; disabled?: boolean };

export default function ReturnOrderSelect({ label, value, options, onChange, placeholder, disabled = false, selectedLabel }: {
  label: string; value: string; options: ReturnSelectOption[]; onChange: (value: string) => void;
  placeholder: string; disabled?: boolean; selectedLabel?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(-1); const [height, setHeight] = useState(192);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const selected = options.find(option => option.value === value);
  const close = () => setOpen(false);

  useEffect(() => { setOpen(false); }, [value, disabled, options]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const scroll = trigger.current.closest<HTMLElement>('[data-return-dialog-scroll]');
    const measure = (reposition = false) => {
      const field = trigger.current;
      if (!field) return;
      const visibleBottom = Math.min(window.innerHeight, window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight, scroll?.getBoundingClientRect().bottom ?? window.innerHeight) - 12;
      const wanted = Math.min(192, Math.max(0, (scroll?.clientHeight ?? window.innerHeight) - field.offsetHeight - 24));
      if (reposition && scroll) scroll.scrollTop += Math.max(0, wanted - (visibleBottom - field.getBoundingClientRect().bottom - 6));
      setHeight(Math.max(0, Math.min(192, visibleBottom - field.getBoundingClientRect().bottom - 6)));
    };
    measure(true);
    const update = () => measure(false);
    window.addEventListener('resize', update); window.visualViewport?.addEventListener('resize', update); scroll?.addEventListener('scroll', update);
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); scroll?.removeEventListener('scroll', update); };
  }, [open]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const show = (last = false) => {
    if (disabled) return;
    const current = options.findIndex(option => option.value === value && !option.disabled);
    setActive(current >= 0 ? current : last ? enabled.at(-1) ?? -1 : enabled[0] ?? -1); setOpen(true);
  };
  const choose = (index: number) => { const option = options[index]; if (!option || option.disabled) return; onChange(option.value); close(); trigger.current?.focus(); };
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(event.key === 'ArrowUp' || event.key === 'End'); return; }
      const position = enabled.indexOf(active);
      setActive(event.key === 'Home' ? enabled[0] ?? -1 : event.key === 'End' ? enabled.at(-1) ?? -1
        : enabled[Math.max(0, Math.min(enabled.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))] ?? -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) choose(active); else show();
    }
  };

  return <div ref={root} className="min-w-0 text-sm">
    <span id={`${id}-label`} className="block font-medium">{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-required="true" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} disabled={disabled} onKeyDown={keydown} onBlur={close} onClick={() => open ? close() : show()}
      className="mt-1 flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <span className="min-w-0 break-words">{selected?.label ?? (value && selectedLabel ? selectedLabel : placeholder)}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
    </button>
    {open && <div id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} data-placement="bottom" style={{ maxHeight: height }} className="relative z-10 mt-1 overflow-y-auto overscroll-contain rounded-lg border border-slate-300 bg-white p-1 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      {options.length ? options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} onPointerDown={event => event.preventDefault()} onMouseMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}
        className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm ${option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${index === active ? 'bg-cyan-50 dark:bg-slate-800' : ''}`}>
        <span className="min-w-0 flex-1 break-words">{option.label}</span>{option.value === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </div>) : <p className="p-3 text-sm">No options available.</p>}
    </div>}
  </div>;
}
