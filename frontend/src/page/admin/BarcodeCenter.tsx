import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Barcode, CheckCircle, ChevronRight, Download, FileText, LoaderCircle, Printer, Search, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface InventoryBarcodeApiItem { id: number | string; barcode: string | null; product?: string | null; category?: string | null; warehouse?: string | null; available_stock?: number | null; }
interface BarcodeItem { id: string; productName: string; category: string | null; warehouse: string | null; availableStock: number | null; barcode: string; }
interface BarcodeBars { bars: Array<{ x: number; width: number }>; width: number; }
type PrintLayout = 'single' | 'letter4';

const ALL_CATEGORIES = 'All categories';
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112',
] as const;

const buildCode128Bars = (value: string): BarcodeBars | null => {
  const values = Array.from(value, (character) => character.charCodeAt(0) - 32);
  if (!value || values.some((code) => code < 0 || code > 94)) return null;
  const startCode = 104;
  const checksum = (startCode + values.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const bars: BarcodeBars['bars'] = [];
  let x = 10;
  [startCode, ...values, checksum, 106].forEach((symbol) => {
    CODE128_PATTERNS[symbol].split('').forEach((moduleWidth, index) => {
      const width = Number(moduleWidth);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
  });
  return { bars, width: x + 10 };
};

const BarcodeSVG: React.FC<{ value: string }> = ({ value }) => {
  const encoded = useMemo(() => buildCode128Bars(value), [value]);
  if (!encoded) return <p className="text-xs text-rose-400">Barcode cannot be rendered.</p>;
  return <svg viewBox={`0 0 ${encoded.width} 64`} xmlns="http://www.w3.org/2000/svg" className="h-14 w-full text-slate-200" role="img" aria-label={`Barcode ${value}`} shapeRendering="crispEdges">
    {encoded.bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} y="2" width={bar.width} height="60" fill="currentColor" />)}
  </svg>;
};

const escapeHtml = (value: string | number | null | undefined): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const barcodeSvgMarkup = (value: string): string => {
  const encoded = buildCode128Bars(value);
  if (!encoded) return '<p class="render-error">Barcode cannot be rendered.</p>';
  const bars = encoded.bars.map((bar) => `<rect x="${bar.x}" y="2" width="${bar.width}" height="60" fill="#111827"/>`).join('');
  return `<svg viewBox="0 0 ${encoded.width} 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${escapeHtml(value)}" shape-rendering="crispEdges">${bars}</svg>`;
};
const labelMarkup = (item: BarcodeItem): string => `<article class="label"><header class="label-header"><p class="brand">SMARTCHAIN <span>/ ARCHON NELL</span></p><p class="label-type">INVENTORY LABEL</p></header><div class="identity"><h2>${escapeHtml(item.productName)}</h2>${item.category ? `<p class="category">${escapeHtml(item.category)}</p>` : ''}</div><div class="barcode">${barcodeSvgMarkup(item.barcode)}</div><p class="number">${escapeHtml(item.barcode)}</p>${item.warehouse ? `<p class="warehouse">${escapeHtml(item.warehouse)}</p>` : ''}</article>`;

const chunkItems = (items: BarcodeItem[], size: number): BarcodeItem[][] => {
  const chunks: BarcodeItem[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const openPrintDocument = (items: BarcodeItem[], title: string, saveAsPdf: boolean, layout: PrintLayout): boolean => {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  const sheets = layout === 'single'
    ? items.map((item) => `<main class="sheet single-sheet">${labelMarkup(item)}</main>`).join('')
    : chunkItems(items, 4).map((group) => `<main class="sheet letter-sheet">${group.map(labelMarkup).join('')}</main>`).join('');
  const pageStyles = layout === 'single'
    ? '@page{size:4.25in 5.5in;margin:0}.single-sheet{width:4.25in;height:5.5in}'
    : '@page{size:letter;margin:0}.letter-sheet{display:grid;grid-template-columns:repeat(2,4.25in);grid-template-rows:repeat(2,5.5in);width:8.5in;height:11in}';
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    ${pageStyles}*{box-sizing:border-box}html,body{margin:0}body{padding:24px;color:#111827;background:#e2e8f0;font-family:Arial,sans-serif}.notice{max-width:8.5in;margin:0 auto 16px;color:#334155;font-size:14px}.sheet{overflow:hidden;margin:0 auto 24px;background:#fff;box-shadow:0 12px 32px rgba(15,23,42,.18);break-after:page}.label{display:flex;min-width:0;height:100%;break-inside:avoid;flex-direction:column;border:1px solid #cbd5e1;padding:.34in;text-align:center}.label-header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #cbd5e1;padding-bottom:.12in;text-align:left}.brand,.label-type{margin:0;font-size:10pt;font-weight:800;letter-spacing:.08em}.brand{color:#0e7490}.brand span{color:#334155}.label-type{color:#64748b;font-size:8pt}.identity{margin-top:.24in}.identity h2{margin:0;font-size:18pt;line-height:1.18;overflow-wrap:anywhere}.category{margin:.08in 0 0;color:#475569;font-size:11pt}.barcode{display:flex;width:100%;min-height:1.45in;flex:1;align-items:center;justify-content:center;margin:.2in 0 .08in}.barcode svg{display:block;width:100%;height:1.45in;max-width:100%}.number{margin:0;font:700 13pt 'Courier New',monospace;letter-spacing:.08em;overflow-wrap:anywhere}.warehouse{margin:.18in 0 0;border-top:1px solid #cbd5e1;padding-top:.14in;color:#334155;font-size:11pt;font-weight:700}.render-error{color:#b91c1c;font-size:11pt}@media print{body{padding:0;background:#fff}.notice{display:none}.sheet{margin:0;box-shadow:none}.sheet:last-child{break-after:auto}}
  </style></head><body>${saveAsPdf ? '<p class="notice">Choose &ldquo;Save as PDF&rdquo; in the print dialog.</p>' : ''}${sheets}<script>window.onload=()=>{window.focus();window.print();};</script></body></html>`);
  popup.document.close();
  return true;
};

const BarcodeCenter: React.FC = () => {
  const [barcodes, setBarcodes] = useState<BarcodeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [printLayout, setPrintLayout] = useState<PrintLayout>('single');

  useEffect(() => {
    let active = true;
    const loadBarcodes = async () => {
      setLoading(true); setError('');
      try {
        const response = await apiClient.get<{ data?: InventoryBarcodeApiItem[] }>('/inventory');
        if (!active) return;
        const records = Array.isArray(response.data?.data) ? response.data.data : [];
        setBarcodes(records.filter((item) => typeof item.barcode === 'string' && item.barcode.trim() !== '').map((item) => ({
          id: String(item.id), barcode: item.barcode!.trim(), productName: item.product?.trim() || 'Unknown Product', category: item.category?.trim() || null, warehouse: item.warehouse?.trim() || null, availableStock: typeof item.available_stock === 'number' ? item.available_stock : null,
        })));
      } catch {
        if (!active) return;
        setBarcodes([]); setError('Unable to load barcode records. Please try again.');
      } finally { if (active) setLoading(false); }
    };
    void loadBarcodes();
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [ALL_CATEGORIES, ...Array.from(new Set(barcodes.map((item) => item.category).filter((category): category is string => Boolean(category)))).sort((a, b) => a.localeCompare(b))], [barcodes]);
  const filteredBarcodes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return barcodes.filter((item) => {
      const matchesSearch = !query || [item.productName, item.barcode, item.category || ''].some((value) => value.toLocaleLowerCase().includes(query));
      return matchesSearch && (categoryFilter === ALL_CATEGORIES || item.category === categoryFilter);
    });
  }, [barcodes, searchQuery, categoryFilter]);

  const showNotification = (message: string) => { setToastMessage(message); setShowToast(true); window.setTimeout(() => setShowToast(false), 3000); };
  const printRecords = (items: BarcodeItem[], saveAsPdf: boolean) => {
    if (items.length === 0) { showNotification('There are no displayed barcode records to export.'); return; }
    const opened = openPrintDocument(items, saveAsPdf ? 'SmartChain Barcode Labels PDF' : 'SmartChain Barcode Labels', saveAsPdf, printLayout);
    showNotification(opened ? (saveAsPdf ? 'Choose “Save as PDF” in the print dialog.' : `Prepared ${items.length} barcode label${items.length === 1 ? '' : 's'} for printing.`) : 'The print window was blocked. Please allow pop-ups and try again.');
  };

  return <div className="mx-auto min-h-screen w-full max-w-7xl space-y-6 bg-[#090d16] p-4 text-slate-100 md:p-6">
    <div className="flex items-center gap-2 text-[11px] text-gray-400 sm:text-sm"><span>Admin</span><ChevronRight className="h-3 w-3 sm:h-4 sm:w-4"/><span className="text-slate-100">Barcode Center</span></div>
    <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center xl:gap-4"><div><h1 className="admin-barcode-title text-[15px] font-bold text-white sm:text-2xl">Barcode Center</h1><p className="admin-barcode-subtitle text-[11px] text-gray-400 sm:text-sm">{loading ? 'Loading barcode records…' : `${barcodes.length} inventory barcode${barcodes.length === 1 ? '' : 's'}`}</p></div><div className="flex flex-wrap items-end gap-2 sm:gap-3">
      <label className="grid gap-1 text-[11px] font-medium text-slate-400"><span>Print layout</span><select value={printLayout} onChange={(event) => setPrintLayout(event.target.value as PrintLayout)} className="min-h-11 cursor-pointer rounded-xl border border-slate-700/60 bg-[#0d1322] px-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><option value="single">Single label — 4.25 × 5.5 in</option><option value="letter4">4 labels on Letter</option></select></label>
      <button onClick={() => printRecords(filteredBarcodes, false)} disabled={loading || filteredBarcodes.length === 0} className="admin-barcode-action flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#0d1322] px-3 text-[12px] font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs"><Printer className="h-[13px] w-[13px] sm:h-4 sm:w-4"/> Print labels</button>
      <button onClick={() => printRecords(filteredBarcodes, true)} disabled={loading || filteredBarcodes.length === 0} className="admin-barcode-action flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"><Download className="h-[13px] w-[13px] sm:h-4 sm:w-4"/> Download PDF</button>
    </div></div>
    <div className="rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-3 md:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"><div className="relative min-w-0 flex-1 sm:min-w-[200px]"><Search className="admin-barcode-search-icon pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4"/><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search product, category or barcode..." aria-label="Search barcodes" className="admin-barcode-search h-10 w-full rounded-xl border border-slate-800 bg-[#0d1322] py-0 pl-9 pr-3 text-xs text-slate-100 placeholder:text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pr-4 sm:text-sm sm:placeholder:text-sm"/></div><div className="ml-auto w-full sm:w-auto sm:min-w-[180px]"><label htmlFor="barcode-category" className="sr-only">Filter by category</label><select id="barcode-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="admin-barcode-category h-9 w-full cursor-pointer appearance-none rounded-xl border border-slate-800 bg-[#0d1322] px-2.5 py-0 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:min-h-11 sm:h-auto sm:px-3 sm:py-2.5 sm:text-sm">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div></div></div>
    {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-8 text-gray-400"><LoaderCircle className="h-5 w-5 animate-spin"/>Loading real inventory barcodes…</div> : <div className="grid grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">{filteredBarcodes.map((item) => <article key={item.id} className="flex flex-col justify-between space-y-3 rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 p-3 shadow-md transition-colors hover:border-slate-700 sm:space-y-4 sm:p-5"><div><h2 className="text-[15px] font-semibold text-white sm:text-sm">{item.productName}</h2><p className="mt-1 text-[12px] text-gray-400 sm:text-xs">{item.category || '—'}{item.warehouse ? ` · ${item.warehouse}` : ''}</p>{item.availableStock !== null && <p className="mt-1 text-[12px] text-gray-400 sm:text-xs">Available stock: {item.availableStock}</p>}</div><div className="flex flex-col items-center justify-center space-y-2 rounded-xl border border-slate-800/90 bg-[#0d1322] p-3 sm:p-4"><div className="w-full overflow-hidden"><BarcodeSVG value={item.barcode}/></div><p className="break-all text-center font-mono text-[11px] tracking-widest text-gray-400 sm:text-xs">{item.barcode}</p></div><div className="grid grid-cols-2 gap-2 sm:gap-3"><button onClick={() => printRecords([item], false)} className="admin-barcode-card-action flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#0d1322] text-[12px] font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:min-h-11 sm:h-auto sm:py-2 sm:text-xs"><Printer className="h-[13px] w-[13px] sm:h-4 sm:w-4"/> Print</button><button onClick={() => printRecords([item], true)} className="admin-barcode-card-action flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#0d1322] text-[12px] font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:min-h-11 sm:h-auto sm:py-2 sm:text-xs"><FileText className="h-[13px] w-[13px] sm:h-4 sm:w-4"/> PDF</button></div></article>)}</div>}
    {!loading && !error && filteredBarcodes.length === 0 && <div className="rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-8 text-center"><Barcode className="mx-auto mb-3 h-12 w-12 text-gray-400"/><p className="text-gray-400">{barcodes.length === 0 ? 'No inventory records with barcodes are available.' : 'No barcodes match the active search and category filter.'}</p></div>}
    {showToast && <div role="status" className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg"><CheckCircle className="h-5 w-5 shrink-0 text-emerald-400"/><span className="text-sm">{toastMessage}</span><button type="button" onClick={() => setShowToast(false)} aria-label="Dismiss notification" className="min-h-11 min-w-11 cursor-pointer text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><X className="mx-auto h-4 w-4"/></button></div>}
  </div>;
};

export default BarcodeCenter;
