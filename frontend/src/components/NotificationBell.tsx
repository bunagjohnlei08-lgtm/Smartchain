import { useEffect, useRef, useState } from 'react';
import { Bell, LoaderCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarkNotificationRead, useRecentNotifications } from '../lib/notifications';
import { formatNotificationRelativeTime, getNotificationVisual } from '../lib/notificationPresentation';
import { getNotificationDestination } from '../lib/notificationDestination';
import { readStoredUser } from '../lib/authUser';

interface NotificationBellProps { viewAllPath: string }

export default function NotificationBell({ viewAllPath }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const role = readStoredUser()?.role?.slug || sessionStorage.getItem('userRole');
  const { data, isLoading, isError, refetch } = useRecentNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const unreadCount = data?.unread_count ?? 0;
  const badgeLabel = unreadCount >= 10 ? '9+' : String(unreadCount);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => {
            if (!value) void refetch();
            return !value;
          });
        }}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      >
        <Bell size={20} />
        {unreadCount > 0 && <span aria-hidden="true" className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white dark:ring-[#090d16]">{badgeLabel}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Recent notifications" className="fixed right-3 top-16 z-50 w-[calc(100vw-1.5rem)] max-w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] dark:border-slate-700 dark:bg-slate-800 dark:text-white">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{unreadCount} unread</p>
          </div>
          <div className="max-h-[min(24rem,calc(100vh-9rem))] overflow-y-auto">
            {isLoading && <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500 dark:text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading notifications…</div>}
            {isError && <p className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-300">Unable to load notifications.</p>}
            {!isLoading && !isError && data?.data.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No notifications yet</p>}
            {data?.data.map((notification) => {
              const visual = getNotificationVisual(notification);
              const Icon = visual.Icon;
              const destination = getNotificationDestination(notification, role);
              const rowClassName = 'flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-700';
              const content = (
                <>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${visual.tone}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm leading-5 text-slate-900 dark:text-slate-100 ${notification.read_at ? 'font-medium' : 'font-semibold'}`}>{notification.title}</p>
                    {notification.message && <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{notification.message}</p>}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notification.category ?? 'System'} • {formatNotificationRelativeTime(notification.created_at)}</p>
                  </div>
                  {!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
                </>
              );
              return destination ? (
                <Link key={notification.id} to={destination} onClick={() => { markNotificationRead(notification); setOpen(false); }} className={`${rowClassName} relative isolate cursor-pointer
                  before:pointer-events-none before:absolute before:inset-2 before:-z-10 before:rounded-lg before:shadow-[color:var(--shadow-color-light)]
                  before:transition-[background-color,box-shadow] before:duration-150 motion-reduce:before:transition-none
                  hover:before:bg-slate-50 hover:before:shadow-sm dark:hover:before:bg-slate-700
                  focus-visible:before:bg-slate-50 focus-visible:before:shadow-sm dark:focus-visible:before:bg-slate-700
                  active:before:bg-slate-100 active:before:shadow-none dark:active:before:bg-slate-600
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500`}>
                  {content}
                </Link>
              ) : (
                <article key={notification.id} className={rowClassName}>{content}</article>
              );
            })}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate(viewAllPath); }} className="min-h-11 w-full cursor-pointer border-t border-slate-200 px-4 py-3 text-sm font-semibold text-cyan-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 dark:border-slate-700 dark:text-cyan-400 dark:hover:bg-slate-700">View all</button>
        </div>
      )}
    </div>
  );
}
