import {
  Warehouse,
  FileText,
  Truck,
  AlertCircle
} from 'lucide-react';
import type { KPI, PurchaseOrder, InventoryItem, Product } from '../types';

export const kpiData: KPI[] = [
  {
    label: 'Warehouse Utilization',
    value: '68%',
    change: '+4.2% vs last week',
    icon: <Warehouse className="w-5 h-5 text-blue-400" />,
    trend: 'up'
  },
  {
    label: 'Open Purchase Orders',
    value: 23,
    subtitle: '6 awaiting approval',
    icon: <FileText className="w-5 h-5 text-blue-400" />,
    trend: 'neutral'
  },
  {
    label: 'Shipments In Transit',
    value: 14,
    subtitle: '2 delayed',
    icon: <Truck className="w-5 h-5 text-blue-400" />,
    trend: 'down'
  },
  {
    label: 'Low Stock Items',
    value: 18,
    subtitle: 'Reorder recommended',
    icon: <AlertCircle className="w-5 h-5 text-blue-400" />,
    trend: 'up'
  }
];

export const recentOrders: PurchaseOrder[] = [
  { id: 'PO-9021', supplier: 'Northgate Trading Co.', amount: 'P184,500', status: 'Approved', date: '2026-07-23' },
  { id: 'PO-9022', supplier: 'GreenLeaf Organics', amount: 'P62,400', status: 'Pending', date: '2026-07-23' },
  { id: 'PO-9023', supplier: 'Metro Textile Mills', amount: 'P428,000', status: 'Completed', date: '2026-07-22' },
  { id: 'PO-9024', supplier: 'Peak Health Supply', amount: 'P96,700', status: 'Approved', date: '2026-07-22' },
  { id: 'PO-9025', supplier: 'Bayview Home Goods', amount: 'P18,900', status: 'Cancelled', date: '2026-07-21' }
];

export const inventoryItems: InventoryItem[] = [
  { sku: 'SKU-001', name: 'Organic Green Tea', warehouse: 'Northgate', stock: 450, safetyStock: 100, status: 'Healthy' },
  { sku: 'SKU-002', name: 'Stainless Steel Bottle', warehouse: 'Eastside', stock: 120, safetyStock: 150, status: 'Low Stock' },
  { sku: 'SKU-003', name: 'Cotton T-Shirt', warehouse: 'Southpark', stock: 45, safetyStock: 80, status: 'Critical' },
  { sku: 'SKU-004', name: 'Wireless Earbuds', warehouse: 'Northgate', stock: 0, safetyStock: 50, status: 'Out of Stock' }
];

export const productData: Product[] = [
  { sku: 'SKU-IPAD-AIRRR', name: 'IPAD AIR 1 variants', category: 'Electronics', brand: 'Sony', tracking: 'SERIAL', costPrice: 10000, unitPrice: 10000, unit: 'pcs', reorderLimit: 97, stock: 97, status: 'Healthy' },
  { sku: 'MBP-M3', name: 'Macbook Pro M3', category: 'Electronics', brand: 'Apple', tracking: 'SERIAL', costPrice: 10000, unitPrice: 10000, unit: 'pcs', reorderLimit: 5, stock: 5, status: 'Low Stock' },
  { sku: 'SKU-001', name: 'Organic Green Tea', category: 'Beverages', brand: 'Nature\'s Best', tracking: 'BATCH', costPrice: 250, unitPrice: 350, unit: 'box', reorderLimit: 100, stock: 450, status: 'Healthy' },
  { sku: 'SKU-002', name: 'Stainless Steel Bottle', category: 'Kitchenware', brand: 'EcoLife', tracking: 'NONE', costPrice: 450, unitPrice: 650, unit: 'pcs', reorderLimit: 150, stock: 120, status: 'Low Stock' }
];

export const chartData = [
  { name: 'Mon', inbound: 4000, outbound: 2400, capacity: 65, forecast: 4200 },
  { name: 'Tue', inbound: 3000, outbound: 1398, capacity: 72, forecast: 3800 },
  { name: 'Wed', inbound: 2000, outbound: 3800, capacity: 58, forecast: 3500 },
  { name: 'Thu', inbound: 2780, outbound: 3908, capacity: 70, forecast: 4100 },
  { name: 'Fri', inbound: 1890, outbound: 4800, capacity: 75, forecast: 3900 },
  { name: 'Sat', inbound: 2390, outbound: 3800, capacity: 62, forecast: 3600 },
  { name: 'Sun', inbound: 3490, outbound: 4300, capacity: 68, forecast: 4400 }
];

export const statusColors = {
  'Approved': 'text-green-400 bg-green-400/10 border-green-400/20',
  'Pending': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Completed': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Cancelled': 'text-red-400 bg-red-400/10 border-red-400/20'
};

export const statusBadgeColors = {
  'Healthy': 'bg-green-400/10 text-green-400 border-green-400/20',
  'Low Stock': 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
  'Critical': 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  'Out of Stock': 'bg-red-400/10 text-red-400 border-red-400/20'
};