import { createBrowserRouter, Navigate } from 'react-router-dom';

import LoginPage from '../page/LoginPage';

import DashboardPage from '../page/super-admin/Dashboard';
import UserManagement from '../page/super-admin/userManagement';
import ProductCatalog from '../page/super-admin/ProductCatalog';
import Procurement from '../page/super-admin/Procurement';
import PurchaseOrders from '../page/super-admin/PurchaseOrders';
import Suppliers from '../page/super-admin/suppliers';
import Logistics from '../page/super-admin/logistics';
import AIDemandForecast from '../page/super-admin/AIDemandForecast';
import Reports from '../page/super-admin/reports';

import WarehouseModule from '../page/super-admin/warehouse/InventoryList';
import ManageLocations from '../page/super-admin/warehouse/ManageLocations';
import StockCounting from '../page/super-admin/warehouse/StockCounting';

import CompanySettings from '../page/super-admin/settings/CompanySettings';
import Categories from '../page/super-admin/settings/Categories';
import Brands from '../page/super-admin/settings/Brands';
import UnitsOfMeasure from '../page/super-admin/settings/UnitsOfMeasure';
import ApiKeys from '../page/super-admin/settings/ApiKeys';

import AdminLayout from '../layouts/AdminLayout';
import SuperAdminLayout from '../layouts/SuperAdminLayout';
import ProtectedRoute from '../components/ProtectedRoute';

import AdminDashboard from '../page/admin/Dashboard';
import AdminProducts from '../page/admin/Products';
import AdminProcurement from '../page/admin/Procurement';
import AdminPurchaseOrders from '../page/admin/PurchaseOrders';
import AdminSuppliers from '../page/admin/Suppliers';
import AdminShipment from '../page/admin/Shipment';
import AdminStockIn from '../page/admin/StockIn';
import AdminStockOut from '../page/admin/StockOut';
import AdminInventory from '../page/admin/Inventory';
import AdminBarcodeCenter from '../page/admin/BarcodeCenter';
import AdminCategories from '../page/admin/Categories';
import AdminReports from '../page/admin/Reports';
import AdminForecast from '../page/admin/Forecast';
import AdminNotifications from '../page/admin/Notifications';
import AdminProfile from '../page/admin/Profile';
import AdminWarehouse from '../page/admin/Warehouse';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/super-admin',
    element: <ProtectedRoute allowedRoles={['super_admin']}><SuperAdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/super-admin/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'product-catalog', element: <ProductCatalog /> },
      { path: 'procurement', element: <Procurement /> },
      { path: 'purchase-orders', element: <PurchaseOrders /> },
      { path: 'suppliers', element: <Suppliers /> },
      { path: 'logistics', element: <Logistics /> },
      { path: 'ai-demand-forecast', element: <AIDemandForecast /> },
      { path: 'reports', element: <Reports /> },
      { path: 'users', element: <UserManagement /> },
      { path: 'warehouse/inventory', element: <WarehouseModule /> },
      { path: 'warehouse/stock-counting', element: <StockCounting /> },
      { path: 'warehouse/manage-locations', element: <ManageLocations /> },
      { path: 'settings/api-keys', element: <ApiKeys /> },
      { path: 'settings/brands', element: <Brands /> },
      { path: 'settings/categories', element: <Categories /> },
      { path: 'settings/company', element: <CompanySettings /> },
      { path: 'settings/uom', element: <UnitsOfMeasure /> },
    ],
  },
  {
    path: '/dashboard',
    element: <ProtectedRoute allowedRoles={['super_admin']}><Navigate to="/super-admin/dashboard" replace /></ProtectedRoute>,
  },
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['admin']}><AdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboard /> },
      { path: 'warehouse', element: <AdminWarehouse /> },
      { path: 'products', element: <AdminProducts /> },
      { path: 'procurement', element: <AdminProcurement /> },
      { path: 'purchase-orders', element: <AdminPurchaseOrders /> },
      { path: 'suppliers', element: <AdminSuppliers /> },
      { path: 'shipment', element: <AdminShipment /> },
      { path: 'stock-in', element: <AdminStockIn /> },
      { path: 'stock-out', element: <AdminStockOut /> },
      { path: 'inventory', element: <AdminInventory /> },
      { path: 'barcode-center', element: <AdminBarcodeCenter /> },
      { path: 'categories', element: <AdminCategories /> },
      { path: 'brands', element: <Navigate to="/admin/products" replace /> },
      { path: 'reports', element: <AdminReports /> },
      { path: 'forecast', element: <AdminForecast /> },
      { path: 'notifications', element: <AdminNotifications /> },
      { path: 'profile', element: <AdminProfile /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default router;
