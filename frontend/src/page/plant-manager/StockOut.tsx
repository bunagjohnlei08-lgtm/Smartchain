import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Package,
  PackageCheck,
  PackageMinus,
  RefreshCw,
  ScanLine,
  Search,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

type StockOutStatus = 'Ready for Stock Out' | 'Stock Out In Progress' | 'Ready for Shipment';

interface StockOutOrder {
  id: string;
  orderNo: string;
  customer: string;
  destination: string;
  warehouse: string;
  orderDate: string;
  requiredDelivery: string;
  assignedDate: string;
  products: string[];
  productsCount: number;
  totalUnits: number;
  orderValue: number;
  status: StockOutStatus;
  preparedBy?: string;
  items?: StockOutItem[];
  history?: HistoryEvent[];
}

interface StockOutItem {
  id: string;
  barcode: string | null;
  product: string;
  orderedQty: number;
  releasedQty: number;
  remainingQty: number;
  availableQty: number;
  unit: string;
  batchLot: string | null;
  expiryDate: string | null;
  location: string | null;
  status: 'Pending' | 'Partial' | 'Completed';
}

interface HistoryEvent {
  id: string;
  action: string;
  barcode: string | null;
  quantity: number | null;
  performedBy: string | null;
  createdAt: string;
}

interface Summary {
  ordersReady: number;
  pickingToday: number;
  readyForShipment: number;
  waitingLogistics: number;
  releasedToday: number;
  itemsReleased: number;
  valueReleased: number;
}

const statusLabels: Record<string, StockOutStatus> = {
  READY_FOR_STOCK_OUT: 'Ready for Stock Out',
  STOCK_OUT_IN_PROGRESS: 'Stock Out In Progress',
  READY_FOR_SHIPMENT: 'Ready for Shipment',
};

const formatDate = (value?: string | null, withTime = false) => value
  ? new Intl.DateTimeFormat('en-PH', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
  : '—';

const mapOrder = (order: any): StockOutOrder => ({
  id: String(order.id),
  orderNo: order.order_no,
  customer: order.customer_name,
  destination: order.customer_address || '—',
  warehouse: order.warehouse?.name || 'Unassigned',
  orderDate: formatDate(order.order_date),
  requiredDelivery: formatDate(order.required_delivery_date),
  assignedDate: formatDate(order.assigned_at || order.history?.find((event: any) => ['ORDER_ASSIGNED', 'ORDER_REASSIGNED'].includes(event.action))?.created_at),
  products: (order.items || []).map((item: any) => item.product_name).filter(Boolean),
  productsCount: Number(order.products_count || 0),
  totalUnits: Number(order.total_units || 0),
  orderValue: Number(order.total_amount || 0),
  status: statusLabels[order.status],
  preparedBy: order.prepared_by || undefined,
  items: order.items?.map((item: any) => ({
    id: String(item.id),
    barcode: item.barcode,
    product: item.product_name,
    orderedQty: Number(item.ordered_quantity),
    releasedQty: Number(item.released_quantity),
    remainingQty: Number(item.remaining_quantity),
    availableQty: Number(item.available_quantity),
    unit: item.unit,
    batchLot: item.batch_lot,
    expiryDate: item.expiry_date,
    location: item.location,
    status: `${item.status.slice(0, 1)}${item.status.slice(1).toLowerCase()}`,
  })),
  history: order.history?.map((event: any) => ({
    id: event.id,
    action: event.action,
    barcode: event.barcode,
    quantity: event.quantity,
    performedBy: event.performed_by,
    createdAt: event.created_at,
  })),
});

const getError = (error: any) => {
  const errors = error?.response?.data?.errors;
  if (Array.isArray(errors)) return errors.map(item => item.reason || String(item)).join(' ');
  if (errors) return Object.values(errors).flat()[0] as string;
  return error?.response?.data?.message || 'The request could not be completed. Please try again.';
};

const StatusBadge = ({ status }: { status: StockOutStatus }) => {
  const color = status === 'Ready for Stock Out'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : status === 'Stock Out In Progress'
      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}>{status}</span>;
};

const ItemStatusBadge = ({ status }: { status: StockOutItem['status'] }) => {
  const color = status === 'Completed' ? 'text-emerald-400' : status === 'Partial' ? 'text-amber-400' : 'text-slate-400';
  return <span className={`text-xs font-medium ${color}`}>{status}</span>;
};

