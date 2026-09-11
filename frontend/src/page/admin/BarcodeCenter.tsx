import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Barcode, CheckCircle, ChevronRight, Download, FileText, LoaderCircle, Printer, Search, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface InventoryBarcodeApiItem { id: number | string; barcode: string | null; product?: string | null; category?: string | null; warehouse?: string | null; available_stock?: number | null; }
interface BarcodeItem { id: string; productName: string; category: string | null; warehouse: string | null; availableStock: number | null; barcode: string; }
interface BarcodeBars { bars: Array<{ x: number; width: number }>; width: number; }

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
const labelMarkup = (item: BarcodeItem): string => `<article class="label"><h2>${escapeHtml(item.productName)}</h2><div class="barcode">${barcodeSvgMarkup(item.barcode)}</div><p class="number">${escapeHtml(item.barcode)}</p><p class="meta">${escapeHtml(item.category || '—')}${item.warehouse ? ` · ${escapeHtml(item.warehouse)}` : ''}</p></article>`;

const openPrintDocument = (items: BarcodeItem[], title: string, saveAsPdf: boolean): boolean => {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{margin:10mm}*{box-sizing:border-box}body{margin:0;padding:12px;color:#111827;background:#fff;font-family:Arial,sans-serif}.notice{margin:0 0 12px;color:#475569;font-size:12px}.sheet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10mm}.label{min-width:0;break-inside:avoid;border:1px solid #cbd5e1;border-radius:8px;padding:10mm;text-align:center}h2{margin:0 0 8px;font-size:15px;overflow-wrap:anywhere}.barcode{width:100%;height:64px}.barcode svg{display:block;width:100%;height:64px}.number{margin:6px 0 0;font:13px 'Courier New',monospace;letter-spacing:1px;overflow-wrap:anywhere}.meta{margin:6px 0 0;color:#475569;font-size:11px;overflow-wrap:anywhere}.render-error{color:#b91c1c;font-size:11px}@media print{body{padding:0}.notice{display:none}}@media(max-width:600px){.sheet{grid-template-columns:1fr}}
  </style></head><body>${saveAsPdf ? '<p class="notice">Choose “Save as PDF” in the print dialog.</p>' : ''}<main class="sheet">${items.map(labelMarkup).join('')}</main><script>window.onload=()=>{window.focus();window.print();};</script></body></html>`);
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
    const opened = openPrintDocument(items, saveAsPdf ? 'SmartChain Barcode Labels PDF' : 'SmartChain Barcode Labels', saveAsPdf);
    showNotification(opened ? (saveAsPdf ? 'Choose “Save as PDF” in the print dialog.' : `Prepared ${items.length} barcode label${items.length === 1 ? '' : 's'} for printing.`) : 'The print window was blocked. Please allow pop-ups and try again.');
  };

  return <div className="mx-auto min-h-screen w-full max-w-7xl space-y-6 bg-[#090d16] p-4 text-slate-100 md:p-6">
    <div className="flex items-center gap-2 text-sm text-gray-400"><span>Admin</span><ChevronRight className="h-4 w-4"/><span className="text-slate-100">Barcode Center</span></div>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-bold text-white">Barcode Center</h1><p className="text-sm text-gray-400">{loading ? 'Loading barcode records…' : `${barcodes.length} inventory barcode${barcodes.length === 1 ? '' : 's'}`}</p></div><div className="flex items-center gap-3">
      <button onClick={() => printRecords(filteredBarcodes, false)} disabled={loading || filteredBarcodes.length === 0} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700/60 bg-[#0d1322] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4"/> Print sheet</button>
      <button onClick={() => printRecords(filteredBarcodes, true)} disabled={loading || filteredBarcodes.length === 0} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><Download className="h-4 w-4"/> Download PDF</button>
    </div></div>
    <div className="rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-4 md:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search product, category or barcode..." aria-label="Search barcodes" className="w-full rounded-xl border border-slate-800 bg-[#0d1322] py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"/></div><div className="ml-auto w-full sm:w-auto sm:min-w-[180px]"><label htmlFor="barcode-category" className="sr-only">Filter by category</label><select id="barcode-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-800 bg-[#0d1322] px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div></div></div>
    {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-8 text-gray-400"><LoaderCircle className="h-5 w-5 animate-spin"/>Loading real inventory barcodes…</div> : <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{filteredBarcodes.map((item) => <article key={item.id} className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-800/90 bg-[#0f172a]/80 p-5 shadow-md transition-colors hover:border-slate-700"><div><h2 className="text-sm font-semibold text-white">{item.productName}</h2><p className="mt-1 text-xs text-gray-400">{item.category || '—'}{item.warehouse ? ` · ${item.warehouse}` : ''}</p>{item.availableStock !== null && <p className="mt-1 text-xs text-gray-400">Available stock: {item.availableStock}</p>}</div><div className="flex flex-col items-center justify-center space-y-2 rounded-xl border border-slate-800/90 bg-[#0d1322] p-4"><div className="w-full overflow-hidden"><BarcodeSVG value={item.barcode}/></div><p className="break-all text-center font-mono text-xs tracking-widest text-gray-400">{item.barcode}</p></div><div className="grid grid-cols-2 gap-3"><button onClick={() => printRecords([item], false)} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#0d1322] py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><Printer className="h-4 w-4"/> Print</button><button onClick={() => printRecords([item], true)} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#0d1322] py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#18253d] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><FileText className="h-4 w-4"/> PDF</button></div></article>)}</div>}
    {!loading && !error && filteredBarcodes.length === 0 && <div className="rounded-2xl border border-slate-800/80 bg-[#0f172a]/60 p-8 text-center"><Barcode className="mx-auto mb-3 h-12 w-12 text-gray-400"/><p className="text-gray-400">{barcodes.length === 0 ? 'No inventory records with barcodes are available.' : 'No barcodes match the active search and category filter.'}</p></div>}
    {showToast && <div role="status" className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg"><CheckCircle className="h-5 w-5 shrink-0 text-emerald-400"/><span className="text-sm">{toastMessage}</span><button type="button" onClick={() => setShowToast(false)} aria-label="Dismiss notification" className="min-h-11 min-w-11 cursor-pointer text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><X className="mx-auto h-4 w-4"/></button></div>}
  </div>;
};

export default BarcodeCenter;
