import { apiClient } from './api';

export const clearAuthStorage = (): void => {
  sessionStorage.removeItem('isAuthenticated');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
};

/**
 * Revokes the current Sanctum personal access token server side, then drops the
 * cached session. Sanctum tokens do not expire on their own, so skipping the API
 * call would leave a usable token behind on every sign out. The request is best
 * effort: an already revoked or rejected token still means the session is over,
 * so the local state is cleared either way.
 */
export const logout = async (): Promise<void> => {
  try {
    await apiClient.post('/logout');
  } catch {
    // Ignored on purpose - see above.
  } finally {
    clearAuthStorage();
  }
};
