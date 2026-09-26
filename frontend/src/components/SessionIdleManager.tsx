import React from 'react';
import { Clock3 } from 'lucide-react';
import { apiClient } from '../lib/api';
import { broadcastSessionEnd, clearAuthStorage, redirectToIdleLogin, SESSION_CHANNEL_NAME, SESSION_IDLE_TIMEOUT_EVENT } from '../lib/authSession';
import { logout } from '../lib/logout';

interface SessionStatus {
  timeout_minutes: number;
  warning_minutes: number;
  last_activity_at: string;
  expires_at: string;
}

const SYNC_INTERVAL_MS = 30_000;

const SessionIdleManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = React.useState<SessionStatus | null>(null);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const lastSyncAt = React.useRef(0);
  const statusRef = React.useRef<SessionStatus | null>(null);
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  const applyStatus = React.useCallback((next: SessionStatus, broadcast = false) => {
    statusRef.current = next;
    setStatus(next);
    setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(next.expires_at) - Date.now()) / 1000)));
    if (broadcast) channelRef.current?.postMessage({ type: 'activity', status: next });
  }, []);

  const endSession = React.useCallback((broadcast = true) => {
    if (broadcast) broadcastSessionEnd('idle-timeout');
    redirectToIdleLogin();
  }, []);

  const fetchStatus = React.useCallback(async () => {
    const response = await apiClient.get<SessionStatus>('/session/status');
    applyStatus(response.data);
  }, [applyStatus]);

  const syncActivity = React.useCallback(async (force = false): Promise<boolean> => {
    const now = Date.now();
    if (!force && now - lastSyncAt.current < SYNC_INTERVAL_MS) return true;

    lastSyncAt.current = now;
    setIsSyncing(true);
    try {
      const response = await apiClient.post<SessionStatus>('/session/activity');
      applyStatus(response.data, true);
      return true;
    } catch {
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [applyStatus]);

  React.useEffect(() => {
    void fetchStatus();

    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null;
    channelRef.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'activity' && event.data.status) applyStatus(event.data.status as SessionStatus);
        if (event.data?.type === 'logout' || event.data?.type === 'idle-timeout') {
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
      window.removeEventListener(SESSION_IDLE_TIMEOUT_EVENT, onIdleResponse);
    };
  }, [applyStatus, endSession, fetchStatus]);

  React.useEffect(() => {
    const onMeaningfulActivity = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-session-control]')) return;

      const current = statusRef.current;
      if (current) {
        const optimistic: SessionStatus = {
          ...current,
          last_activity_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + current.timeout_minutes * 60_000).toISOString(),
        };
        applyStatus(optimistic);
      }
      void syncActivity(false);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'popstate'];
    events.forEach((eventName) => window.addEventListener(eventName, onMeaningfulActivity, { passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, onMeaningfulActivity));
  }, [applyStatus, syncActivity]);

  React.useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === 'visible') void fetchStatus();
    };
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('focus', reconcile);
    return () => {
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('focus', reconcile);
    };
  }, [fetchStatus]);

  React.useEffect(() => {
    const update = () => {
      const current = statusRef.current;
      if (!current) return;
      const remaining = Math.max(0, Math.ceil((Date.parse(current.expires_at) - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) endSession();
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [endSession]);

  const warningSeconds = status ? status.warning_minutes * 60 : 0;
  const showWarning = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= warningSeconds;
  const minutes = Math.floor((remainingSeconds ?? 0) / 60);
  const seconds = (remainingSeconds ?? 0) % 60;

  const staySignedIn = async () => {
    if (await syncActivity(true)) setRemainingSeconds(null);
  };

  const logOutNow = async () => {
    await logout();
    broadcastSessionEnd('logout');
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
