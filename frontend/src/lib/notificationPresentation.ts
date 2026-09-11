import {
  AlertTriangle,
  ArrowDownToLine,
  ClipboardCheck,
  ClipboardList,
  Info,
  Package,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationRecord } from './notifications';

export interface NotificationVisual {
  Icon: LucideIcon;
  tone: string;
}

const visualByType: Record<NotificationRecord['type'], NotificationVisual> = {
  error: { Icon: AlertTriangle, tone: 'bg-red-500/10 text-red-500' },
  warning: { Icon: AlertTriangle, tone: 'bg-amber-500/10 text-amber-500' },
  info: { Icon: Info, tone: 'bg-blue-500/10 text-blue-500' },
  success: { Icon: ShieldCheck, tone: 'bg-emerald-500/10 text-emerald-500' },
};

export function getNotificationVisual(notification: NotificationRecord): NotificationVisual {
  if (notification.category === 'Quality Inspection' && notification.type === 'info') {
    return { Icon: ShieldCheck, tone: visualByType.warning.tone };
  }

  const context = `${notification.category ?? ''} ${notification.title}`.toLowerCase();

  if (context.includes('stock in')) return { Icon: ArrowDownToLine, tone: 'bg-emerald-500/10 text-emerald-500' };
  if (context.includes('procurement') || context.includes('replenishment')) return { Icon: ClipboardList, tone: 'bg-blue-500/10 text-blue-500' };
  if (context.includes('qa') || context.includes('quality') || context.includes('inspection')) {
    return notification.type === 'error' || notification.type === 'warning'
      ? visualByType[notification.type]
      : { Icon: ShieldCheck, tone: 'bg-emerald-500/10 text-emerald-500' };
  }
  if (context.includes('receiving')) return { Icon: Package, tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' };
  if (context.includes('order')) return { Icon: ClipboardCheck, tone: 'bg-blue-500/10 text-blue-500' };
  if (context.includes('logistics') || context.includes('shipment')) return { Icon: Truck, tone: 'bg-emerald-500/10 text-emerald-500' };

  return visualByType[notification.type] ?? visualByType.info;
}

export function formatNotificationRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return 'Yesterday';
  return `${Math.floor(seconds / 86400)}d ago`;
}
