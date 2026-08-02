export interface KPI {
  label: string;
  value: string | number;
  change?: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  amount: string;
  status: 'Approved' | 'Pending' | 'Completed' | 'Cancelled';
  date: string;
}

export interface InventoryItem {
  sku: string;
  name: string;
  warehouse: string;
  stock: number;
  safetyStock: number;
  status: 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock';
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  brand: string;
  tracking: 'SERIAL' | 'BATCH' | 'NONE';
  costPrice: number;
  unitPrice: number;
  unit: string;
  reorderLimit: number;
  stock: number;
  status: 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock';
}

export type AuthMode = 'login' | 'signup';

export interface LoginFormData {
  mode: 'login';
  email: string;
  password: string;
  rememberMe: boolean;
  role: string;
}

export interface SignupFormData {
  mode: 'signup';
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
}

export type AuthFormData = LoginFormData | SignupFormData;
