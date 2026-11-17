import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ClipboardList, LayoutDashboard, LogOut, RefreshCw, Settings, Users } from 'lucide-react';
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
  LocalAccountCredential,
  LocalBackupSnapshot,
  PersonnelMember,
  SystemSettings,
  TimesheetRecord,
  UserProfile,
  UserRole,
} from './types';
import { BOOTSTRAPPED_ADMIN_EMAIL, DEFAULT_SETTINGS } from './utils/calculations';
import {
  createLocalBackupSnapshot,
  deleteLocalAccount,
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
  const [localAccounts, setLocalAccounts] = useState<LocalAccountCredential[]>([]);
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
    const [locSettings, locPersonnel, locTimesheets, locBackups, locAccounts] = await Promise.all([
      loadLocalSettings(),
      loadLocalPersonnel(),
      loadLocalTimesheets(),
      loadLocalBackups(),
      loadLocalAccounts(),
    ]);
    setSettings(locSettings);
    setPersonnel(locPersonnel);
    setTimesheets(locTimesheets);
    setBackups(locBackups);
    setLocalAccounts(locAccounts);
    return { locSettings, locPersonnel, locTimesheets };
  }, []);

  const syncWithCloud = useCallback(
    async (
      currentUser: UserProfile,
      pushLocal = false
    ): Promise<{ syncedCount: number; syncedAt: string }> => {
      if (currentUser.authMode !== 'google') {
        throw new Error('Vui lòng đăng nhập bằng tài khoản Google để đồng bộ Firestore.');
      }
      if (!navigator.onLine) {
        throw new Error('Thiết bị đang ngoại tuyến. Không thể kết nối tới Firestore.');
      }
      setIsSyncing(true);
      try {
        const isAdminUser =
          currentUser.role === 'admin' ||
          currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

        if (pushLocal) {
          await saveUserProfileCloud(currentUser);
          if (isAdminUser) {
            await saveSystemSettingsCloud(settings);
            for (const member of personnel) {
              await savePersonnelCloud(member);
            }
          }
          for (const ts of timesheets) {
            if (
              isAdminUser ||
              ts.ownerUid === currentUser.uid ||
              ts.teacherEmail.toLowerCase() === currentUser.email.toLowerCase()
            ) {
              await saveTimesheetCloud(ts);
            }
          }
        }

        const [cloudSettings, cloudPersonnel, cloudTimesheets] = await Promise.all([
          fetchSystemSettingsCloud(),
          fetchPersonnelCloud(currentUser.email, isAdminUser),
          fetchTimesheetsCloud(currentUser.uid, currentUser.email, isAdminUser),
        ]);

        let syncedCount = 0;

        if (cloudSettings) {
          setSettings(cloudSettings);
          await saveLocalSettings(cloudSettings);
          syncedCount += 1;
        } else if (isAdminUser) {
          await saveSystemSettingsCloud(settings);
          syncedCount += 1;
        }

        if (cloudPersonnel.length > 0) {
          setPersonnel(cloudPersonnel);
          await saveLocalPersonnelList(cloudPersonnel);
          syncedCount += cloudPersonnel.length;
        }

        if (cloudTimesheets.length > 0) {
          setTimesheets(cloudTimesheets);
          await saveLocalTimesheetsList(cloudTimesheets);
          syncedCount += cloudTimesheets.length;
        }

        return {
          syncedCount,
          syncedAt: new Date().toLocaleTimeString('vi-VN'),
        };
      } finally {
        setIsSyncing(false);
      }
    },
    [settings, personnel, timesheets]
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
          const localSavedRaw = localStorage.getItem(`user_profile_${fbUser.uid}`);
          const localSaved = localSavedRaw ? (JSON.parse(localSavedRaw) as UserProfile) : null;
          const cloudProfile = navigator.onLine ? await fetchUserProfileCloud(fbUser.uid) : localSaved;
          const matchedStaff = locPersonnel.find((p) => p.email.toLowerCase() === emailLower);

          const resolvedRole = isBootAdmin
            ? 'admin'
            : matchedStaff?.role || cloudProfile?.role || 'teacher';

          const mergedProfile: UserProfile = {
            uid: fbUser.uid,
            email: emailLower,
            displayName:
              cloudProfile?.displayName ||
              localSaved?.displayName ||
              matchedStaff?.fullName ||
              fbUser.displayName ||
              emailLower.split('@')[0],
            schoolName:
              cloudProfile?.schoolName ||
              localSaved?.schoolName ||
              matchedStaff?.schoolName ||
              locSettings.schoolName,
            department:
              cloudProfile?.department ||
              localSaved?.department ||
              matchedStaff?.department ||
              'Tổ Thể dục - QP&AN',
            position:
              cloudProfile?.position ||
              localSaved?.position ||
              matchedStaff?.position ||
              (resolvedRole === 'admin'
                ? 'Quản trị viên'
                : resolvedRole === 'leader'
                  ? 'Tổ trưởng chuyên môn'
                  : 'Giáo viên'),
            subject:
              cloudProfile?.subject ||
              localSaved?.subject ||
              matchedStaff?.subject ||
              'Giáo dục Thể chất',
            concurrentRole:
              cloudProfile?.concurrentRole ??
              localSaved?.concurrentRole ??
              matchedStaff?.concurrentRole ??
              '',
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
      void syncWithCloud(user).catch((err) => console.warn('Auto sync warning:', err));
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
    const existingMember = personnel.find((p) => p.id === member.id);
    const existingAcc = localAccounts.find(
      (a) => a.staffId === member.id || (existingMember?.username && a.username === existingMember.username)
    );

    const cleanUsername = member.username?.trim() || '';
    const updatedMember: PersonnelMember = {
      ...member,
      username: cleanUsername || undefined,
    };

    await upsertLocalPersonnel(updatedMember);

    let nextAccounts = [...localAccounts];
    if (cleanUsername) {
      if (newPassword) {
        if (existingAcc && existingAcc.username !== cleanUsername) {
          await deleteLocalAccount(existingAcc.username);
          nextAccounts = nextAccounts.filter((a) => a.username !== existingAcc.username);
        }
        const salt = generateSalt();
        const passwordHash = await hashPassword(newPassword, salt);
        const acc: LocalAccountCredential = {
          username: cleanUsername,
          passwordHash,
          salt,
          staffId: updatedMember.id,
          email: updatedMember.email,
          fullName: updatedMember.fullName,
          role: updatedMember.role,
          department: updatedMember.department,
        };
        await saveLocalAccount(acc);
        nextAccounts = [...nextAccounts.filter((a) => a.username !== cleanUsername), acc];
      } else if (existingAcc) {
        if (existingAcc.username !== cleanUsername) {
          await deleteLocalAccount(existingAcc.username);
          nextAccounts = nextAccounts.filter((a) => a.username !== existingAcc.username);
        }
        const acc: LocalAccountCredential = {
          ...existingAcc,
          username: cleanUsername,
          email: updatedMember.email,
          fullName: updatedMember.fullName,
          role: updatedMember.role,
          department: updatedMember.department,
        };
        await saveLocalAccount(acc);
        nextAccounts = [...nextAccounts.filter((a) => a.username !== cleanUsername), acc];
      }
    } else if (existingAcc) {
      await deleteLocalAccount(existingAcc.username);
      nextAccounts = nextAccounts.filter((a) => a.username !== existingAcc.username);
    }

    setLocalAccounts(nextAccounts);

    const nextList = personnel.some((p) => p.id === updatedMember.id)
      ? personnel.map((p) => (p.id === updatedMember.id ? updatedMember : p))
      : [...personnel, updatedMember];
    setPersonnel(nextList);
    await recordBackupSnapshot(
      `Cập nhật nhân sự ${updatedMember.fullName}`,
      settings,
      nextList,
      timesheets
    );
    if (user?.authMode === 'google' && navigator.onLine) {
      await savePersonnelCloud(updatedMember);
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
    setLocalAccounts(await loadLocalAccounts());
    await recordBackupSnapshot(`Nhập Excel ${items.length} nhân sự`, settings, merged, timesheets);
    if (user?.authMode === 'google' && navigator.onLine) {
      for (const item of merged) {
        await savePersonnelCloud(item);
      }
    }
  };

  const handleDeleteMember = async (id: string) => {
    await deleteLocalPersonnel(id);
    const linkedAccounts = localAccounts.filter((a) => a.staffId === id);
    for (const acc of linkedAccounts) {
      await deleteLocalAccount(acc.username);
    }
    setLocalAccounts(localAccounts.filter((a) => a.staffId !== id));
    const nextList = personnel.filter((p) => p.id !== id);
    setPersonnel(nextList);
    if (user?.authMode === 'google' && navigator.onLine) {
      await deletePersonnelCloud(id);
    }
  };

  const handleUpsertAccount = async (params: {
    oldUsername?: string;
    username: string;
    password?: string;
    staffId?: string;
    email: string;
    fullName: string;
    role: UserRole;
    department: string;
  }) => {
    const cleanUsername = params.username.trim();
    if (!cleanUsername) throw new Error('Tên đăng nhập không được để trống.');

    const conflict = localAccounts.find(
      (a) =>
        a.username.toLowerCase() === cleanUsername.toLowerCase() &&
        a.username.toLowerCase() !== (params.oldUsername || '').toLowerCase()
    );
    if (conflict) {
      throw new Error(`Tên đăng nhập "${cleanUsername}" đã tồn tại.`);
    }

    const existingAcc = params.oldUsername
      ? localAccounts.find((a) => a.username === params.oldUsername)
      : undefined;

    if (!existingAcc && !params.password) {
      throw new Error('Vui lòng nhập mật khẩu cho tài khoản mới.');
    }

    let passwordHash = existingAcc?.passwordHash || '';
    let salt = existingAcc?.salt || '';
    if (params.password) {
      salt = generateSalt();
      passwordHash = await hashPassword(params.password, salt);
    }

    // Find or create linked PersonnelMember
    let targetStaff = personnel.find(
      (p) =>
        (params.staffId && p.id === params.staffId) ||
        (params.email && p.email.toLowerCase() === params.email.toLowerCase())
    );
    const now = new Date().toISOString();
    if (!targetStaff) {
      targetStaff = {
        id: params.staffId || `staff_${Date.now()}`,
        fullName: params.fullName.trim(),
        email: params.email.trim().toLowerCase() || `${cleanUsername}@school.local`,
        username: cleanUsername,
        role: params.role,
        position:
          params.role === 'admin'
            ? 'Quản trị viên'
            : params.role === 'leader'
              ? 'Tổ trưởng chuyên môn'
              : 'Giáo viên',
        department: params.department.trim() || 'Tổ Thể dục - QP&AN',
        schoolName: settings.schoolName,
        subject: 'Giáo dục Thể chất',
        concurrentRole: '',
        classes: [],
        ratePerPeriod: settings.defaultRatePerPeriod,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      targetStaff = {
        ...targetStaff,
        fullName: params.fullName.trim() || targetStaff.fullName,
        email: params.email.trim().toLowerCase() || targetStaff.email,
        username: cleanUsername,
        role: params.role,
        department: params.department.trim() || targetStaff.department,
        updatedAt: now,
      };
    }

    await upsertLocalPersonnel(targetStaff);
    const nextPersonnel = personnel.some((p) => p.id === targetStaff!.id)
      ? personnel.map((p) => (p.id === targetStaff!.id ? targetStaff! : p))
      : [...personnel, targetStaff];
    setPersonnel(nextPersonnel);

    if (params.oldUsername && params.oldUsername !== cleanUsername) {
      await deleteLocalAccount(params.oldUsername);
    }

    const newAcc: LocalAccountCredential = {
      username: cleanUsername,
      passwordHash,
      salt,
      staffId: targetStaff.id,
      email: targetStaff.email,
      fullName: targetStaff.fullName,
      role: targetStaff.role,
      department: targetStaff.department,
    };
    await saveLocalAccount(newAcc);

    const nextAccounts = [
      ...localAccounts.filter(
        (a) => a.username !== params.oldUsername && a.username !== cleanUsername
      ),
      newAcc,
    ];
    setLocalAccounts(nextAccounts);
    await recordBackupSnapshot(`Cập nhật tài khoản ${cleanUsername}`, settings, nextPersonnel, timesheets);
    if (user?.authMode === 'google' && navigator.onLine) {
      await savePersonnelCloud(targetStaff);
    }
  };

  const handleDeleteAccount = async (username: string) => {
    const acc = localAccounts.find((a) => a.username === username);
    await deleteLocalAccount(username);
    setLocalAccounts(localAccounts.filter((a) => a.username !== username));

    if (acc) {
      const targetStaff = personnel.find((p) => p.id === acc.staffId);
      if (targetStaff) {
        const updatedStaff: PersonnelMember = {
          ...targetStaff,
          username: undefined,
          updatedAt: new Date().toISOString(),
        };
        await upsertLocalPersonnel(updatedStaff);
        setPersonnel(personnel.map((p) => (p.id === updatedStaff.id ? updatedStaff : p)));
        if (user?.authMode === 'google' && navigator.onLine) {
          await savePersonnelCloud(updatedStaff);
        }
      }
    }
  };

  const handleSaveProfile = async (profile: UserProfile) => {
    setUser(profile);
    localStorage.setItem(`user_profile_${profile.uid}`, JSON.stringify(profile));
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
      <header className="no-print bg-white border-b border-slate-200 md:sticky md:top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sổ Phụ Cấp Sân Bãi
          </button>

          {/* Zone 2: Clean Text Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
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
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 md:py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 md:py-8">
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
            localAccounts={localAccounts}
            onSaveMember={handleSaveMember}
            onBulkImport={handleBulkImportPersonnel}
            onDeleteMember={handleDeleteMember}
            onUpsertAccount={handleUpsertAccount}
            onDeleteAccount={handleDeleteAccount}
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
            onSyncNow={() => syncWithCloud(user, true)}
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

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Điều hướng chính"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div
          className={`grid ${
            canViewPersonnel ? 'grid-cols-4' : 'grid-cols-3'
          } items-center h-16`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-1 border-t-2 transition-colors cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-emerald-800 text-emerald-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[11px] leading-none whitespace-nowrap">Tổng quan</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTimesheet(null);
              setActiveTab('editor');
            }}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-1 border-t-2 transition-colors cursor-pointer ${
              activeTab === 'editor'
                ? 'border-emerald-800 text-emerald-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[11px] leading-none whitespace-nowrap">Bảng kê</span>
          </button>
          {canViewPersonnel && (
            <button
              type="button"
              onClick={() => setActiveTab('personnel')}
              className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-1 border-t-2 transition-colors cursor-pointer ${
                activeTab === 'personnel'
                  ? 'border-emerald-800 text-emerald-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[11px] leading-none whitespace-nowrap">Nhân sự</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-1 border-t-2 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'border-emerald-800 text-emerald-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] leading-none whitespace-nowrap">Cài đặt</span>
          </button>
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
