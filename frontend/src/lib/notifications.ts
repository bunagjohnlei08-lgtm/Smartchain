import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  reference_id: string;
  category: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  data: NotificationRecord[];
  total: number;
  unread_count: number;
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface RecentNotifications {
  data: NotificationRecord[];
  unread_count: number;
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filter: 'all' | 'unread', page: number) => ['notifications', 'list', filter, page] as const,
  recent: ['notifications', 'recent'] as const,
};

export function useNotificationList(filter: 'all' | 'unread', page: number) {
  return useQuery({
    queryKey: notificationKeys.list(filter, page),
    queryFn: async () => (await apiClient.get<NotificationPage>('/notifications', { params: { filter, page, per_page: 15 } })).data,
  });
}

export function useRecentNotifications() {
  return useQuery({
    queryKey: notificationKeys.recent,
    queryFn: async () => (await apiClient.get<RecentNotifications>('/notifications/recent')).data,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const pendingIds = useRef(new Set<string>());
  const mutation = useMutation({
    mutationFn: async (id: string) => (
      await apiClient.put<{ id: string; read_at: string; unread_count: number }>(`/notifications/${encodeURIComponent(id)}/read`)
    ).data,
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.recent });
      queryClient.setQueryData<RecentNotifications>(notificationKeys.recent, (current) => current && ({
        ...current,
        unread_count: result.unread_count,
        data: current.data.map((notification) => notification.id === result.id
          ? { ...notification, read_at: result.read_at }
          : notification),
      }));
    },
    onSettled: async (_data, _error, id) => {
      try {
        await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      } finally {
        pendingIds.current.delete(id);
      }
    },
  });

  return (notification: NotificationRecord) => {
    const cached = queryClient.getQueryData<RecentNotifications>(notificationKeys.recent);
    if (notification.read_at || pendingIds.current.has(notification.id)
      || cached?.data.find((item) => item.id === notification.id)?.read_at) return;

    pendingIds.current.add(notification.id);
    mutation.mutate(notification.id);
  };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.put<{ unread_count: number }>('/notifications/read-all'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
