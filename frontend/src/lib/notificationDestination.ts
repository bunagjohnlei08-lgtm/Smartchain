import type { NotificationRecord } from './notifications';

const destinations: {
  role: string;
  category: string;
  types: NotificationRecord['type'][];
  path: string;
}[] = [
  { role: 'ADMIN', category: 'Stock In', types: ['success'], path: '/admin/inventory' },
  { role: 'ADMIN', category: 'Warehouse Capacity', types: ['warning', 'error'], path: '/admin/manage-locations' },
  { role: 'ADMIN', category: 'Procurement', types: ['info'], path: '/admin/procurement' },
  { role: 'ADMIN', category: 'Logistics', types: ['success'], path: '/admin/logistics' },
  { role: 'ADMIN', category: 'Rejected Items', types: ['warning'], path: '/admin/rejected-items' },
  // New application (info), meeting confirmed (success), schedule/correction requests (warning).
  { role: 'ADMIN', category: 'Supplier Applications', types: ['info', 'success', 'warning'], path: '/admin/suppliers?tab=applications' },
  { role: 'ADMIN', category: 'Inventory Audit Approval', types: ['warning'], path: '/admin/inventory-audit-approvals' },
  { role: 'PLANT_MANAGER', category: 'Procurement', types: ['success', 'warning'], path: '/plant-manager/procurement' },
  { role: 'PLANT_MANAGER', category: 'Inventory', types: ['warning', 'error'], path: '/plant-manager/procurement' },
  { role: 'PLANT_MANAGER', category: 'Quality Inspection', types: ['success', 'warning', 'error'], path: '/plant-manager/receiving' },
  { role: 'PLANT_MANAGER', category: 'Receiving', types: ['info'], path: '/plant-manager/receiving' },
  { role: 'PLANT_MANAGER', category: 'Order', types: ['info'], path: '/plant-manager/order-management' },
  { role: 'PLANT_MANAGER', category: 'Warehouse Capacity', types: ['warning', 'error'], path: '/plant-manager/warehouse' },
  { role: 'QA_SUPERVISOR', category: 'Quality Inspection', types: ['info'], path: '/qa/inspection' },
  { role: 'QA_SUPERVISOR', category: 'Inventory Quality Audit', types: ['info', 'success', 'warning'], path: '/qa/inventory-audit' },
];

export function getNotificationDestination(notification: NotificationRecord, role: string | null | undefined): string | null {
  const path = destinations.find((destination) =>
    destination.role === role
    && destination.category === notification.category
    && destination.types.includes(notification.type),
  )?.path ?? null;

  // Supplier application notifications reference the application number; the
  // Applications tab opens it through the Admin-only API (no payload is trusted).
  const reference = notification.reference_id?.trim();
  if (path && notification.category === 'Supplier Applications' && reference) {
    return `${path}&application=${encodeURIComponent(reference)}`;
  }

  return path;
}
