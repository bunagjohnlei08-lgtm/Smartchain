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

export type RoleSlug = 'ADMIN' | 'PLANT_MANAGER' | 'QA_SUPERVISOR';

export interface LoginFormData {
  mode: 'login';
  email: string;
  password: string;
  rememberMe: boolean;
  role?: RoleSlug;
}

export interface SignupFormData {
  mode: 'signup';
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: RoleSlug;
}

export type AuthFormData = LoginFormData | SignupFormData;

export interface ApiRole {
  id: number;
  name: string;
  slug: RoleSlug;
  description?: string;
}

export interface ApiDepartment {
  id: number;
  name: string;
  code: string;
}

export interface ApiBranch {
  id: number;
  name: string;
  code: string;
}

export interface ApiWarehouse {
  id: number;
  name: string;
  code: string;
  branch_id: number;
}

export interface ApiUser {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  role: ApiRole | null;
  department: ApiDepartment | null;
  branch: ApiBranch | null;
  warehouse: ApiWarehouse | null;
  role_id?: number;
  department_id?: number | null;
  branch_id?: number | null;
  warehouse_id?: number | null;
  created_at: string;
  updated_at: string;
}
