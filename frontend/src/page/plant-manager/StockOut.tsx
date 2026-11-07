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
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { usePlantManagerDetailOverlay } from '../../components/layout/PlantManagerDetailOverlayContext';
import { stockOutProgressByUnit } from './stockOutProgress';
import { BrowserCodeReader, type IScannerControls } from '@zxing/browser';
import { ChecksumException, Code128Reader, DecodeHintType, FormatException, NotFoundException, type BinaryBitmap, type Result } from '@zxing/library';

type StockOutStatus = 'Ready for Stock Out' | 'Stock Out In Progress' | 'For Packing';

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
  forPacking: number;
  waitingLogistics: number;
  releasedToday: number;
  itemsReleased: number;
  valueReleased: number;
}

interface RecentScan {
  barcode: string;
  product: string | null;
  message: string;
  succeeded: boolean;
}

interface ScanToast {
  message: string;
  type: 'success' | 'error';
}

const SCAN_COOLDOWN_MS = 1500;

const statusLabels: Record<string, StockOutStatus> = {
  READY_FOR_STOCK_OUT: 'Ready for Stock Out',
  STOCK_OUT_IN_PROGRESS: 'Stock Out In Progress',
  FOR_PACKING: 'For Packing',
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

const getScanError = (error: any): string => {
  const status = Number(error?.response?.status || 0);
  const message = getError(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('not included in this order')) return 'This barcode is not part of this order.';
  if (normalized.includes('assigned warehouse') || normalized.includes('does not belong')) return 'This barcode belongs to a different warehouse.';
  if (normalized.includes('fully released') || normalized.includes('exceeds remaining')) return 'The required quantity for this item is already completed.';
  if (normalized.includes('barcode not found')) return 'Unknown barcode. No matching inventory item was found.';
  if (status === 404 || normalized.includes('already been completed') || normalized.includes('not ready')) return 'This order is no longer in a valid Stock Out state.';
  return message;
};

const StatusBadge = ({ status, compact = false }: { status: StockOutStatus; compact?: boolean }) => {
  const color = status === 'Ready for Stock Out'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : status === 'Stock Out In Progress'
      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  return <span className={`pm-stock-out-status-badge plant-manager-badge inline-flex min-h-[26px] items-center rounded-full border px-2 text-[10px] font-medium leading-3 sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-xs sm:leading-normal ${compact ? 'max-w-full justify-center text-center whitespace-normal sm:whitespace-nowrap' : 'whitespace-nowrap'} ${color}`}>{status}</span>;
};

const ItemStatusBadge = ({ status }: { status: StockOutItem['status'] }) => {
  const color = status === 'Completed' ? 'text-emerald-400' : status === 'Partial' ? 'text-amber-400' : 'text-slate-400';
  return <span className={`text-xs font-medium ${color}`}>{status}</span>;
};

const getCameraErrorName = (error: unknown) => error instanceof DOMException
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String(error.name)
      : '';

const getCameraErrorMessage = (error: unknown) => {
  switch (getCameraErrorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser settings.';
    case 'NotFoundError':
      return 'No camera was detected on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is unavailable or currently being used by another application.';
    case 'OverconstrainedError':
      return 'The requested camera is unavailable. No compatible camera could be started.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'The camera could not be started. Please use manual barcode entry.';
  }
};

// Inventory barcodes are rendered as Code 128 (admin/Inventory.tsx encodeCode128B). A 13-digit
// value is 178 modules wide, so decode only that symbology and try harder (scan many more rows per frame).
const CODE_128_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

// TRY_HARDER also attempts a rotated pass, which @zxing/browser 0.2.1 cannot perform
// (HTMLCanvasElementLuminanceSource.rotate throws a plain Error). The scan loop stops for
// good on anything but NotFound/Checksum/Format, so report such frames as "not found".
class Code128FrameReader extends Code128Reader {
  decode(image: BinaryBitmap, hints?: Map<DecodeHintType, unknown>): Result {
    try {
      return super.decode(image, hints);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) throw error;
      throw new NotFoundException();
    }
  }
}

