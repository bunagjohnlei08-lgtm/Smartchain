import type { NotificationRecord } from './notifications';

// Categories identify the originating module; severity/type only controls
// presentation and may contain legacy workflow event codes.
const destinations: {
  role: string;
  category: string;
  path: string;
}[] = [
  { role: 'ADMIN', category: 'Stock In', path: '/admin/inventory' },
  { role: 'ADMIN', category: 'Warehouse Capacity', path: '/admin/manage-locations' },
  { role: 'ADMIN', category: 'Procurement', path: '/admin/procurement' },
  { role: 'ADMIN', category: 'Logistics', path: '/admin/logistics' },
  { role: 'ADMIN', category: 'Rejected Items', path: '/admin/rejected-items' },
  { role: 'ADMIN', category: 'Supplier Management', path: '/admin/suppliers' },
  { role: 'ADMIN', category: 'Supplier Applications', path: '/admin/suppliers?tab=applications' },
  { role: 'ADMIN', category: 'Inventory Audit Approval', path: '/admin/inventory-audit-approvals' },
  { role: 'PLANT_MANAGER', category: 'Procurement', path: '/plant-manager/procurement' },
  { role: 'PLANT_MANAGER', category: 'Inventory', path: '/plant-manager/procurement' },
  { role: 'PLANT_MANAGER', category: 'Quality Inspection', path: '/plant-manager/receiving' },
  { role: 'PLANT_MANAGER', category: 'Receiving', path: '/plant-manager/receiving' },
  { role: 'PLANT_MANAGER', category: 'Order', path: '/plant-manager/order-management' },
  { role: 'PLANT_MANAGER', category: 'Warehouse Capacity', path: '/plant-manager/warehouse' },
  { role: 'QA_SUPERVISOR', category: 'Quality Inspection', path: '/qa/inspection' },
  { role: 'QA_SUPERVISOR', category: 'Inventory Quality Audit', path: '/qa/inventory-audit' },
];

export function getNotificationDestination(notification: NotificationRecord, role: string | null | undefined): string | null {
  const path = destinations.find((destination) =>
    destination.role === role
    && destination.category === notification.category,
  )?.path ?? null;

  // Supplier application notifications reference the application number; the
  // Applications tab opens it through the Admin-only API (no payload is trusted).
  const reference = notification.reference_id?.trim();
  if (path && notification.category === 'Supplier Applications' && reference) {
    return `${path}&application=${encodeURIComponent(reference)}`;
  }

  return path;
}
