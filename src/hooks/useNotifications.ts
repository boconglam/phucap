import { useCallback, useEffect, useState } from 'react';
import type { SystemSettings, TimesheetRecord } from '../types';

export interface AppReminder {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
}

export function useNotifications(
  settings: SystemSettings,
  timesheets: TimesheetRecord[],
  currentStaffId?: string
) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [reminders, setReminders] = useState<AppReminder[]>([]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const sendPushNotification = useCallback(
    async (title: string, body: string) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'outdoor-allowance-reminder',
            });
            return;
          }
        }
        new Notification(title, { body, icon: '/pwa-192x192.png' });
      } catch (err) {
        console.warn('Không thể gửi thông báo đẩy:', err);
      }
    },
    []
  );

  useEffect(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const day = now.getDate();
    const isFriday = now.getDay() === 5;
    const nextReminders: AppReminder[] = [];

    const currentMonthSheet = timesheets.find(
      (t) =>
        t.month === month &&
        t.year === year &&
        (!currentStaffId || t.staffId === currentStaffId)
    );

    if (day >= settings.reminderDayOfMonth) {
      if (!currentMonthSheet) {
        nextReminders.push({
          id: `missing-${year}-${month}`,
          title: `Nhắc nhở kê khai tháng ${month}/${year}`,
          body: `Đã đến ngày ${day}/${month} (hạn nhắc ngày ${settings.reminderDayOfMonth}). Bạn chưa tạo bảng kê phụ cấp tháng ${month}.`,
          urgent: true,
        });
      } else if (currentMonthSheet.status === 'draft') {
        nextReminders.push({
          id: `draft-${year}-${month}`,
          title: `Bảng kê tháng ${month}/${year} đang ở trạng thái Nháp`,
          body: `Vui lòng kiểm tra số tiết thực dạy và gửi duyệt bảng kê phụ cấp trước cuối tháng.`,
          urgent: true,
        });
      }
    }

    if (isFriday) {
      nextReminders.push({
        id: `weekly-${now.toISOString().slice(0, 10)}`,
        title: 'Cập nhật tiết dạy cuối tuần',
        body: 'Hôm nay là thứ Sáu, hãy cập nhật số tiết nghỉ/thực dạy trong tuần để số liệu cuối tháng luôn chính xác.',
        urgent: false,
      });
    }

    setReminders(nextReminders);

    // Fire one periodic push notification per day if permission is granted and an urgent reminder exists
    const urgent = nextReminders.find((r) => r.urgent);
    if (urgent && permission === 'granted') {
      const storageKey = `last_push_${urgent.id}_${now.toISOString().slice(0, 10)}`;
      if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, '1');
        void sendPushNotification(urgent.title, urgent.body);
      }
    }
  }, [settings.reminderDayOfMonth, timesheets, currentStaffId, permission, sendPushNotification]);

  return {
    permission,
    reminders,
    requestPermission,
    sendPushNotification,
  };
}
