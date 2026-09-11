import type { NotificationRecord } from './notifications';

const destinations: {
  role: string;
  category: string;
  types: NotificationRecord['type'][];
  path: string;
}[] = [
  { role: 'ADMIN', category: 'Stock In', types: ['success'], path: '/admin/inventory' },
  { role: 'ADMIN', category: 'Procurement', types: ['info'], path: '/admin/procurement' },
  { role: 'ADMIN', category: 'Logistics', types: ['success'], path: '/admin/logistics' },
  { role: 'PLANT_MANAGER', category: 'Procurement', types: ['success', 'warning'], path: '/plant-manager/procurement' },
  { role: 'PLANT_MANAGER', category: 'Quality Inspection', types: ['success', 'warning', 'error'], path: '/plant-manager/receiving' },
  { role: 'PLANT_MANAGER', category: 'Order', types: ['info'], path: '/plant-manager/order-management' },
  { role: 'QA_SUPERVISOR', category: 'Quality Inspection', types: ['info'], path: '/qa/inspection' },
];

export function getNotificationDestination(notification: NotificationRecord, role: string | null | undefined): string | null {
  return destinations.find((destination) =>
    destination.role === role
    && destination.category === notification.category
    && destination.types.includes(notification.type),
  )?.path ?? null;
}
