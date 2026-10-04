import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';

export interface PickListItem {
  id: string;
  productName: string;
  requiredQty: number;
  unit: string;
}

export interface PickListOrder {
  id: string;
  orderNumber: string;
  customer: string;
  destination: string;
  assignedWarehouse: string;
  targetDelivery: string;
  status: string;
  items: PickListItem[];
}

type PickListAction = 'print' | 'export';
type PickListScope = 'selected' | 'filtered';

interface PickListModalProps {
  action: PickListAction;
  selectedOrders: PickListOrder[];
  filteredOrders: PickListOrder[];
  generatedBy?: string;
  onClose: () => void;
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const csvCell = (value: unknown): string => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

const generatedAt = (): string => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
}).format(new Date());

const printPickList = (orders: PickListOrder[], generatedBy?: string): boolean => {
  const popup = window.open('', '_blank', 'width=1000,height=800');
  if (!popup) return false;
  popup.opener = null;

  const sections = orders.map((order) => {
    const rows = order.items.map((item) => `<tr><td>${escapeHtml(item.productName)}</td><td class="number">${escapeHtml(item.requiredQty)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(order.assignedWarehouse)}</td></tr>`).join('');
    return `<section class="order"><header class="order-header"><div><p class="eyebrow">Order</p><h2>${escapeHtml(order.orderNumber)}</h2></div><span>${escapeHtml(order.status)}</span></header><dl><div><dt>Customer / Destination</dt><dd>${escapeHtml(order.customer)}${order.destination ? `<br>${escapeHtml(order.destination)}` : ''}</dd></div><div><dt>Target delivery</dt><dd>${escapeHtml(order.targetDelivery)}</dd></div></dl><table><thead><tr><th>Product</th><th class="number">Required quantity</th><th>Unit</th><th>Warehouse</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');

  popup.document.write(`<!doctype html><html><head><title>SmartChain Order Pick List</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font:12px Arial,sans-serif;color:#111827}main{max-width:190mm;margin:auto}.document-header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0891b2;padding-bottom:12px}.brand{font-size:14px;font-weight:800;letter-spacing:.18em;color:#0e7490}.document-header h1{margin:4px 0 0;font-size:24px}.meta{text-align:right;color:#475569;line-height:1.6}.order{margin-top:22px;break-inside:avoid-page}.order+.order{border-top:2px dashed #94a3b8;padding-top:22px}.order-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.order-header h2{margin:2px 0 0;font-size:18px}.order-header span{border:1px solid #94a3b8;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700}.eyebrow,dt{margin:0;color:#64748b;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}dl{display:grid;grid-template-columns:2fr 1fr;gap:18px;margin:12px 0}dd{margin:3px 0 0;line-height:1.45}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9;font-size:10px;text-transform:uppercase}.number{text-align:right}.checks{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px;break-inside:avoid}.line{margin-top:30px;border-top:1px solid #111827;padding-top:5px}.remarks{grid-column:1/-1}.screen-only{margin-bottom:16px}@media print{.screen-only{display:none}main{max-width:none}}</style></head><body><main><button class="screen-only" onclick="window.print()">Print</button><header class="document-header"><div><div class="brand">SMARTCHAIN</div><h1>ORDER PICK LIST</h1></div><div class="meta"><div>Generated: ${escapeHtml(generatedAt())}</div><div>Prepared by: ${escapeHtml(generatedBy || 'Plant Manager')}</div><div>Orders: ${orders.length}</div></div></header>${sections}<section class="checks"><div class="line">Picked By</div><div class="line">Checked By</div><div class="line">Date / Time</div><div class="line remarks">Remarks</div></section></main><script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
  popup.document.close();
  return true;
};

const exportPickList = (orders: PickListOrder[]): void => {
  const header = ['Order No.', 'Warehouse', 'Product', 'Quantity to Prepare', 'Unit', 'Target Delivery', 'Destination', 'Status'];
  const rows = orders.flatMap((order) => order.items.map((item) => [
    order.orderNumber,
    order.assignedWarehouse,
    item.productName,
    item.requiredQty,
    item.unit,
    order.targetDelivery,
    order.destination,
    order.status,
  ]));
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartchain-pick-list-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const PickListModal: React.FC<PickListModalProps> = ({ action, selectedOrders, filteredOrders, generatedBy, onClose }) => {
  const [scope, setScope] = useState<PickListScope>('selected');
  const [error, setError] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const orders = useMemo(() => scope === 'selected' ? selectedOrders : filteredOrders, [filteredOrders, scope, selectedOrders]);
  const isPrint = action === 'print';

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const generate = () => {
    if (orders.length === 0) {
      setError('Select at least one order to generate a pick list.');
      return;
    }
    if (isPrint && !printPickList(orders, generatedBy)) {
      setError('The print window was blocked. Allow pop-ups for SmartChain and try again.');
      return;
    }
    if (!isPrint) exportPickList(orders);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="pick-list-title" aria-describedby="pick-list-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b101d] p-5 text-slate-100 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="pick-list-title" className="text-lg font-bold text-white">{isPrint ? 'Print Pick List' : 'Export Pick List'}</h2><p id="pick-list-description" className="mt-1 text-sm text-slate-400">Choose the eligible preparation workload to include.</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close pick list dialog" className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"><X className="h-5 w-5" /></button>
        </div>

        <fieldset className="mt-5 space-y-3">
          <legend className="text-sm font-semibold text-slate-200">Scope</legend>
          <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${scope === 'selected' ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 hover:border-slate-600'}`}><input type="radio" name="pick-list-scope" value="selected" checked={scope === 'selected'} onChange={() => { setScope('selected'); setError(''); }} className="mt-1 h-4 w-4 accent-cyan-500" /><span><span className="block text-sm font-medium text-white">Selected Orders</span><span className="mt-0.5 block text-xs text-slate-400">{selectedOrders.length} eligible order{selectedOrders.length === 1 ? '' : 's'} selected</span></span></label>
          <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${scope === 'filtered' ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 hover:border-slate-600'}`}><input type="radio" name="pick-list-scope" value="filtered" checked={scope === 'filtered'} onChange={() => { setScope('filtered'); setError(''); }} className="mt-1 h-4 w-4 accent-cyan-500" /><span><span className="block text-sm font-medium text-white">Current Filtered Eligible Orders</span><span className="mt-0.5 block text-xs text-slate-400">{filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'} match the current search and filters</span></span></label>
        </fieldset>

        {(error || orders.length === 0) && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error || 'Select at least one order to generate a pick list.'}</p>}
        <p className="mt-4 text-xs leading-5 text-slate-400">Generating this document does not change order status or inventory.</p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 cursor-pointer rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">Cancel</button>
          <button type="button" onClick={generate} disabled={orders.length === 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">{isPrint ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}{isPrint ? 'Print Pick List' : 'Export CSV'}</button>
        </div>
      </section>
    </div>
  );
};

export default PickListModal;
