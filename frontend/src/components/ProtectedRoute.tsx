import { Navigate } from 'react-router-dom';

const AUTH_KEY = 'isAuthenticated';
const ROLE_KEY = 'userRole';

const PANEL_ROUTES: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  PLANT_MANAGER: '/plant-manager/dashboard',
  QA_SUPERVISOR: '/qa/dashboard',
};

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const isAuthenticated = localStorage.getItem(AUTH_KEY) === 'true';
  const userRole = localStorage.getItem(ROLE_KEY) || '';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    const fallback = PANEL_ROUTES[userRole] || '/login';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