const StockOut: React.FC = () => {
  const [orders, setOrders] = useState<StockOutOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({ ordersReady: 0, pickingToday: 0, forPacking: 0, waitingLogistics: 0, releasedToday: 0, itemsReleased: 0, valueReleased: 0 });
  const [selectedOrder, setSelectedOrder] = useState<StockOutOrder | null>(null);
  const [detailTarget, setDetailTarget] = useState<StockOutOrder | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualQuantity, setManualQuantity] = useState('1');
  const [scanSuccess, setScanSuccess] = useState('');
  const [scanCooldown, setScanCooldown] = useState(false);
  const [scannerFlash, setScannerFlash] = useState<'success' | 'error' | null>(null);
  const [recentScan, setRecentScan] = useState<RecentScan | null>(null);
  const [scanToast, setScanToast] = useState<ScanToast | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('stock-out-scanner-sound') !== 'off');
  const [, setCompletionNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanBusyRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const cooldownTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const selectedOrderRef = useRef<StockOutOrder | null>(null);
  const detailsRequestRef = useRef(0);
  const cameraSessionRef = useRef(0);
  const detailsDialogRef = useRef<HTMLDivElement>(null);
  const scannerDialogRef = useRef<HTMLDivElement>(null);
  const detailsCloseRef = useRef<HTMLButtonElement>(null);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const modalActionsRef = useRef({ scannerOpen: false, closeDetails: () => {}, closeScanner: () => {} });
  const detailsOpen = detailTarget !== null;
  usePlantManagerDetailOverlay(detailsOpen);
  const lastDetectionRef = useRef({ value: '', at: 0 });

  useEffect(() => { selectedOrderRef.current = selectedOrder; }, [selectedOrder]);
  useEffect(() => { localStorage.setItem('stock-out-scanner-sound', soundEnabled ? 'on' : 'off'); }, [soundEnabled]);

  const playTone = useCallback((type: 'success' | 'error') => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type === 'success' ? 'sine' : 'square';
      oscillator.frequency.value = type === 'success' ? 880 : 220;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (type === 'success' ? 0.12 : 0.18));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (type === 'success' ? 0.13 : 0.19));
      oscillator.addEventListener('ended', () => void context.close(), { once: true });
    } catch {
      // Visual feedback remains available when browser audio is blocked.
    }
  }, [soundEnabled]);

  const showScanFeedback = useCallback((type: 'success' | 'error', message: string, barcode: string, product: string | null = null) => {
    setScannerFlash(type);
    setRecentScan({ barcode, product, message, succeeded: type === 'success' });
    setScanToast({ type, message });
    playTone(type);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setScannerFlash(null), 450);
    toastTimerRef.current = window.setTimeout(() => setScanToast(null), 3500);
  }, [playTone]);

  const beginScanCooldown = useCallback((barcode: string) => {
    const now = Date.now();
    cooldownUntilRef.current = now + SCAN_COOLDOWN_MS;
    lastDetectionRef.current = { value: barcode, at: now };
    setScanCooldown(true);
    if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setTimeout(() => setScanCooldown(false), SCAN_COOLDOWN_MS);
  }, []);

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
        forPacking: Number(summaryResponse.data.for_packing),
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
    const request = ++detailsRequestRef.current;
    const response = await apiClient.get(`/stock-out/orders/${orderId}`);
    const order = mapOrder(response.data);
    if (request !== detailsRequestRef.current) return order;
    selectedOrderRef.current = order;
    setSelectedOrder(order);
    return order;
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const stopCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => {
    stopCamera();
    detailsRequestRef.current += 1;
    if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, [stopCamera]);

  const closeScanner = useCallback(() => {
    if (scanBusyRef.current) return;
    stopCamera();
    setScannerOpen(false);
    setScannerError('');
    setScanSuccess('');
  }, [stopCamera]);

  const closeDetails = useCallback(() => {
    if (scanBusyRef.current) return;
    if (manualBarcode.trim() && !window.confirm('Discard the unsubmitted barcode entry and close Stock Out Details?')) return;
    closeScanner();
    detailsRequestRef.current += 1;
    setDetailTarget(null);
    setSelectedOrder(null);
    selectedOrderRef.current = null;
    setDetailsError('');
    setManualBarcode('');
    setManualQuantity('1');
    setRecentScan(null);
  }, [closeScanner, manualBarcode]);

  useEffect(() => { modalActionsRef.current = { scannerOpen, closeDetails, closeScanner }; }, [scannerOpen, closeDetails, closeScanner]);
  useEffect(() => {
    if (!detailsOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    detailsCloseRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (modalActionsRef.current.scannerOpen) modalActionsRef.current.closeScanner();
        else modalActionsRef.current.closeDetails();
      }
      if (event.key !== 'Tab') return;
      const scope = modalActionsRef.current.scannerOpen ? scannerDialogRef.current : detailsDialogRef.current;
      const controls = scope?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]');
      if (!controls?.length) { event.preventDefault(); scope?.focus(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (detailsTriggerRef.current?.isConnected) detailsTriggerRef.current.focus();
      else document.getElementById('stock-out-page-heading')?.focus();
    };
  }, [detailsOpen]);
  useEffect(() => {
    if (!scannerOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    scannerDialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, [scannerOpen]);

  const processScan = useCallback(async (barcode: string, quantity = 1, resetManualEntry = false) => {
    const order = selectedOrderRef.current;
    const normalizedBarcode = barcode.trim();
    if (!order || scanBusyRef.current || Date.now() < cooldownUntilRef.current || !normalizedBarcode) return;
    const completedItem = order.items?.find(item => item.barcode === normalizedBarcode && item.remainingQty <= 0);
    if (completedItem) {
      const message = `${completedItem.product} is already complete (${completedItem.releasedQty} / ${completedItem.orderedQty}).`;
      beginScanCooldown(normalizedBarcode);
      setScannerError(message);
      setScanSuccess('');
      showScanFeedback('error', message, normalizedBarcode, completedItem.product);
      return;
    }
    scanBusyRef.current = true;
    beginScanCooldown(normalizedBarcode);
    setActionBusy(true);
    setScannerError('');
    setScanSuccess('');
    try {
      const response = await apiClient.post(`/stock-out/orders/${order.id}/release`, {
        barcode: normalizedBarcode,
        quantity,
      });
      const product = response.data.product || 'Inventory item';
      const released = Number(response.data.released_quantity ?? response.data.quantity_released ?? quantity);
      const required = Number(response.data.ordered_quantity ?? 0);
      const releasedNow = Number(response.data.quantity_released ?? quantity);
      const message = `${product}: ${releasedNow} ${releasedNow === 1 ? 'unit' : 'units'} released (${released} / ${required}).`;
      setScanSuccess(message);
      showScanFeedback('success', message, normalizedBarcode, product);
      if (resetManualEntry) {
        setManualBarcode('');
        setManualQuantity('1');
      }

      // The backend flips the order to FOR_PACKING as soon as every item is released,
      // which moves it to the Shipment queue. Drop the selection instead of re-fetching
      // a detail the Stock Out queue no longer serves.
      if (response.data?.order_status === 'FOR_PACKING') {
        stopCamera();
        setScannerOpen(false);
        selectedOrderRef.current = null;
        setSelectedOrder(null);
        setDetailTarget(null);
        detailsRequestRef.current += 1;
        setManualBarcode('');
        setManualQuantity('1');
        setCompletionNotice(`${order.orderNo} is fully released and moved to Shipment for packing.`);
        await loadOrders();
        return;
      }

      await loadDetails(order.id);
      await loadOrders();
    } catch (error) {
      const message = getScanError(error);
      setScannerError(message);
      showScanFeedback('error', message, normalizedBarcode);
    } finally {
      scanBusyRef.current = false;
      setActionBusy(false);
    }
  }, [beginScanCooldown, loadDetails, loadOrders, showScanFeedback, stopCamera]);

  const startCamera = async () => {
    if (!selectedOrderRef.current || scanBusyRef.current) return;
    stopCamera();
    let session = cameraSessionRef.current;
    setScannerOpen(true);
    setScannerError('');
    setScanSuccess('');
    setRecentScan(null);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (session !== cameraSessionRef.current) return;
      if (!videoRef.current) {
        throw new Error('The scanner preview could not be opened. Please use manual barcode entry.');
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera is available in this browser. Please use manual barcode entry.');

      const handleResult = (result: { getText: () => string } | undefined) => {
        const value = result ? String(result.getText()).trim() : '';
        const now = Date.now();
        if (session !== cameraSessionRef.current || !value || scanBusyRef.current || now < cooldownUntilRef.current) return;
        if (lastDetectionRef.current.value === value && now - lastDetectionRef.current.at < SCAN_COOLDOWN_MS) return;
        if (import.meta.env.DEV) console.debug('[scanner] decoded CODE_128:', value);
        void processScan(value, 1);
      };
      const startDecoder = (constraints: MediaStreamConstraints) => {
        const reader = new BrowserCodeReader(new Code128FrameReader(), CODE_128_HINTS, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 1000 });
        return reader.decodeFromConstraints(constraints, videoRef.current!, handleResult);
      };

      let controls: IScannerControls;
      try {
        controls = await startDecoder({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (preferredCameraError: unknown) {
        if (session !== cameraSessionRef.current) return;
        if (!['NotFoundError', 'OverconstrainedError'].includes(getCameraErrorName(preferredCameraError))) throw preferredCameraError;
        stopCamera();
        session = cameraSessionRef.current;
        controls = await startDecoder({ audio: false, video: true });
      }
      if (session !== cameraSessionRef.current) { controls.stop(); return; }
      scannerControlsRef.current = controls;
      setCameraActive(true);

      const stream = videoRef.current?.srcObject;
      const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined;
      if (import.meta.env.DEV) console.debug('[scanner] decoder started', `${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`, track?.getSettings());
      const focusModes = (track?.getCapabilities?.() as { focusMode?: string[] } | undefined)?.focusMode;
      if (track && focusModes?.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
    } catch (error: unknown) {
      if (session !== cameraSessionRef.current) return;
      stopCamera();
      setScannerError(getCameraErrorMessage(error));
    }
  };

  const openDetails = async (order: StockOutOrder, trigger?: HTMLElement) => {
    if (scanBusyRef.current) return;
    if (trigger) detailsTriggerRef.current = trigger;
    setDetailTarget(order);
    setSelectedOrder(null);
    selectedOrderRef.current = null;
    setDetailsLoading(true);
    setDetailsError('');
    const request = detailsRequestRef.current + 1;
    try { await loadDetails(order.id); }
    catch (error) { if (request === detailsRequestRef.current) setDetailsError(getError(error)); }
    finally { if (request === detailsRequestRef.current) setDetailsLoading(false); }
  };

  const progress = useMemo(() => stockOutProgressByUnit(selectedOrder?.items ?? []), [selectedOrder]);

  const cards = [
    { label: 'Orders Ready', value: summary.ordersReady, icon: Package, color: 'text-amber-400' },
    { label: 'Picking Today', value: summary.pickingToday, icon: Clock, color: 'text-cyan-400' },
    { label: 'For Packing', value: summary.forPacking, icon: PackageCheck, color: 'text-emerald-400' },
    { label: 'Released Today', value: summary.releasedToday, icon: PackageCheck, color: 'text-green-400' },
    { label: 'Items Released', value: summary.itemsReleased, icon: PackageMinus, color: 'text-violet-400' },
    { label: 'Value Released', value: `₱${summary.valueReleased.toLocaleString()}`, icon: CheckCircle2, color: 'text-blue-400' },
  ];

  return (
    <div className="min-h-screen w-full space-y-6 overflow-x-hidden bg-[#070a12] p-4 text-slate-100 sm:p-6 lg:p-8">
      <div inert={detailsOpen} aria-hidden={detailsOpen || undefined} className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 id="stock-out-page-heading" tabIndex={-1} className="text-2xl font-bold tracking-tight text-white">Stock Out & Inventory Release</h1>
          <p className="mt-1 text-sm text-slate-400">Validate prepared orders by barcode and release inventory from your assigned warehouse.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void loadOrders()} disabled={loading} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {pageError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{pageError}</div>}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map(card => <div key={card.label} className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-3 sm:p-4">
          <div className="flex items-center gap-2"><card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${card.color}`} /><span className="pm-stock-out-kpi-title mobile-kpi-title text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">{card.label}</span></div>
          <p className="mobile-kpi-value mt-3 text-2xl font-bold text-white">{card.value}</p>
        </div>)}
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search Stock Out orders</span>
            <Search className="pm-stock-out-search-icon pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-slate-500 sm:h-4 sm:w-4" aria-hidden="true" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, customer, product, or barcode..." className="pm-stock-out-search h-10 w-full rounded-xl border border-slate-800 bg-[#070a12] py-0 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:min-h-11 sm:py-2 sm:pr-4 sm:text-sm" />
          </label>
          <label className="w-full sm:w-auto">
            <span className="sr-only">Filter by Stock Out status</span>
            <select value={status} onChange={event => setStatus(event.target.value)} className="pm-stock-out-status-filter h-9 w-full cursor-pointer rounded-xl border border-slate-800 bg-[#070a12] px-2.5 py-0 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:min-h-11 sm:w-auto sm:px-3 sm:py-2 sm:text-sm">
              <option value="">All Stock Out Statuses</option>
              <option value="READY_FOR_STOCK_OUT">Ready for Stock Out</option>
              <option value="STOCK_OUT_IN_PROGRESS">Stock Out In Progress</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b101d]">
        <div className="pm-table-scroll">
          <table className="pm-stock-out-table pm-responsive-table pm-cols-8 pm-sticky-1 w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-800 bg-[#070a12] text-xs uppercase tracking-wider text-slate-400">
              <tr>
                {['Order No.', 'Customer / Destination', 'Products', 'Items', 'Assigned Date', 'Target Delivery', 'Status'].map(label => <th key={label} className={`${label === 'Status' ? 'w-28 px-1 sm:w-auto sm:px-4' : 'px-4'} py-3 text-left font-medium`}>{label}</th>)}
                <th className="w-16 px-1 py-3 text-center font-medium sm:w-auto sm:px-4 sm:text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {orders.map(order => <tr key={order.id} onClick={event => void openDetails(order, event.currentTarget.querySelector<HTMLButtonElement>('button') ?? undefined)} className={`cursor-pointer transition-colors hover:bg-slate-800/30 ${selectedOrder?.id === order.id ? 'bg-cyan-500/5' : ''}`}>
                <td className="px-4 py-3 font-mono font-medium text-white">{order.orderNo}</td>
                <td className="px-4 py-3"><p className="text-slate-200">{order.customer}</p><p className="max-w-[150px] truncate text-xs text-slate-400">{order.destination}</p></td>
                <td className="max-w-56 px-4 py-3"><p className="truncate text-slate-200" title={order.products[0]}>{order.products[0] || 'No products'}</p>{order.products.length > 1 && <p className="text-xs text-slate-500">+ {order.products.length - 1} more</p>}</td>
                <td className="px-4 py-3 text-slate-300">{order.productsCount} items</td>
                <td className="px-4 py-3 text-slate-300">{order.assignedDate}</td>
                <td className="px-4 py-3 text-slate-300">{order.requiredDelivery}</td>
                <td className="w-28 px-1 py-3 sm:w-auto sm:px-4"><StatusBadge status={order.status} compact /></td>
                <td className="w-16 px-1 py-3 text-center sm:w-auto sm:px-3"><button aria-label={`View ${order.orderNo}`} onClick={event => { event.stopPropagation(); void openDetails(order, event.currentTarget); }} className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><Eye className="mx-auto h-[13px] w-[13px] sm:h-4 sm:w-4" /></button></td>
              </tr>)}
              {!loading && orders.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No eligible Stock Out orders found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      </div>
      {detailTarget && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/75 p-2 sm:p-5" onClick={event => { if (event.target === event.currentTarget) closeDetails(); }}>
        <div ref={detailsDialogRef} role="dialog" aria-modal={!scannerOpen} aria-hidden={scannerOpen || undefined} inert={scannerOpen} aria-labelledby="stock-out-details-title" tabIndex={-1} className="flex max-h-[94dvh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#0b101d] dark:text-slate-100">
          <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#0b101d] sm:px-5">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="stock-out-details-title" className="break-words text-lg font-semibold">Stock Out Details — {selectedOrder?.orderNo ?? detailTarget.orderNo}</h2>{selectedOrder && <StatusBadge status={selectedOrder.status} compact />}</div><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Current release information for the selected order.</p></div>
            <button ref={detailsCloseRef} type="button" onClick={closeDetails} disabled={actionBusy} aria-label="Close Stock Out Details" title={actionBusy ? 'Wait for the current scan to finish.' : 'Close Stock Out Details'} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-wait disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
          </header>
          <div aria-busy={detailsLoading} className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">
            {detailsLoading && <p role="status" className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Loading current Stock Out details…</p>}
            {detailsError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><p className="break-words">{detailsError}</p><button type="button" onClick={() => void openDetails(detailTarget)} className="mt-2 min-h-11 cursor-pointer rounded-lg border border-current px-3 font-semibold focus-visible:outline-2 focus-visible:outline-cyan-500">Retry loading details</button></div>}
            {!detailsLoading && !detailsError && selectedOrder && <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
              <section className="pm-stock-out-detail-card min-w-0 space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0b101d] sm:p-4 xl:col-span-2">
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{Object.entries({ Customer: selectedOrder.customer, 'Assigned warehouse': selectedOrder.warehouse, 'Order reference': selectedOrder.orderNo, 'Target delivery': selectedOrder.requiredDelivery }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
                <button type="button" onClick={() => void startCamera()} disabled={actionBusy || selectedOrder.status === 'For Packing'} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#092635] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163b4a] focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-wait disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><ScanLine className="h-4 w-4" />Scan Barcode</button>
                {manualBarcode.trim() && !scannerOpen && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">An unsubmitted barcode entry is retained. Reopen the scanner to review it.</p>}
                <div className="space-y-3"><h3 className="text-sm font-semibold">Release Progress</h3>{progress.map(group => <div key={group.unit}><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{group.unit}</span><span className="font-medium tabular-nums">{group.released} / {group.ordered} {group.unit}</span></div><div role="progressbar" aria-label={`${group.unit} release progress`} aria-valuenow={group.released} aria-valuemin={0} aria-valuemax={group.ordered} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${group.percentage}%` }} /></div></div>)}</div>
          <div className="pm-table-scroll max-w-full overflow-x-auto overscroll-x-contain">
            <table className="pm-stock-out-table pm-responsive-table pm-cols-10 pm-sticky-2 w-full min-w-[1050px] text-xs">
              <thead className="border-b border-slate-800 bg-[#070a12] text-slate-400"><tr>{['Barcode', 'Product', 'Ordered Qty', 'Scanned / Required', 'Remaining Qty', 'Unit', 'Batch / Lot', 'Expiry', 'Location', 'Status'].map(label => <th key={label} className="px-3 py-2 text-left font-medium">{label}</th>)}</tr></thead>
              <tbody>{selectedOrder.items?.map(item => <tr key={item.id} className="border-b border-slate-800/60">
                <td className="px-3 py-3 font-mono text-slate-300">{item.barcode || '—'}</td><td className="px-3 py-3 text-slate-200">{item.product}</td><td className="px-3 py-3 text-white">{item.orderedQty}</td><td className={`px-3 py-3 font-semibold ${item.remainingQty <= 0 ? 'text-emerald-400' : 'text-white'}`}>{item.releasedQty} / {item.orderedQty}{item.remainingQty <= 0 ? ' ✓' : ''}</td><td className="px-3 py-3 text-white">{item.remainingQty}</td><td className="px-3 py-3 text-slate-300">{item.unit}</td><td className="px-3 py-3 text-slate-400">{item.batchLot || '—'}</td><td className="px-3 py-3 text-slate-400">{item.expiryDate || '—'}</td><td className="px-3 py-3 text-slate-400">{item.location || '—'}</td><td className="px-3 py-3"><ItemStatusBadge status={item.status} /></td>
              </tr>)}</tbody>
            </table>
          </div>
              </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-[#0b101d]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Clock className="h-4 w-4 text-cyan-400" /> Stock Out History</h2>
          <div className="mt-4 max-h-[460px] space-y-4 overflow-y-auto pr-1">
            {selectedOrder.history?.map(event => <div key={event.id} className="border-l-2 border-cyan-500/40 pl-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{event.action.replaceAll('_', ' ')}</p>
              {event.barcode && <p className="text-xs text-slate-600 dark:text-slate-400">Barcode: {event.barcode} · Quantity: {event.quantity}</p>}
              <p className="text-xs text-slate-500">{event.performedBy || 'System'} · {formatDate(event.createdAt, true)}</p>
            </div>)}
            {!selectedOrder.history?.length && <p className="text-sm text-slate-600 dark:text-slate-400">No Stock Out events recorded yet.</p>}
          </div>
        </section>
            </div>}
          </div>
        </div>
      </div>}

      {scannerOpen && selectedOrder && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div ref={scannerDialogRef} tabIndex={-1} className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b101d] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id="scanner-title" className="text-lg font-semibold text-white">Scan Inventory Barcode</h2><p className="mt-1 text-sm text-slate-400">{selectedOrder.orderNo} · releases are validated against this order and warehouse.</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => setSoundEnabled(value => !value)} aria-label={soundEnabled ? 'Mute scanner sounds' : 'Enable scanner sounds'} title={soundEnabled ? 'Mute scanner sounds' : 'Enable scanner sounds'} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">{soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button><button disabled={actionBusy} onClick={closeScanner} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="h-5 w-5" /> Close Scanner</button></div></div>

          <div className={`relative mt-5 aspect-video overflow-hidden rounded-xl border bg-black transition-colors duration-200 ${scannerFlash === 'success' ? 'border-emerald-400 ring-4 ring-emerald-500/30' : scannerFlash === 'error' ? 'border-rose-400 ring-4 ring-rose-500/30' : 'border-slate-700'}`}>
            <video ref={videoRef} muted playsInline autoPlay aria-label="Barcode scanner camera preview" className="h-full w-full object-cover" />
            {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400"><Camera className="h-10 w-10" /><p className="text-sm">Camera is not active</p><button onClick={() => void startCamera()} className="min-h-11 cursor-pointer rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-500">Start Camera</button></div>}
            {cameraActive && <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-cyan-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />}
            {scannerFlash && <div className={`pointer-events-none absolute inset-0 ${scannerFlash === 'success' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />}
            {cameraActive && <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"><span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${actionBusy ? 'border-amber-400/40 bg-amber-950/70 text-amber-200' : scanCooldown ? 'border-slate-500/40 bg-slate-950/70 text-slate-300' : 'border-emerald-400/40 bg-emerald-950/70 text-emerald-200'}`}>{actionBusy ? 'Processing scan…' : scanCooldown ? 'Scanner cooldown…' : 'Ready to scan'}</span></div>}
          </div>

          {scannerError && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{scannerError}</div>}
          {scanSuccess && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 className="h-5 w-5" /> {scanSuccess}</p></div>}
          {recentScan && <div aria-live="polite" className={`mt-4 rounded-xl border p-3 text-sm ${recentScan.succeeded ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' : 'border-rose-500/20 bg-rose-500/5 text-rose-200'}`}><p className="font-medium">Most recent scan: {recentScan.succeeded ? 'Succeeded' : 'Failed'}</p><p className="mt-1 break-all text-xs opacity-90">{recentScan.product ? `${recentScan.product} · ` : ''}{recentScan.barcode}</p><p className="mt-1 text-xs opacity-80">{recentScan.message}</p></div>}

          <form onSubmit={event => {
            event.preventDefault();
            const quantity = Number(manualQuantity);
            if (!manualBarcode.trim() || !Number.isInteger(quantity) || quantity < 1) {
              setScannerError('Enter a valid barcode and a whole-number quantity of at least 1.');
              return;
            }
            void processScan(manualBarcode, quantity, true);
          }} className="mt-5 rounded-xl border border-slate-800 bg-[#070a12] p-4">
            <h3 className="text-sm font-semibold text-white">Enter Barcode Manually</h3><p className="mt-1 text-xs text-slate-400">Camera and manual entry use the same backend barcode validation.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
              <label className="text-sm text-slate-300">Barcode<input value={manualBarcode} onChange={event => setManualBarcode(event.target.value)} required maxLength={100} autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-[#0b101d] px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
              <label className="text-sm text-slate-300">Quantity<input type="number" min={1} step={1} value={manualQuantity} onChange={event => setManualQuantity(event.target.value)} required inputMode="numeric" className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-[#0b101d] px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
              <button type="submit" disabled={actionBusy || scanCooldown || !manualBarcode.trim() || !Number.isInteger(Number(manualQuantity)) || Number(manualQuantity) < 1} className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">{actionBusy ? 'Working…' : scanCooldown ? 'Ready shortly…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </div>}
      {scanToast && <div role={scanToast.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed bottom-4 right-4 z-[70] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${scanToast.type === 'success' ? 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100' : 'border-rose-400/30 bg-rose-950/90 text-rose-100'}`}>{scanToast.message}</div>}
    </div>
  );
};

export default StockOut;
