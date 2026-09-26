import { FIRST_LOGIN_STORAGE_KEY } from './greeting';

export const SESSION_CHANNEL_NAME = 'smartchain-auth-session';
export const SESSION_IDLE_TIMEOUT_EVENT = 'smartchain:session-idle-timeout';

export const clearAuthStorage = (): void => {
  sessionStorage.removeItem('isAuthenticated');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(FIRST_LOGIN_STORAGE_KEY);
};

export const redirectToIdleLogin = (): void => {
  clearAuthStorage();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login?reason=session-expired');
  }
};

export const broadcastSessionEnd = (reason: 'logout' | 'idle-timeout'): void => {
  if (!('BroadcastChannel' in window)) return;
  const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  channel.postMessage({ type: reason });
  channel.close();
};
