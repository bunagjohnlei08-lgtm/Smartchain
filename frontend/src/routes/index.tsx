import { createBrowserRouter } from 'react-router-dom';
import LoginPage from '../page/LoginPage';
import DashboardPage from '../page/Dashboard';
import UserManagement from '../page/userManagement';

const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/users', element: <UserManagement /> },
]);

export default router;