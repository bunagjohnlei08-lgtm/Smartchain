import { Navigate } from 'react-router-dom';
import type { ApiUser } from '../types';

const AUTH_KEY = 'isAuthenticated';
const ROLE_KEY = 'userRole';
const USER_KEY = 'user';

const PANEL_ROUTES: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  PLANT_MANAGER: '/plant-manager/dashboard',
  QA_SUPERVISOR: '/qa/dashboard',
};

const restoreStoredRole = (): string => {
  try {
    const storedUser = sessionStorage.getItem(USER_KEY);
    if (storedUser) {
      const user = JSON.parse(storedUser) as ApiUser;
      const restoredRole = user.role?.slug || '';
      if (restoredRole) {
        sessionStorage.setItem(ROLE_KEY, restoredRole);
        return restoredRole;
      }
    }

    return sessionStorage.getItem(ROLE_KEY) || '';
  } catch {
    return sessionStorage.getItem(ROLE_KEY) || '';
  }
};

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const isAuthenticated = sessionStorage.getItem(AUTH_KEY) === 'true';
  const userRole = isAuthenticated ? restoreStoredRole() : '';

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
