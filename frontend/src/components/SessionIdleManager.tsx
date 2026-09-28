import React from 'react';
import { Clock3 } from 'lucide-react';
import { apiClient } from '../lib/api';
import { broadcastSessionEnd, clearAuthStorage, currentSessionKey, redirectToIdleLogin, SESSION_CHANNEL_NAME, SESSION_IDLE_TIMEOUT_EVENT } from '../lib/authSession';
import { logout } from '../lib/logout';

interface SessionStatusResponse {
  timeout_minutes: number;
  warning_minutes: number;
  last_activity_at: string;
  expires_at: string;
  server_time?: string;
}

interface SessionStatus {
  timeoutMinutes: number;
  warningMinutes: number;
  /** Expiry expressed on this browser's clock, so client/server clock skew cannot shift the countdown. */
  deadlineMs: number;
}

const SYNC_INTERVAL_MS = 30_000;

const toStatus = (response: SessionStatusResponse): SessionStatus => {
  const serverNow = response.server_time ? Date.parse(response.server_time) : NaN;
  const expiresAt = Date.parse(response.expires_at);
  const deadlineMs = Number.isFinite(serverNow) ? Date.now() + (expiresAt - serverNow) : expiresAt;
  return { timeoutMinutes: response.timeout_minutes, warningMinutes: response.warning_minutes, deadlineMs };
};

const secondsUntil = (deadlineMs: number): number => Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));

const SessionIdleManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = React.useState<SessionStatus | null>(null);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const lastSyncAt = React.useRef(0);
  const trailingSync = React.useRef<number | null>(null);
  const statusRef = React.useRef<SessionStatus | null>(null);
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const endingRef = React.useRef(false);
  const confirmingExpiry = React.useRef(false);
  // Identity of the token this tab authenticated with, captured before any 401
  // handler clears sessionStorage. Cross-tab messages are only honoured when they
  // carry the same key, so another account's timeout or logout never ends this tab.
  const sessionKeyRef = React.useRef<string | null>(currentSessionKey());

  const clearTrailingSync = React.useCallback(() => {
    if (trailingSync.current !== null) {
      window.clearTimeout(trailingSync.current);
      trailingSync.current = null;
    }
  }, []);

  const applyStatus = React.useCallback((next: SessionStatus, broadcast = false) => {
    statusRef.current = next;
    setStatus(next);
    setRemainingSeconds(secondsUntil(next.deadlineMs));
    if (broadcast && sessionKeyRef.current) {
      channelRef.current?.postMessage({ type: 'activity', sessionKey: sessionKeyRef.current, deadlineMs: next.deadlineMs });
    }
  }, []);

  const endSession = React.useCallback((broadcast = true) => {
    if (endingRef.current) return;
    endingRef.current = true;
    clearTrailingSync();
    if (broadcast) broadcastSessionEnd('idle-timeout', sessionKeyRef.current);
    redirectToIdleLogin();
  }, [clearTrailingSync]);

  const fetchStatus = React.useCallback(async (): Promise<SessionStatus> => {
    const response = await apiClient.get<SessionStatusResponse>('/session/status');
    const next = toStatus(response.data);
    applyStatus(next);
    return next;
  }, [applyStatus]);

  const syncActivity = React.useCallback(async (force = false): Promise<boolean> => {
    if (endingRef.current) return false;
    const now = Date.now();
    const sinceLastSync = now - lastSyncAt.current;
    if (!force && sinceLastSync < SYNC_INTERVAL_MS) {
      // Throttled: schedule one trailing sync so the server-side activity never
      // lags the optimistic local countdown by more than the throttle window.
      if (trailingSync.current === null) {
        trailingSync.current = window.setTimeout(() => {
          trailingSync.current = null;
          void syncActivity(false);
        }, SYNC_INTERVAL_MS - sinceLastSync);
      }
      return true;
    }

    clearTrailingSync();
    lastSyncAt.current = now;
    setIsSyncing(true);
    try {
      const response = await apiClient.post<SessionStatusResponse>('/session/activity');
      applyStatus(toStatus(response.data), true);
      return true;
    } catch {
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [applyStatus, clearTrailingSync]);

  React.useEffect(() => {
    void fetchStatus().catch(() => undefined);

    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null;
    channelRef.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const ownKey = sessionKeyRef.current;
        if (!ownKey || event.data?.sessionKey !== ownKey) return;
        if (event.data.type === 'activity' && typeof event.data.deadlineMs === 'number' && statusRef.current) {
          applyStatus({ ...statusRef.current, deadlineMs: event.data.deadlineMs });
        }
        if (event.data.type === 'logout' || event.data.type === 'idle-timeout') {
          endingRef.current = true;
          clearTrailingSync();
          clearAuthStorage();
          window.location.replace(event.data.type === 'idle-timeout' ? '/login?reason=session-expired' : '/login');
        }
      };
    }

    const onIdleResponse = () => endSession();
    window.addEventListener(SESSION_IDLE_TIMEOUT_EVENT, onIdleResponse);

    return () => {
      channel?.close();
      channelRef.current = null;
      clearTrailingSync();
      window.removeEventListener(SESSION_IDLE_TIMEOUT_EVENT, onIdleResponse);
    };
  }, [applyStatus, clearTrailingSync, endSession, fetchStatus]);

  React.useEffect(() => {
    const onMeaningfulActivity = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-session-control]')) return;

      const current = statusRef.current;
      if (current) {
        applyStatus({ ...current, deadlineMs: Date.now() + current.timeoutMinutes * 60_000 });
      }
      void syncActivity(false);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'popstate'];
    events.forEach((eventName) => window.addEventListener(eventName, onMeaningfulActivity, { passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, onMeaningfulActivity));
  }, [applyStatus, syncActivity]);

  React.useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === 'visible') void fetchStatus().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('focus', reconcile);
    return () => {
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('focus', reconcile);
    };
  }, [fetchStatus]);

  React.useEffect(() => {
    // A local countdown reaching zero is confirmed with the server (the
    // authority) before signing out, so a stale local deadline cannot end a
    // session the server still considers active.
    const confirmExpiry = async () => {
      if (confirmingExpiry.current || endingRef.current) return;
      confirmingExpiry.current = true;
      try {
        const next = await fetchStatus();
        if (secondsUntil(next.deadlineMs) === 0) endSession();
      } catch (error: unknown) {
        // An idle 401 already ends the session through SESSION_IDLE_TIMEOUT_EVENT.
        const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code !== 'SESSION_IDLE_TIMEOUT') endSession();
      } finally {
        confirmingExpiry.current = false;
      }
    };

    const update = () => {
      const current = statusRef.current;
      if (!current) return;
      const remaining = secondsUntil(current.deadlineMs);
      setRemainingSeconds(remaining);
      if (remaining === 0) void confirmExpiry();
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [endSession, fetchStatus]);

  const warningSeconds = status ? status.warningMinutes * 60 : 0;
  const showWarning = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= warningSeconds;
  const minutes = Math.floor((remainingSeconds ?? 0) / 60);
  const seconds = (remainingSeconds ?? 0) % 60;

  const staySignedIn = async () => {
    if (await syncActivity(true)) setRemainingSeconds(null);
  };

  const logOutNow = async () => {
    endingRef.current = true;
    await logout();
    broadcastSessionEnd('logout', sessionKeyRef.current);
    window.location.replace('/login');
  };

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="session-warning-title" aria-describedby="session-warning-description" data-session-control>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#0d1322] dark:text-white sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Clock3 className="h-5 w-5" /></div>
              <div>
                <h2 id="session-warning-title" className="text-lg font-semibold">Session Expiring Soon</h2>
                <p id="session-warning-description" className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Your session will expire due to inactivity.</p>
              </div>
            </div>
            <p className="my-6 text-center font-mono text-4xl font-bold tabular-nums text-amber-600 dark:text-amber-400" aria-live="polite">{minutes}:{String(seconds).padStart(2, '0')}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void logOutNow()} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Log Out</button>
              <button type="button" disabled={isSyncing} onClick={() => void staySignedIn()} className="min-h-11 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-950">{isSyncing ? 'Confirming…' : 'Stay Signed In'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SessionIdleManager;
