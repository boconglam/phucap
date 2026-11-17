import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { LogOut, RefreshCw } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PersonnelView } from './components/PersonnelView';
import { SettingsAndBackupView } from './components/SettingsAndBackupView';
import { TimesheetEditorView } from './components/TimesheetEditorView';
import { auth, googleProvider } from './firebase';
import { useNotifications } from './hooks/useNotifications';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  deletePersonnelCloud,
  deleteTimesheetCloud,
  fetchPersonnelCloud,
  fetchSystemSettingsCloud,
  fetchTimesheetsCloud,
  fetchUserProfileCloud,
  savePersonnelCloud,
  saveSystemSettingsCloud,
  saveTimesheetCloud,
  saveUserProfileCloud,
} from './services/firestoreSync';
import type {
  LocalBackupSnapshot,
  PersonnelMember,
  SystemSettings,
  TimesheetRecord,
  UserProfile,
} from './types';
import { BOOTSTRAPPED_ADMIN_EMAIL, DEFAULT_SETTINGS } from './utils/calculations';
import {
  createLocalBackupSnapshot,
  deleteLocalPersonnel,
  deleteLocalTimesheet,
  generateSalt,
  hashPassword,
  loadLocalAccounts,
  loadLocalBackups,
  loadLocalPersonnel,
  loadLocalSettings,
  loadLocalTimesheets,
  saveLocalAccount,
  saveLocalPersonnelList,
  saveLocalSettings,
  saveLocalTimesheetsList,
  upsertLocalPersonnel,
  upsertLocalTimesheet,
} from './utils/storage';

type ActiveTab = 'dashboard' | 'editor' | 'personnel' | 'settings';

