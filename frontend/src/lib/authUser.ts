export interface AuthRelationship {
  id?: number;
  name: string;
  code?: string;
  slug?: string;
}

export interface AuthUser {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  status?: string | null;
  profile_photo_url?: string | null;
  role: AuthRelationship | null;
  department: AuthRelationship | null;
  branch: AuthRelationship | null;
  warehouse: AuthRelationship | null;
}

export const AUTH_USER_UPDATED_EVENT = 'smartchain:user-updated';

export const readStoredUser = (): AuthUser | null => {
  try {
    const value = sessionStorage.getItem('user');
    return value ? JSON.parse(value) as AuthUser : null;
  } catch {
    return null;
  }
};

export const updateStoredUser = (user: AuthUser): void => {
  sessionStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new CustomEvent<AuthUser>(AUTH_USER_UPDATED_EVENT, { detail: user }));
};

export const subscribeToStoredUser = (listener: (user: AuthUser) => void): (() => void) => {
  const handler = (event: Event) => listener((event as CustomEvent<AuthUser>).detail);
  window.addEventListener(AUTH_USER_UPDATED_EVENT, handler);
  return () => window.removeEventListener(AUTH_USER_UPDATED_EVENT, handler);
};

export const userInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return `${parts[0][0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''}`.toUpperCase();
};