const StockOut: React.FC = () => {
  const [orders, setOrders] = useState<StockOutOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({ ordersReady: 0, pickingToday: 0, readyForShipment: 0, waitingLogistics: 0, releasedToday: 0, itemsReleased: 0, valueReleased: 0 });
  const [selectedOrder, setSelectedOrder] = useState<StockOutOrder | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanSuccess, setScanSuccess] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanBusyRef = useRef(false);
  const lastDetectionRef = useRef({ value: '', at: 0 });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const [ordersResponse, summaryResponse] = await Promise.all([
        apiClient.get('/stock-out/orders', { params: { search: search || undefined, status: status || undefined, per_page: 100 } }),
        apiClient.get('/stock-out/summary'),
      ]);
      const listOrders = ordersResponse.data.data as any[];
      const detailedOrders = await Promise.all(listOrders.map(async order => {
        try {
          const detail = await apiClient.get(`/stock-out/orders/${order.id}`);
          return mapOrder(detail.data);
        } catch {
          return mapOrder(order);
        }
      }));
      setOrders(detailedOrders);
      setSummary({
        ordersReady: Number(summaryResponse.data.orders_ready),
        pickingToday: Number(summaryResponse.data.picking_today),
        readyForShipment: Number(summaryResponse.data.ready_for_shipment),
        waitingLogistics: Number(summaryResponse.data.waiting_logistics),
        releasedToday: Number(summaryResponse.data.released_today),
        itemsReleased: Number(summaryResponse.data.items_released),
        valueReleased: Number(summaryResponse.data.value_released),
      });
    } catch (error) {
      setPageError(getError(error));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const loadDetails = useCallback(async (orderId: string) => {
    const response = await apiClient.get(`/stock-out/orders/${orderId}`);
    const order = mapOrder(response.data);
    setSelectedOrder(order);
    return order;
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const stopCamera = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const closeScanner = useCallback(() => {
    stopCamera();
    setScannerOpen(false);
    setScannerError('');
    setScanSuccess('');
  }, [stopCamera]);

  const processScan = useCallback(async (barcode: string) => {
    if (!selectedOrder || scanBusyRef.current) return;
    scanBusyRef.current = true;
    setActionBusy(true);
    setScannerError('');
    try {
      const response = await apiClient.post(`/stock-out/orders/${selectedOrder.id}/release`, {
        barcode: barcode.trim(),
      });
      setScanSuccess(response.data.message || 'One unit stocked out successfully.');
      setManualBarcode('');

      // The backend flips the order to READY_FOR_SHIPMENT as soon as every item is
      // released, which removes it from the Stock Out queue. Drop the selection instead
      // of re-fetching a detail the queue no longer serves.
      if (response.data?.order_status === 'READY_FOR_SHIPMENT') {
        stopCamera();
        setScannerOpen(false);
        setSelectedOrder(null);
        setCompletionNotice(`${selectedOrder.orderNo} is fully released and moved to Ready for Shipment.`);
        await loadOrders();
        return;
      }

      await loadDetails(selectedOrder.id);
      await loadOrders();
    } catch (error) {
      setScannerError(getError(error));
    } finally {
      scanBusyRef.current = false;
      setActionBusy(false);
    }
  }, [loadDetails, loadOrders, selectedOrder, stopCamera]);

  const startCamera = async () => {
    stopCamera();
    setScannerOpen(true);
    setScannerError('');
    setScanSuccess('');
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!videoRef.current) {
        throw new Error('The scanner preview could not be opened. Please use manual barcode entry.');
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera is available in this browser. Please use manual barcode entry.');

      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 1000 });
      scannerControlsRef.current = await reader.decodeFromConstraints({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      }, videoRef.current, (result) => {
        const value = result?.getText().trim();
        const now = Date.now();
        if (!value || scanBusyRef.current || (lastDetectionRef.current.value === value && now - lastDetectionRef.current.at <= 2500)) return;
        lastDetectionRef.current = { value, at: now };
        stopCamera();
        void processScan(value);
      });
      setCameraActive(true);
    } catch (error: any) {
      stopCamera();
      setScannerError(error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Please use manual barcode entry.'
        : error?.message || 'The camera could not be started. Please use manual barcode entry.');
    }
  };

  const openDetails = async (order: StockOutOrder) => {
    setPageError('');
    try {
      await loadDetails(order.id);
    } catch (error) {
      setPageError(getError(error));
    }
  };

  const progress = useMemo(() => {
    const items = selectedOrder?.items || [];
    const ordered = items.reduce((sum, item) => sum + item.orderedQty, 0);
    const released = items.reduce((sum, item) => sum + item.releasedQty, 0);
    return { ordered, released, percentage: ordered ? Math.min(100, released / ordered * 100) : 0 };
  }, [selectedOrder]);

  const cards = [
    { label: 'Orders Ready', value: summary.ordersReady, icon: Package, color: 'text-amber-400' },
    { label: 'Picking Today', value: summary.pickingToday, icon: Clock, color: 'text-cyan-400' },
    { label: 'Ready for Shipment', value: summary.readyForShipment, icon: PackageCheck, color: 'text-emerald-400' },
    { label: 'Released Today', value: summary.releasedToday, icon: PackageCheck, color: 'text-green-400' },
    { label: 'Items Released', value: summary.itemsReleased, icon: PackageMinus, color: 'text-violet-400' },
    { label: 'Value Released', value: `₱${summary.valueReleased.toLocaleString()}`, icon: CheckCircle2, color: 'text-blue-400' },
  ];

  return (
    <div className="min-h-screen w-full space-y-6 overflow-x-hidden bg-[#070a12] p-4 text-slate-100 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Stock Out & Inventory Release</h1>
          <p className="mt-1 text-sm text-slate-400">Validate prepared orders by barcode and release inventory from your assigned warehouse.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void loadOrders()} disabled={loading} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => void startCamera()} disabled={!selectedOrder || selectedOrder.status === 'Ready for Shipment'} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
            <ScanLine className="h-4 w-4" /> Scan Barcode
          </button>
        </div>
      </header>

      {pageError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{pageError}</div>}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(card => <div key={card.label} className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-4">
          <div className="flex items-center gap-2"><card.icon className={`h-5 w-5 ${card.color}`} /><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{card.label}</span></div>
          <p className="mt-3 text-2xl font-bold text-white">{card.value}</p>
        </div>)}
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search Stock Out orders</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, customer, product, or barcode..." className="min-h-11 w-full rounded-xl border border-slate-800 bg-[#070a12] py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
          </label>
          <label>
            <span className="sr-only">Filter by Stock Out status</span>
            <select value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-slate-800 bg-[#070a12] px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
              <option value="">All Stock Out Statuses</option>
              <option value="READY_FOR_STOCK_OUT">Ready for Stock Out</option>
              <option value="STOCK_OUT_IN_PROGRESS">Stock Out In Progress</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b101d]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-800 bg-[#070a12] text-xs uppercase tracking-wider text-slate-400">
              <tr>
                {['Order No.', 'Customer / Destination', 'Products', 'Items', 'Assigned Date', 'Target Delivery', 'Status'].map(label => <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>)}
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {orders.map(order => <tr key={order.id} onClick={() => void openDetails(order)} className={`cursor-pointer transition-colors hover:bg-slate-800/30 ${selectedOrder?.id === order.id ? 'bg-cyan-500/5' : ''}`}>
                <td className="px-4 py-3 font-mono font-medium text-white">{order.orderNo}</td>
                <td className="px-4 py-3"><p className="text-slate-200">{order.customer}</p><p className="max-w-[150px] truncate text-xs text-slate-400">{order.destination}</p></td>
                <td className="max-w-56 px-4 py-3"><p className="truncate text-slate-200" title={order.products[0]}>{order.products[0] || 'No products'}</p>{order.products.length > 1 && <p className="text-xs text-slate-500">+ {order.products.length - 1} more</p>}</td>
                <td className="px-4 py-3 text-slate-300">{order.productsCount} items</td>
                <td className="px-4 py-3 text-slate-300">{order.assignedDate}</td>
                <td className="px-4 py-3 text-slate-300">{order.requiredDelivery}</td>
                <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                <td className="px-3 py-3"><button aria-label={`View ${order.orderNo}`} onClick={event => { event.stopPropagation(); void openDetails(order); }} className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><Eye className="mx-auto h-4 w-4" /></button></td>
              </tr>)}
              {!loading && orders.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No eligible Stock Out orders found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOrder && <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-5 rounded-xl border border-slate-800/80 bg-[#0b101d] p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-white">{selectedOrder.orderNo}</h2><StatusBadge status={selectedOrder.status} /></div><p className="mt-1 text-sm text-slate-400">{selectedOrder.customer} · {selectedOrder.warehouse}</p></div>
            <button onClick={() => void startCamera()} disabled={actionBusy} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"><ScanLine className="h-4 w-4" /> Scan Barcode</button>
          </div>
          <div><div className="flex justify-between text-sm"><span className="text-slate-400">Release progress</span><span className="font-medium text-white">{progress.released} / {progress.ordered} units</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${progress.percentage}%` }} /></div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-xs">
              <thead className="border-b border-slate-800 bg-[#070a12] text-slate-400"><tr>{['Barcode', 'Product', 'Ordered Qty', 'Released Qty', 'Remaining Qty', 'Unit', 'Batch / Lot', 'Expiry', 'Location', 'Status'].map(label => <th key={label} className="px-3 py-2 text-left font-medium">{label}</th>)}</tr></thead>
              <tbody>{selectedOrder.items?.map(item => <tr key={item.id} className="border-b border-slate-800/60">
                <td className="px-3 py-3 font-mono text-slate-300">{item.barcode || '—'}</td><td className="px-3 py-3 text-slate-200">{item.product}</td><td className="px-3 py-3 text-white">{item.orderedQty}</td><td className="px-3 py-3 text-white">{item.releasedQty}</td><td className="px-3 py-3 text-white">{item.remainingQty}</td><td className="px-3 py-3 text-slate-300">{item.unit}</td><td className="px-3 py-3 text-slate-400">{item.batchLot || '—'}</td><td className="px-3 py-3 text-slate-400">{item.expiryDate || '—'}</td><td className="px-3 py-3 text-slate-400">{item.location || '—'}</td><td className="px-3 py-3"><ItemStatusBadge status={item.status} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock className="h-4 w-4 text-cyan-400" /> Stock Out History</h2>
          <div className="mt-4 max-h-[460px] space-y-4 overflow-y-auto pr-1">
            {selectedOrder.history?.map(event => <div key={event.id} className="border-l-2 border-cyan-500/40 pl-3">
              <p className="text-sm font-medium text-slate-200">{event.action.replaceAll('_', ' ')}</p>
              {event.barcode && <p className="text-xs text-slate-400">Barcode: {event.barcode} · Quantity: {event.quantity}</p>}
              <p className="text-xs text-slate-500">{event.performedBy || 'System'} · {formatDate(event.createdAt, true)}</p>
            </div>)}
            {!selectedOrder.history?.length && <p className="text-sm text-slate-400">No Stock Out events recorded yet.</p>}
          </div>
        </aside>
      </section>}

      {scannerOpen && selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b101d] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id="scanner-title" className="text-lg font-semibold text-white">Scan Inventory Barcode</h2><p className="mt-1 text-sm text-slate-400">{selectedOrder.orderNo} · releases are validated against this order and warehouse.</p></div><button onClick={closeScanner} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="h-5 w-5" /> Close Scanner</button></div>

          <div className="relative mt-5 aspect-video overflow-hidden rounded-xl border border-slate-700 bg-black">
            <video ref={videoRef} muted playsInline autoPlay aria-label="Barcode scanner camera preview" className="h-full w-full object-cover" />
            {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400"><Camera className="h-10 w-10" /><p className="text-sm">Camera is not active</p><button onClick={() => void startCamera()} className="min-h-11 cursor-pointer rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-500">Start Camera</button></div>}
            {cameraActive && <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-cyan-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />}
          </div>

          {scannerError && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{scannerError}</div>}
          {scanSuccess && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 className="h-5 w-5" /> {scanSuccess}</p></div>}

          <form onSubmit={event => { event.preventDefault(); void processScan(manualBarcode); }} className="mt-5 rounded-xl border border-slate-800 bg-[#070a12] p-4">
            <h3 className="text-sm font-semibold text-white">Enter Barcode Manually</h3><p className="mt-1 text-xs text-slate-400">Camera and manual entry use the same backend barcode validation.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="text-sm text-slate-300">Barcode<input value={manualBarcode} onChange={event => setManualBarcode(event.target.value)} required maxLength={100} autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-[#0b101d] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
              <button type="submit" disabled={actionBusy || !manualBarcode.trim()} className="min-h-11 cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">{actionBusy ? 'Working…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </div>}
    </div>
  );
};

export default StockOut;
