import { FIRST_LOGIN_STORAGE_KEY } from './greeting';

export const SESSION_CHANNEL_NAME = 'smartchain-auth-session';
export const SESSION_IDLE_TIMEOUT_EVENT = 'smartchain:session-idle-timeout';

/**
 * Non-secret identity of the Sanctum token this tab is signed in with. Sanctum
 * plain-text tokens are "<token id>|<secret>", so only the id before the pipe is
 * used. Tokens live in per-tab sessionStorage, so different accounts in different
 * tabs have different keys; tabs sharing a key share one server-side session.
 */
export const currentSessionKey = (): string | null => {
  const token = sessionStorage.getItem('token');
  const separator = token?.indexOf('|') ?? -1;
  if (!token || separator <= 0) return null;
  return token.slice(0, separator);
};

export const clearAuthStorage = (): void => {
  sessionStorage.removeItem('isAuthenticated');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(FIRST_LOGIN_STORAGE_KEY);
};

export const redirectToPublicLanding = (): void => {
  clearAuthStorage();
  if (window.location.pathname !== '/') {
    window.location.replace('/');
  }
};

/**
 * Tells other tabs signed in with the same token that the session ended. Tabs
 * signed in with a different token ignore the message.
 */
export const broadcastSessionEnd = (reason: 'logout' | 'idle-timeout', sessionKey: string | null = currentSessionKey()): void => {
  if (!sessionKey || !('BroadcastChannel' in window)) return;
  const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  channel.postMessage({ type: reason, sessionKey });
  channel.close();
};
