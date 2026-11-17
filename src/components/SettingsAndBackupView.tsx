import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  CloudUpload,
  DatabaseBackup,
  Download,
  History,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';
import type {
  LocalBackupSnapshot,
  PersonnelMember,
  SubjectType,
  SystemSettings,
  TimesheetRecord,
  UserProfile,
} from '../types';
import { exportBackupJSON } from '../utils/storage';

interface StatusNotice {
  type: 'success' | 'error';
  message: string;
}

interface SettingsAndBackupViewProps {
  user: UserProfile;
  settings: SystemSettings;
  personnel: PersonnelMember[];
  timesheets: TimesheetRecord[];
  backups: LocalBackupSnapshot[];
  notificationPermission: NotificationPermission;
  onSaveProfile: (profile: UserProfile) => Promise<void>;
  onSaveSettings: (settings: SystemSettings) => Promise<void>;
  onSyncNow: () => Promise<{ syncedCount: number; syncedAt: string }>;
  onRestoreSnapshot: (snapshot: LocalBackupSnapshot) => Promise<void>;
  onImportJsonBackup: (payload: {
    settings?: SystemSettings;
    personnel?: PersonnelMember[];
    timesheets?: TimesheetRecord[];
  }) => Promise<void>;
  onRequestNotifications: () => Promise<NotificationPermission>;
  onSendTestNotification: () => Promise<void>;
}

