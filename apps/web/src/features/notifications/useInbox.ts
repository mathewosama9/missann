import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NOTIF_POLL_MS } from '@miss-ann/shared';
import { toast } from '../../components/ui/notify';
import { apiErrorMessage } from '../../lib/api';
import { inboxKeys, notificationsApi } from './api';

// عدّاد غير المقروء: استطلاع كل دقيقة (يتوقف والتبويب في الخلفية) + تحديث عند العودة للتبويب
export function useUnreadCount() {
  return useQuery({
    queryKey: inboxKeys.unread,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: NOTIF_POLL_MS,
    refetchOnWindowFocus: true,
    // استعلام index-only رخيص ← العودة للتبويب تحدّثه دائماً تقريباً
    staleTime: 5_000,
  });
}

// أي قراءة تُبطل كل ما يخص الصندوق (العدّاد، الجرس، الصفحة)
function useInboxMutation<V>(fn: (v: V) => Promise<unknown>, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.all });
      onDone?.();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
}

export const useMarkRead = () => useInboxMutation((id: number) => notificationsApi.read(id));

export const useMarkAllRead = () =>
  useInboxMutation(() => notificationsApi.readAll(), () => toast.success('تم تحديد الكل كمقروء'));