export default function App() {
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [personnel, setPersonnel] = useState<PersonnelMember[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetRecord[]>([]);
  const [backups, setBackups] = useState<LocalBackupSnapshot[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const { permission, reminders, requestPermission, sendPushNotification } = useNotifications(
    settings,
    timesheets,
    user?.staffId
  );

  // Load local offline data on mount
  const loadLocalCache = useCallback(async () => {
    const [locSettings, locPersonnel, locTimesheets, locBackups] = await Promise.all([
      loadLocalSettings(),
      loadLocalPersonnel(),
      loadLocalTimesheets(),
      loadLocalBackups(),
    ]);
    setSettings(locSettings);
    setPersonnel(locPersonnel);
    setTimesheets(locTimesheets);
    setBackups(locBackups);
    return { locSettings, locPersonnel, locTimesheets };
  }, []);

  const syncWithCloud = useCallback(
    async (currentUser: UserProfile) => {
      if (currentUser.authMode !== 'google' || !navigator.onLine) return;
      setIsSyncing(true);
      try {
        const isAdminUser =
          currentUser.role === 'admin' ||
          currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

        const [cloudSettings, cloudPersonnel, cloudTimesheets] = await Promise.all([
          fetchSystemSettingsCloud(),
          fetchPersonnelCloud(currentUser.email, isAdminUser),
          fetchTimesheetsCloud(currentUser.uid, currentUser.email, isAdminUser),
        ]);

        if (cloudSettings) {
          setSettings(cloudSettings);
          await saveLocalSettings(cloudSettings);
        } else if (isAdminUser) {
          await saveSystemSettingsCloud(settings);
        }

        if (cloudPersonnel.length > 0) {
          setPersonnel(cloudPersonnel);
          await saveLocalPersonnelList(cloudPersonnel);
        }

        if (cloudTimesheets.length > 0) {
          setTimesheets(cloudTimesheets);
          await saveLocalTimesheetsList(cloudTimesheets);
        }
      } catch (err) {
        console.warn('Cloud sync warning:', err);
      } finally {
        setIsSyncing(false);
      }
    },
    [settings]
  );

  // Watch Firebase Auth state
  useEffect(() => {
    let mounted = true;
    void loadLocalCache().then(({ locSettings, locPersonnel }) => {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!mounted) return;
        if (!fbUser || !fbUser.email) {
          // Preserve local session if user signed in via local account
          const savedLocalSession = sessionStorage.getItem('local_user_session');
          if (savedLocalSession) {
            try {
              setUser(JSON.parse(savedLocalSession) as UserProfile);
            } catch {
              setUser(null);
            }
          } else {
            setUser(null);
          }
          setAuthReady(true);
          return;
        }

        const emailLower = fbUser.email.toLowerCase();
        const isBootAdmin = emailLower === BOOTSTRAPPED_ADMIN_EMAIL;

        try {
          let cloudProfile = navigator.onLine ? await fetchUserProfileCloud(fbUser.uid) : null;
          const matchedStaff = locPersonnel.find((p) => p.email.toLowerCase() === emailLower);

          const resolvedRole = isBootAdmin
            ? 'admin'
            : matchedStaff?.role || cloudProfile?.role || 'teacher';

          const mergedProfile: UserProfile = {
            uid: fbUser.uid,
            email: emailLower,
            displayName:
              matchedStaff?.fullName ||
              cloudProfile?.displayName ||
              fbUser.displayName ||
              emailLower.split('@')[0],
            schoolName:
              cloudProfile?.schoolName || matchedStaff?.schoolName || locSettings.schoolName,
            department:
              cloudProfile?.department || matchedStaff?.department || 'Tổ Thể dục - QP&AN',
            position:
              matchedStaff?.position ||
              cloudProfile?.position ||
              (resolvedRole === 'admin'
                ? 'Quản trị viên'
                : resolvedRole === 'leader'
                  ? 'Tổ trưởng chuyên môn'
                  : 'Giáo viên'),
            subject: matchedStaff?.subject || cloudProfile?.subject || 'Giáo dục Thể chất',
            concurrentRole: matchedStaff?.concurrentRole || cloudProfile?.concurrentRole || '',
            staffId: matchedStaff?.id || cloudProfile?.staffId || fbUser.uid,
            role: resolvedRole,
            authMode: 'google',
            updatedAt: new Date().toISOString(),
          };

          if (!cloudProfile && navigator.onLine) {
            await saveUserProfileCloud(mergedProfile);
          }

          setUser(mergedProfile);
          await syncWithCloud(mergedProfile);
        } catch (err) {
          console.error('Auth hydration error:', err);
          setAuthError(err instanceof Error ? err.message : 'Lỗi xác thực tài khoản.');
        } finally {
          setAuthReady(true);
        }
      });
      return unsubscribe;
    });

    return () => {
      mounted = false;
    };
  }, [loadLocalCache]);

  // Re-sync automatically when coming back online
  useEffect(() => {
    if (isOnline && user?.authMode === 'google') {
      void syncWithCloud(user);
    }
  }, [isOnline, user]);

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      sessionStorage.removeItem('local_user_session');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google. Vui lòng thử lại.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLocalLogin = async (usernameInput: string, passwordInput: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const accounts = await loadLocalAccounts();
      const target = accounts.find(
        (a) =>
          a.username.toLowerCase() === usernameInput.toLowerCase() ||
          a.email.toLowerCase() === usernameInput.toLowerCase()
      );
      if (!target) {
        setAuthError(
          'Không tìm thấy tài khoản nội bộ trên thiết bị này. Vui lòng liên hệ Quản trị viên hoặc đăng nhập bằng Google.'
        );
        return;
      }
      const computedHash = await hashPassword(passwordInput, target.salt);
      if (computedHash !== target.passwordHash) {
        setAuthError('Mật khẩu không chính xác.');
        return;
      }

      const locPersonnel = await loadLocalPersonnel();
      const staff = locPersonnel.find((p) => p.id === target.staffId);
      const localProfile: UserProfile = {
        uid: target.staffId,
        email: target.email,
        displayName: staff?.fullName || target.fullName,
        schoolName: staff?.schoolName || settings.schoolName,
        department: staff?.department || target.department,
        position: staff?.position || 'Giáo viên',
        subject: staff?.subject || 'Giáo dục Thể chất',
        concurrentRole: staff?.concurrentRole || '',
        staffId: target.staffId,
        role: staff?.role || target.role,
        authMode: 'local',
        updatedAt: new Date().toISOString(),
      };
      sessionStorage.setItem('local_user_session', JSON.stringify(localProfile));
      setUser(localProfile);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('local_user_session');
    if (auth.currentUser) {
      await signOut(auth);
    }
    setUser(null);
    setActiveTab('dashboard');
    setEditingTimesheet(null);
  };

  const recordBackupSnapshot = async (
    reason: string,
    nextSettings: SystemSettings,
    nextPersonnel: PersonnelMember[],
    nextTimesheets: TimesheetRecord[]
  ) => {
    await createLocalBackupSnapshot(reason, nextSettings, nextPersonnel, nextTimesheets);
    const updatedBackups = await loadLocalBackups();
    setBackups(updatedBackups);
  };

  const handleSaveTimesheet = async (ts: TimesheetRecord) => {
    await upsertLocalTimesheet(ts);
    const nextList = timesheets.some((t) => t.id === ts.id)
      ? timesheets.map((t) => (t.id === ts.id ? ts : t))
      : [ts, ...timesheets];
    setTimesheets(nextList);
    await recordBackupSnapshot(
      `Lưu bảng kê ${ts.teacherName} (T${ts.month}/${ts.year})`,
      settings,
      personnel,
      nextList
    );
    if (user?.authMode === 'google' && navigator.onLine) {
      await saveTimesheetCloud(ts);
    }
  };

  const handleDeleteTimesheet = async (id: string) => {
    await deleteLocalTimesheet(id);
    const nextList = timesheets.filter((t) => t.id !== id);
    setTimesheets(nextList);
    if (user?.authMode === 'google' && navigator.onLine) {
      await deleteTimesheetCloud(id);
    }
    setEditingTimesheet(null);
    setActiveTab('dashboard');
  };

  const handleSaveMember = async (member: PersonnelMember, newPassword?: string) => {
    await upsertLocalPersonnel(member);
    if (member.username && newPassword) {
      const salt = generateSalt();
      const passwordHash = await hashPassword(newPassword, salt);
      await saveLocalAccount({
        username: member.username,
        passwordHash,
        salt,
        staffId: member.id,
        email: member.email,
        fullName: member.fullName,
        role: member.role,
        department: member.department,
      });
    }
    const nextList = personnel.some((p) => p.id === member.id)
      ? personnel.map((p) => (p.id === member.id ? member : p))
      : [...personnel, member];
    setPersonnel(nextList);
    await recordBackupSnapshot(`Cập nhật nhân sự ${member.fullName}`, settings, nextList, timesheets);
    if (user?.authMode === 'google' && navigator.onLine) {
      await savePersonnelCloud(member);
    }
  };

  const handleBulkImportPersonnel = async (
    items: Array<{ member: PersonnelMember; initialPassword?: string }>
  ) => {
    const merged = [...personnel];
    for (const { member, initialPassword } of items) {
      const idx = merged.findIndex(
        (p) => p.email.toLowerCase() === member.email.toLowerCase() && p.email !== ''
      );
      if (idx >= 0) {
        merged[idx] = { ...member, id: merged[idx].id };
      } else {
        merged.push(member);
      }
      if (member.username && initialPassword) {
        const salt = generateSalt();
        const passwordHash = await hashPassword(initialPassword, salt);
        await saveLocalAccount({
          username: member.username,
          passwordHash,
          salt,
          staffId: idx >= 0 ? merged[idx].id : member.id,
          email: member.email,
          fullName: member.fullName,
          role: member.role,
          department: member.department,
        });
      }
    }
    await saveLocalPersonnelList(merged);
    setPersonnel(merged);
    await recordBackupSnapshot(`Nhập Excel ${items.length} nhân sự`, settings, merged, timesheets);
    if (user?.authMode === 'google' && navigator.onLine) {
      for (const item of merged) {
        await savePersonnelCloud(item);
      }
    }
  };

  const handleDeleteMember = async (id: string) => {
    await deleteLocalPersonnel(id);
    const nextList = personnel.filter((p) => p.id !== id);
    setPersonnel(nextList);
    if (user?.authMode === 'google' && navigator.onLine) {
      await deletePersonnelCloud(id);
    }
  };

  const handleSaveProfile = async (profile: UserProfile) => {
    setUser(profile);
    if (profile.authMode === 'local') {
      sessionStorage.setItem('local_user_session', JSON.stringify(profile));
    } else if (navigator.onLine) {
      await saveUserProfileCloud(profile);
    }
  };

  const handleSaveSettings = async (nextSettings: SystemSettings) => {
    setSettings(nextSettings);
    await saveLocalSettings(nextSettings);
    await recordBackupSnapshot('Cập nhật cài đặt hệ thống', nextSettings, personnel, timesheets);
    if (user?.authMode === 'google' && navigator.onLine) {
      await saveSystemSettingsCloud(nextSettings);
    }
  };

  const handleRestoreSnapshot = async (snapshot: LocalBackupSnapshot) => {
    setSettings(snapshot.settings);
    setPersonnel(snapshot.personnel);
    setTimesheets(snapshot.timesheets);
    await Promise.all([
      saveLocalSettings(snapshot.settings),
      saveLocalPersonnelList(snapshot.personnel),
      saveLocalTimesheetsList(snapshot.timesheets),
    ]);
    if (user?.authMode === 'google' && navigator.onLine) {
      await saveSystemSettingsCloud(snapshot.settings);
      for (const m of snapshot.personnel) await savePersonnelCloud(m);
      for (const t of snapshot.timesheets) await saveTimesheetCloud(t);
    }
  };

  const handleImportJsonBackup = async (payload: {
    settings?: SystemSettings;
    personnel?: PersonnelMember[];
    timesheets?: TimesheetRecord[];
  }) => {
    const nextSettings = payload.settings ?? settings;
    const nextPersonnel = payload.personnel ?? personnel;
    const nextTimesheets = payload.timesheets ?? timesheets;
    setSettings(nextSettings);
    setPersonnel(nextPersonnel);
    setTimesheets(nextTimesheets);
    await Promise.all([
      saveLocalSettings(nextSettings),
      saveLocalPersonnelList(nextPersonnel),
      saveLocalTimesheetsList(nextTimesheets),
    ]);
    await recordBackupSnapshot('Khôi phục từ tệp JSON', nextSettings, nextPersonnel, nextTimesheets);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Đang khởi tạo dữ liệu ứng dụng...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          schoolName={settings.schoolName}
          agencyName={settings.agencyName}
          onGoogleLogin={handleGoogleLogin}
          onLocalLogin={handleLocalLogin}
          authError={authError}
          isLoading={authLoading}
        />
        <OfflineIndicator />
      </>
    );
  }

  const canViewPersonnel = user.role === 'admin' || user.role === 'leader';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sổ Phụ Cấp Sân Bãi
          </button>

          {/* Zone 2: Clean Text Nav Links */}
          <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'border-emerald-800 text-emerald-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Tổng quan
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTimesheet(null);
                setActiveTab('editor');
              }}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'editor'
                  ? 'border-emerald-800 text-emerald-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Kê khai bảng kê
            </button>
            {canViewPersonnel && (
              <button
                type="button"
                onClick={() => setActiveTab('personnel')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'personnel'
                    ? 'border-emerald-800 text-emerald-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Nhân sự
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-emerald-800 text-emerald-900 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Cài đặt &amp; Sao lưu
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Logged-in Staff Identity Sub-bar */}
      <div className="no-print bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{user.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>{user.position || 'Giáo viên'}</span>
            <span aria-hidden="true">·</span>
            <span>{user.department || 'Tổ Thể dục - QP&AN'}</span>
            <span aria-hidden="true">·</span>
            <span>{user.schoolName || settings.schoolName}</span>
          </div>
          <div className="flex items-center gap-3">
            {isSyncing && (
              <span className="inline-flex items-center gap-1.5 text-emerald-800">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang đồng bộ...</span>
              </span>
            )}
            <PWAInstallButton compact />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            user={user}
            settings={settings}
            timesheets={timesheets}
            personnel={personnel}
            reminders={reminders}
            onCreateNew={() => {
              setEditingTimesheet(null);
              setActiveTab('editor');
            }}
            onSelectTimesheet={(ts) => {
              setEditingTimesheet(ts);
              setActiveTab('editor');
            }}
          />
        )}

        {activeTab === 'editor' && (
          <TimesheetEditorView
            user={user}
            settings={settings}
            personnel={personnel}
            initialTimesheet={editingTimesheet}
            existingTimesheets={timesheets}
            onSave={handleSaveTimesheet}
            onDelete={handleDeleteTimesheet}
            onBack={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'personnel' && canViewPersonnel && (
          <PersonnelView
            user={user}
            settings={settings}
            personnel={personnel}
            onSaveMember={handleSaveMember}
            onBulkImport={handleBulkImportPersonnel}
            onDeleteMember={handleDeleteMember}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsAndBackupView
            user={user}
            settings={settings}
            personnel={personnel}
            timesheets={timesheets}
            backups={backups}
            notificationPermission={permission}
            onSaveProfile={handleSaveProfile}
            onSaveSettings={handleSaveSettings}
            onSyncNow={() => syncWithCloud(user)}
            onRestoreSnapshot={handleRestoreSnapshot}
            onImportJsonBackup={handleImportJsonBackup}
            onRequestNotifications={requestPermission}
            onSendTestNotification={() =>
              sendPushNotification(
                'Nhắc nhở kê khai phụ cấp sân bãi',
                'Hệ thống thông báo đẩy hoạt động bình thường. Hãy cập nhật số tiết thực dạy hàng tuần.'
              )
            }
          />
        )}
      </main>

      <OfflineIndicator />
    </div>
  );
}
