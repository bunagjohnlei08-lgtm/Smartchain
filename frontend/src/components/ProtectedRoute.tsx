import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import type { ApiUser } from '../types';
import { apiClient } from '../lib/api';
import { clearAuthStorage } from '../lib/authSession';
import SessionIdleManager from './SessionIdleManager';

const AUTH_KEY = 'isAuthenticated';
const ROLE_KEY = 'userRole';
const USER_KEY = 'user';

const PANEL_ROUTES: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  PLANT_MANAGER: '/plant-manager/dashboard',
  QA_SUPERVISOR: '/qa/dashboard',
  SUPPLIER: '/supplier-account',
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
  const [validationState, setValidationState] = useState<'pending' | 'authenticated' | 'unauthenticated' | 'unavailable'>(
    isAuthenticated ? 'pending' : 'unauthenticated',
  );
  const verify = useCallback(async () => {
    if (!sessionStorage.getItem('token')) {
      setValidationState('unauthenticated');
      return;
    }

    setValidationState('pending');
    try {
      await apiClient.get('/session/status');
      setValidationState('authenticated');
    } catch (error) {
      const status = (error as AxiosError)?.response?.status;
      if (status === 401) {
        clearAuthStorage();
        setValidationState('unauthenticated');
        return;
      }

      // A network error, server failure, or rate limit is not proof that the
      // bearer token was revoked. Keep private content hidden and let the user
      // retry instead of destroying a freshly completed OTP login.
      setValidationState('unavailable');
    }
  }, []);
  useEffect(() => {
    void verify();
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, [verify]);

  if (!isAuthenticated || validationState === 'unauthenticated') {
    return <Navigate to="/" replace />;
  }

  if (validationState === 'pending') {
    return <div className="min-h-screen bg-[var(--bg-app)]" role="status" aria-label="Verifying session" />;
  }

  if (validationState === 'unavailable') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] p-6">
        <section className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center shadow-xl" role="alert">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Unable to verify your session</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Your sign-in was not cleared. Check your connection and try again.
          </p>
          <button type="button" onClick={() => void verify()} className="mt-5 min-h-11 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    const fallback = PANEL_ROUTES[userRole];
    if (fallback) return <Navigate to={fallback} replace />;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] p-6">
        <section className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center shadow-xl" role="alert">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">No dashboard is assigned to this account</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Contact an administrator to verify your role assignment.
          </p>
        </section>
      </main>
    );
  }

  return <SessionIdleManager>{children}</SessionIdleManager>;
};

export default ProtectedRoute;