const InlineStatus: React.FC<{ status: StatusNotice | null }> = ({ status }) => {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        status.type === 'success' ? 'text-emerald-800' : 'text-red-700'
      }`}
    >
      {status.type === 'success' ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      )}
      <span>{status.message}</span>
    </span>
  );
};

export const SettingsAndBackupView: React.FC<SettingsAndBackupViewProps> = ({
  user,
  settings,
  personnel,
  timesheets,
  backups,
  notificationPermission,
  onSaveProfile,
  onSaveSettings,
  onSyncNow,
  onRestoreSnapshot,
  onImportJsonBackup,
  onRequestNotifications,
  onSendTestNotification,
}) => {
  const isAdmin = user.role === 'admin';
  const [profileForm, setProfileForm] = useState<UserProfile>({ ...user });
  const [settingsForm, setSettingsForm] = useState<SystemSettings>({ ...settings });

  const [profileStatus, setProfileStatus] = useState<StatusNotice | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<StatusNotice | null>(null);
  const [syncStatus, setSyncStatus] = useState<StatusNotice | null>(null);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfileForm({ ...user });
  }, [user]);

  useEffect(() => {
    setSettingsForm({ ...settings });
  }, [settings]);

  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileStatus(null);
    try {
      await onSaveProfile({ ...profileForm, updatedAt: new Date().toISOString() });
      const time = new Date().toLocaleTimeString('vi-VN');
      setProfileStatus({
        type: 'success',
        message: `Đã cập nhật hồ sơ cá nhân lúc ${time}.`,
      });
    } catch (err) {
      setProfileStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu hồ sơ cá nhân.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsStatus(null);
    try {
      await onSaveSettings({
        ...settingsForm,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString(),
      });
      const time = new Date().toLocaleTimeString('vi-VN');
      setSettingsStatus({
        type: 'success',
        message: `Đã cập nhật cài đặt hệ thống lúc ${time}.`,
      });
    } catch (err) {
      setSettingsStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể lưu cài đặt hệ thống.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSyncFirestoreClick = async () => {
    setIsSyncingNow(true);
    setSyncStatus(null);
    try {
      const result = await onSyncNow();
      setSyncStatus({
        type: 'success',
        message: `Đã đồng bộ Firestore (${result.syncedCount} mục) lúc ${result.syncedAt}.`,
      });
    } catch (err) {
      setSyncStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể đồng bộ với Firestore.',
      });
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setSyncStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await onImportJsonBackup(parsed);
      setSyncStatus({
        type: 'success',
        message: `Đã phục hồi dữ liệu từ tệp sao lưu JSON lúc ${new Date().toLocaleTimeString('vi-VN')}.`,
      });
    } catch {
      setSyncStatus({
        type: 'error',
        message: 'Tệp sao lưu JSON không hợp lệ.',
      });
    } finally {
      setIsRestoring(false);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const handleRestoreLocalSnapshot = async (bk: LocalBackupSnapshot) => {
    setIsRestoring(true);
    setSyncStatus(null);
    try {
      await onRestoreSnapshot(bk);
      setSyncStatus({
        type: 'success',
        message: `Đã khôi phục dữ liệu về mốc "${bk.reason}".`,
      });
    } catch (err) {
      setSyncStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể khôi phục mốc sao lưu.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-slate-500">Cấu hình tài khoản, lịch năm học &amp; an toàn dữ liệu</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Cài đặt hệ thống &amp; Sao lưu dữ liệu
        </h1>
      </div>

      {/* 1. Personal Account Configuration */}
      <form
        onSubmit={(e) => void handleSaveProfileSubmit(e)}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="pb-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Cấu hình tài khoản giáo viên</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tên trường và tổ chuyên môn sẽ hiển thị tự động trên các bảng kê của bạn
            </p>
          </div>
          <span className="text-xs text-slate-500">{user.email}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Họ và tên hiển thị
            </label>
            <input
              type="text"
              required
              value={profileForm.displayName}
              onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tên trường</label>
            <input
              type="text"
              value={profileForm.schoolName || ''}
              onChange={(e) => setProfileForm({ ...profileForm, schoolName: e.target.value })}
              placeholder={settings.schoolName}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tổ chuyên môn
            </label>
            <input
              type="text"
              value={profileForm.department || ''}
              onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
              placeholder="Ví dụ: Tổ Thể dục - QP&AN"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Chức vụ</label>
            <input
              type="text"
              value={profileForm.position || ''}
              onChange={(e) => setProfileForm({ ...profileForm, position: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Môn dạy chính</label>
            <select
              value={profileForm.subject || 'Giáo dục Thể chất'}
              onChange={(e) =>
                setProfileForm({ ...profileForm, subject: e.target.value as SubjectType })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="Giáo dục Thể chất">Giáo dục Thể chất</option>
              <option value="Giáo dục Quốc phòng An ninh">Giáo dục Quốc phòng An ninh</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kiêm nhiệm</label>
            <input
              type="text"
              value={profileForm.concurrentRole || ''}
              onChange={(e) => setProfileForm({ ...profileForm, concurrentRole: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <InlineStatus status={profileStatus} />
          <button
            type="submit"
            disabled={isSavingProfile}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingProfile ? 'Đang lưu...' : 'Lưu hồ sơ cá nhân'}</span>
          </button>
        </div>
      </form>

      {/* 2. System Settings (Admin) */}
      <form
        onSubmit={(e) => void handleSaveSettingsSubmit(e)}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Cài đặt chung đơn vị &amp; Lịch năm học
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? 'Thay đổi tên cơ quan chủ quản, ngày bắt đầu năm học và ngày vào học sau Tết Nguyên Đán để tự động chia tuần chính xác.'
              : 'Chỉ Quản trị viên mới có quyền chỉnh sửa cấu hình chung của nhà trường.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tên Sở GD&amp;ĐT / Cơ quan chủ quản (dòng trên bảng kê)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              required
              value={settingsForm.agencyName}
              onChange={(e) => setSettingsForm({ ...settingsForm, agencyName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tên trường (áp dụng toàn hệ thống &amp; bảng kê)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              required
              value={settingsForm.schoolName}
              onChange={(e) => setSettingsForm({ ...settingsForm, schoolName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Địa danh ký bảng kê
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={settingsForm.locationName}
              onChange={(e) => setSettingsForm({ ...settingsForm, locationName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Phó Hiệu trưởng duyệt
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={settingsForm.vicePrincipalName}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, vicePrincipalName: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tổ trưởng ký</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={settingsForm.departmentHeadName}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, departmentHeadName: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ngày bắt đầu năm học
            </label>
            <input
              type="date"
              disabled={!isAdmin}
              value={settingsForm.schoolYearStart}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, schoolYearStart: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ngày vào học sau Tết Nguyên Đán
            </label>
            <input
              type="date"
              disabled={!isAdmin}
              value={settingsForm.tetReturnDate}
              onChange={(e) => setSettingsForm({ ...settingsForm, tetReturnDate: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Đơn giá mặc định / tiết (VNĐ)
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              min={0}
              step={100}
              value={settingsForm.defaultRatePerPeriod}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  defaultRatePerPeriod: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ngày nhắc kê khai hàng tháng
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              min={1}
              max={31}
              value={settingsForm.reminderDayOfMonth}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  reminderDayOfMonth: Number(e.target.value) || 25,
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:bg-slate-50"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <InlineStatus status={settingsStatus} />
            <button
              type="submit"
              disabled={isSavingSettings}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingSettings ? 'Đang lưu...' : 'Lưu cài đặt hệ thống'}</span>
            </button>
          </div>
        )}
      </form>

      {/* 3. Push Notifications & Cloud/Local Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Thông báo đẩy &amp; Nhắc nhở định kỳ
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Hệ thống sẽ tự động nhắc nhở vào thứ Sáu hàng tuần và từ ngày{' '}
            <strong>{settings.reminderDayOfMonth}</strong> hàng tháng nếu bảng kê chưa được gửi
            duyệt.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void onRequestNotifications()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
            >
              {notificationPermission === 'granted'
                ? 'Đã bật thông báo đẩy'
                : 'Bật thông báo đẩy trên thiết bị'}
            </button>
            {notificationPermission === 'granted' && (
              <button
                type="button"
                onClick={() => void onSendTestNotification()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Gửi thông báo kiểm tra
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Đồng bộ Firestore &amp; Sao lưu cục bộ
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Mọi chỉnh sửa đều tự động tạo bản sao lưu cục bộ trên IndexedDB và đồng bộ lên Firestore
            khi kết nối mạng với tài khoản Google.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {user.authMode === 'google' && (
              <button
                type="button"
                disabled={isSyncingNow || isRestoring}
                onClick={() => void handleSyncFirestoreClick()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
              >
                {isSyncingNow ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="w-3.5 h-3.5" />
                )}
                <span>{isSyncingNow ? 'Đang đồng bộ...' : 'Đồng bộ Firestore ngay'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => exportBackupJSON(settings, personnel, timesheets)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Tải tệp sao lưu (.json)</span>
            </button>

            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              onChange={(e) => void handleJsonUpload(e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={isRestoring}
              onClick={() => jsonInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-700" />
              <span>Phục hồi từ tệp</span>
            </button>
          </div>

          {syncStatus && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                syncStatus.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <InlineStatus status={syncStatus} />
            </div>
          )}
        </div>
      </div>

      {/* Automatic Local Snapshots */}
      {backups.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Lịch sử bản sao lưu tự động trên thiết bị ({backups.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {backups.slice(0, 6).map((bk) => (
              <div
                key={bk.id}
                className="px-6 py-3 flex items-center justify-between gap-4 text-xs"
              >
                <div>
                  <span className="font-medium text-slate-900">{bk.reason}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-500 tabular-nums">
                    {new Date(bk.createdAt).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-500 tabular-nums">
                    {bk.timesheets.length} bảng kê · {bk.personnel.length} nhân sự
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={() => void handleRestoreLocalSnapshot(bk)}
                  className="font-medium text-emerald-800 hover:underline shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  Khôi phục mốc này
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
