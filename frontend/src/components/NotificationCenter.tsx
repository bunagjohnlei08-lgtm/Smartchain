import { useEffect, useState } from 'react';
import { Bell, CheckCheck, LoaderCircle } from 'lucide-react';
import { useMarkAllNotificationsRead, useNotificationList, type NotificationRecord } from '../lib/notifications';
import { formatNotificationRelativeTime, getNotificationVisual } from '../lib/notificationPresentation';

interface NotificationCenterProps { breadcrumbLabel: string }

function NotificationRow({ notification, last }: { notification: NotificationRecord; last: boolean }) {
  const visual = getNotificationVisual(notification);
  const Icon = visual.Icon;
  return (
    <article role="listitem" className={`flex items-start gap-4 px-5 py-5 md:px-7 md:py-6 ${last ? '' : 'border-b border-slate-200 dark:border-slate-700'}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:h-12 md:w-12 ${visual.tone}`}><Icon className="h-5 w-5 md:h-6 md:w-6" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-base text-slate-900 dark:text-slate-100 ${notification.read_at ? 'font-medium' : 'font-semibold'}`}>{notification.title}</p>
        {notification.message && <p className="mt-1 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.message}</p>}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notification.category ?? 'System'} • {formatNotificationRelativeTime(notification.created_at)}</p>
      </div>
      {!notification.read_at && <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
    </article>
  );
}

export default function NotificationCenter({ breadcrumbLabel }: NotificationCenterProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNotificationList(filter, page);
  const markAllRead = useMarkAllNotificationsRead();
  useEffect(() => setPage(1), [filter]);

  const filterClass = (active: boolean) => `min-h-11 cursor-pointer rounded-xl px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#092635] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${active ? 'bg-[#092635] font-semibold text-white' : 'border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;

  return (
    <div className="w-full space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span>{breadcrumbLabel}</span><span aria-hidden="true">/</span><span className="text-slate-900 dark:text-slate-100">Notifications</span></div>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl dark:text-white">Notification Center</h1>
          {isLoading ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Loading notifications…</p> : <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{data?.unread_count ?? 0} unread of {data?.total ?? 0} notifications</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Notification filters">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={filterClass(filter === 'all')}>All</button>
          <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')} className={`inline-flex items-center gap-2 ${filterClass(filter === 'unread')}`}>Unread <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">{data?.unread_count ?? 0}</span></button>
          <button type="button" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending || (data?.unread_count ?? 0) === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors enabled:cursor-pointer enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#092635] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:enabled:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900"><CheckCheck className="h-4 w-4" aria-hidden="true" />{markAllRead.isPending ? 'Marking…' : 'Mark all read'}</button>
        </div>
      </header>

      {markAllRead.isError && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">Unable to mark notifications as read. Please try again.</div>}

      <section aria-labelledby="notification-list-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 id="notification-list-heading" className="sr-only">Notifications</h2>
        {isLoading && <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading notifications…</div>}
        {isError && <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><p className="text-sm text-rose-600 dark:text-rose-300">Unable to load notifications.</p><button type="button" onClick={() => refetch()} className="mt-3 min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-medium dark:border-slate-600">Try again</button></div>}
        {!isLoading && !isError && data?.data.length === 0 && <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400"><Bell className="h-7 w-7" aria-hidden="true" /></span><h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{filter === 'unread' ? "You're all caught up." : 'New activity and system updates will appear here.'}</p></div>}
        {!isLoading && !isError && data && data.data.length > 0 && <div role="list">{data.data.map((notification, index) => <NotificationRow key={notification.id} notification={notification} last={index === data.data.length - 1} />)}</div>}
      </section>

      {data && data.meta.last_page > 1 && <nav aria-label="Notification pages" className="flex items-center justify-end gap-3 text-sm text-slate-600 dark:text-slate-300"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700">Previous</button><span>Page {data.meta.current_page} of {data.meta.last_page}</span><button type="button" disabled={page >= data.meta.last_page} onClick={() => setPage((value) => value + 1)} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700">Next</button></nav>}
    </div>
  );
}
