import { createBrowserRouter, Navigate } from 'react-router-dom';

import LoginPage from '../page/LoginPage';

import AdminLayout from '../components/layout/AdminLayout';
import PlantManagerLayout from '../layouts/PlantManagerLayout';
import QALayout from '../layouts/QALayout';
import ProtectedRoute from '../components/ProtectedRoute';

import AdminDashboard from '../page/admin/AdminDashboard';
import AdminProductCatalog from '../page/admin/ProductCatalog';
import AdminProcurement from '../page/admin/Procurement';
import AdminPurchaseOrders from '../page/admin/PurchaseOrders';
import AdminSuppliers from '../page/admin/Suppliers';
import AdminLogistics from '../page/admin/logistics';
import AdminInventory from '../page/admin/Inventory';
import AdminManageLocations from '../page/admin/warehouse/ManageLocations';
import AdminBarcodeCenter from '../page/admin/BarcodeCenter';
import AdminReports from '../page/admin/Reports';
import AdminAIDemandForecasting from '../page/admin/AIDemandForecast';
import AdminUserManagement from '../page/admin/userManagement';
import AdminOrderManagement from '../page/admin/orderManagement';

import PlantManagerDashboard from '../page/plant-manager/Dashboard';
import PlantManagerProcurement from '../page/plant-manager/Procurement';
import PlantManagerWarehouse from '../page/plant-manager/Warehouse';
import PlantManagerInventory from '../page/plant-manager/Inventory';
import PlantManagerStockIn from '../page/plant-manager/StockIn';
import PlantManagerStockOut from '../page/plant-manager/StockOut';
import PlantManagerShipment from '../page/plant-manager/Shipment';
import PlantManagerReceiving from '../page/plant-manager/Receiving Management';
import PlantManagerReports from '../page/plant-manager/Reports';
import PlantManagerForecast from '../page/plant-manager/Forecast';
import PlantManagerNotifications from '../page/plant-manager/Notifications';
import PlantManagerProfile from '../page/plant-manager/Profile';
import PlantManagerSuppliers from '../page/plant-manager/Suppliers';
import PlantManagerOrderManagement from '../page/plant-manager/OrderManagement';

import QADashboard from '../page/QA/Dashboard';
import QAInspection from '../page/QA/QualityInspection';
import QARejectedItems from '../page/QA/RejectedItems';
import QAInspectionHistory from '../page/QA/InspectionHistory';
import QAQualityReports from '../page/QA/QualityReports';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/dashboard',
    element: <ProtectedRoute allowedRoles={['ADMIN']}><Navigate to="/admin/dashboard" replace /></ProtectedRoute>,
  },
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['ADMIN']}><AdminLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboard /> },
      { path: 'product-catalog', element: <AdminProductCatalog /> },
      { path: 'inventory', element: <AdminInventory /> },
      { path: 'manage-locations', element: <AdminManageLocations /> },
      { path: 'procurement', element: <AdminProcurement /> },
      { path: 'barcode-center', element: <AdminBarcodeCenter /> },
      { path: 'purchase-orders', element: <AdminPurchaseOrders /> },
      { path: 'suppliers', element: <AdminSuppliers /> },
      { path: 'logistics', element: <AdminLogistics /> },
      { path: 'ai-demand-forecasting', element: <AdminAIDemandForecasting /> },
      { path: 'reports', element: <AdminReports /> },
      { path: 'users', element: <AdminUserManagement /> },
      { path: 'order-management', element: <AdminOrderManagement /> },
    ],
  },
  {
    path: '/plant-manager',
    element: <ProtectedRoute allowedRoles={['PLANT_MANAGER']}><PlantManagerLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/plant-manager/dashboard" replace /> },
      { path: 'products', element: <Navigate to="/plant-manager/dashboard" replace /> },
      { path: 'dashboard', element: <PlantManagerDashboard /> },
      { path: 'procurement', element: <PlantManagerProcurement /> },
      { path: 'warehouse', element: <PlantManagerWarehouse /> },
      { path: 'inventory', element: <PlantManagerInventory /> },
      { path: 'stock-in', element: <PlantManagerStockIn /> },
      { path: 'stock-out', element: <PlantManagerStockOut /> },
      { path: 'shipment', element: <PlantManagerShipment /> },
      { path: 'receiving', element: <PlantManagerReceiving /> },
      { path: 'reports', element: <PlantManagerReports /> },
      { path: 'forecast', element: <PlantManagerForecast /> },
      { path: 'notifications', element: <PlantManagerNotifications /> },
      { path: 'profile', element: <PlantManagerProfile /> },
      { path: 'suppliers', element: <PlantManagerSuppliers /> },
      { path: 'order-management', element: <PlantManagerOrderManagement /> },
    ],
  },
  {
    path: '/qa',
    element: <ProtectedRoute allowedRoles={['QA_SUPERVISOR']}><QALayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/qa/dashboard" replace /> },
      { path: 'dashboard', element: <QADashboard /> },
      { path: 'inspection', element: <QAInspection /> },
      { path: 'rejected-items', element: <QARejectedItems /> },
      { path: 'history', element: <QAInspectionHistory /> },
      { path: 'reports', element: <QAQualityReports /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default router;
