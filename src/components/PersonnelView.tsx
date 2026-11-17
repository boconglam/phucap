import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  LocalAccountCredential,
  PersonnelMember,
  SubjectType,
  SystemSettings,
  UserProfile,
  UserRole,
} from '../types';
import {
  calculateAssignedPeriods,
  createSafeId,
  formatVND,
  parseClassesString,
} from '../utils/calculations';
import { downloadPersonnelTemplateExcel, parsePersonnelExcel } from '../utils/exportPdfExcel';

interface PersonnelViewProps {
  user: UserProfile;
  settings: SystemSettings;
  personnel: PersonnelMember[];
  localAccounts: LocalAccountCredential[];
  onSaveMember: (member: PersonnelMember, newPassword?: string) => Promise<void>;
  onBulkImport: (items: Array<{ member: PersonnelMember; initialPassword?: string }>) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onUpsertAccount: (params: {
    oldUsername?: string;
    username: string;
    password?: string;
    staffId?: string;
    email: string;
    fullName: string;
    role: UserRole;
    department: string;
  }) => Promise<void>;
  onDeleteAccount: (username: string) => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  leader: 'Tổ trưởng',
  teacher: 'Giáo viên',
};

interface AccountModalState {
  isEdit: boolean;
  oldUsername?: string;
  staffId?: string;
  fullName: string;
  email: string;
  department: string;
  role: UserRole;
  username: string;
  password: string;
}

export const PersonnelView: React.FC<PersonnelViewProps> = ({
  user,
  settings,
  personnel,
  localAccounts,
  onSaveMember,
  onBulkImport,
  onDeleteMember,
  onUpsertAccount,
  onDeleteAccount,
}) => {
  const isAdmin = user.role === 'admin';
  const [subTab, setSubTab] = useState<'directory' | 'accounts'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  const [editingMember, setEditingMember] = useState<PersonnelMember | null>(null);
  const [classesInput, setClassesInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showMemberPassword, setShowMemberPassword] = useState(false);

  const [accountModal, setAccountModal] = useState<AccountModalState | null>(null);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>();
    personnel.forEach((p) => p.department && set.add(p.department));
    return Array.from(set).sort();
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    return personnel.filter((p) => {
      if (!isAdmin && user.role === 'leader') {
        const sameDept = p.department === user.department;
        const isDirectReport = p.leaderEmail?.toLowerCase() === user.email.toLowerCase();
        const isSelf = p.email.toLowerCase() === user.email.toLowerCase();
        if (!sameDept && !isDirectReport && !isSelf) return false;
      }
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (subjectFilter !== 'all' && p.subject !== subjectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.username || '').toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personnel, isAdmin, user, deptFilter, roleFilter, subjectFilter, searchQuery]);

  const filteredAccounts = useMemo(() => {
    return localAccounts.filter((acc) => {
      if (deptFilter !== 'all' && acc.department !== deptFilter) return false;
      if (roleFilter !== 'all' && acc.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.fullName.toLowerCase().includes(q) ||
          acc.username.toLowerCase().includes(q) ||
          acc.email.toLowerCase().includes(q) ||
          acc.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [localAccounts, deptFilter, roleFilter, searchQuery]);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
    let out = '';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 8; i++) {
      out += chars[arr[i] % chars.length];
    }
    return out;
  };

  const openNewModal = () => {
    const now = new Date().toISOString();
    const blank: PersonnelMember = {
      id: createSafeId('staff'),
      fullName: '',
      email: '',
      leaderEmail: '',
      username: '',
      role: 'teacher',
      position: 'Giáo viên',
      department: user.department || 'Tổ Thể dục - QP&AN',
      schoolName: settings.schoolName,
      subject: 'Giáo dục Thể chất',
      concurrentRole: '',
      classes: [],
      ratePerPeriod: settings.defaultRatePerPeriod,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    setEditingMember(blank);
    setClassesInput('');
    setNewPassword('');
    setShowMemberPassword(false);
    setModalError(null);
  };

  const openEditModal = (m: PersonnelMember) => {
    setEditingMember({ ...m });
    setClassesInput(m.classes.join(', '));
    setNewPassword('');
    setShowMemberPassword(false);
    setModalError(null);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.fullName.trim()) return;
    setModalError(null);

    const existingAcc = localAccounts.find((a) => a.staffId === editingMember.id);
    if (editingMember.username?.trim() && !existingAcc && !newPassword.trim()) {
      setModalError('Vui lòng nhập mật khẩu khởi tạo khi cấp tên đăng nhập mới.');
      return;
    }

    setIsBusy(true);
    setFeedback(null);
    try {
      const updated: PersonnelMember = {
        ...editingMember,
        classes: parseClassesString(classesInput),
        updatedAt: new Date().toISOString(),
      };
      await onSaveMember(updated, newPassword.trim() || undefined);
      setEditingMember(null);
      setFeedback(`Đã lưu thông tin nhân sự ${updated.fullName}.`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Không thể lưu thông tin.');
    } finally {
      setIsBusy(false);
    }
  };

  const openNewAccountModal = () => {
    setModalError(null);
    setShowAccountPassword(true);
    setAccountModal({
      isEdit: false,
      staffId: '',
      fullName: '',
      email: '',
      department: user.department || 'Tổ Thể dục - QP&AN',
      role: 'teacher',
      username: '',
      password: '',
    });
  };

  const openEditAccountModal = (acc: LocalAccountCredential) => {
    setModalError(null);
    setShowAccountPassword(false);
    setAccountModal({
      isEdit: true,
      oldUsername: acc.username,
      staffId: acc.staffId,
      fullName: acc.fullName,
      email: acc.email,
      department: acc.department,
      role: acc.role,
      username: acc.username,
      password: '',
    });
  };

  const handleSelectStaffForAccount = (staffId: string) => {
    if (!accountModal) return;
    const staff = personnel.find((p) => p.id === staffId);
    if (!staff) {
      setAccountModal({ ...accountModal, staffId: '' });
      return;
    }
    setAccountModal({
      ...accountModal,
      staffId: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      department: staff.department,
      role: staff.role,
      username: staff.username || accountModal.username,
    });
  };

  const handleSaveAccountModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountModal) return;
    setModalError(null);
    setIsBusy(true);
    setFeedback(null);
    try {
      await onUpsertAccount({
        oldUsername: accountModal.oldUsername,
        username: accountModal.username,
        password: accountModal.password.trim() || undefined,
        staffId: accountModal.staffId || undefined,
        email: accountModal.email,
        fullName: accountModal.fullName,
        role: accountModal.role,
        department: accountModal.department,
      });
      setAccountModal(null);
      setFeedback(
        accountModal.isEdit
          ? `Đã cập nhật tài khoản "${accountModal.username}"${accountModal.password ? ' và mật khẩu mới' : ''}.`
          : `Đã cấp tài khoản mới "${accountModal.username}" cho ${accountModal.fullName}.`
      );
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Không thể lưu tài khoản.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveAccount = async (acc: LocalAccountCredential) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await onDeleteAccount(acc.username);
      setFeedback(`Đã xóa tài khoản đăng nhập "${acc.username}" của ${acc.fullName}.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      const rows = await parsePersonnelExcel(file, settings);
      if (rows.length === 0) {
        setFeedback('File Excel không có dữ liệu nhân sự hợp lệ.');
      } else {
        await onBulkImport(rows);
        setFeedback(`Đã nhập thành công ${rows.length} nhân sự từ Excel.`);
      }
    } catch (err) {
      setFeedback(
        `Lỗi đọc file Excel: ${err instanceof Error ? err.message : 'Định dạng không hợp lệ'}`
      );
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Quản lý nhân sự, tài khoản &amp; phân quyền truy cập</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {subTab === 'accounts'
              ? 'Quản lý tài khoản & mật khẩu người dùng'
              : 'Danh sách giáo viên giảng dạy ngoài trời'}
          </h1>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
            {subTab === 'directory' ? (
              <>
                <button
                  type="button"
                  onClick={() => downloadPersonnelTemplateExcel(settings)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Tải mẫu Excel</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => void handleImportExcel(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Nhập từ Excel</span>
                </button>

                <button
                  type="button"
                  onClick={openNewModal}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm nhân sự</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openNewAccountModal}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 transition-colors whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Cấp tài khoản mới</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Admin Sub-tabs: Directory vs Accounts & Passwords */}
      {isAdmin && (
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'directory'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Danh sách nhân sự ({personnel.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('accounts')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'accounts'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tài khoản &amp; Mật khẩu ({localAccounts.length})
          </button>
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, email, tên đăng nhập..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
        >
          <option value="all">Tất cả tổ chuyên môn</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
        >
          <option value="all">Tất cả quyền quản lý</option>
          <option value="admin">Quản trị viên</option>
          <option value="leader">Tổ trưởng</option>
          <option value="teacher">Giáo viên</option>
        </select>

        {subTab === 'directory' && (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="all">Tất cả môn dạy</option>
            <option value="Giáo dục Thể chất">Giáo dục Thể chất</option>
            <option value="Giáo dục Quốc phòng An ninh">Giáo dục Quốc phòng An ninh</option>
          </select>
        )}
      </div>

      {/* Tab Content */}
      {subTab === 'directory' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredPersonnel.length === 0 ? (
            <div className="p-12 text-center">
              <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                Chưa có dữ liệu nhân sự phù hợp
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Quản trị viên có thể nhập hàng loạt từ file Excel theo mẫu hoặc thêm giáo viên thủ
                công để cấp quyền truy cập và tự động đồng bộ thông tin.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-3 px-4">Họ và tên</th>
                    <th className="py-3 px-4">Tổ chuyên môn &amp; Chức vụ</th>
                    <th className="py-3 px-4">Môn dạy</th>
                    <th className="py-3 px-4">Lớp phụ trách</th>
                    <th className="py-3 px-4 text-right">Định mức</th>
                    <th className="py-3 px-4 text-right">Đơn giá/tiết</th>
                    <th className="py-3 px-4">Quyền</th>
                    {isAdmin && <th className="py-3 px-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPersonnel.map((m) => {
                    const assigned = calculateAssignedPeriods(m.classes, m.subject);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{m.fullName}</div>
                          <div className="text-xs text-slate-500">
                            {m.email}
                            {m.username ? ` · TK: ${m.username}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800">{m.department}</div>
                          <div className="text-xs text-slate-500">{m.position}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{m.subject}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px]">
                          {m.classes.length > 0 ? m.classes.join(', ') : 'Chưa phân lớp'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">
                          {assigned} tiết/tuần
                        </td>
                        <td className="py-3 px-4 text-right text-slate-800">
                          {formatVND(m.ratePerPeriod)} đ
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-700">
                          {ROLE_LABELS[m.role]}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditModal(m)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline mr-3 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteMember(m.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredAccounts.length === 0 ? (
            <div className="p-12 text-center">
              <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                Chưa có tài khoản riêng nào được cấp
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Quản trị viên có thể cấp mới, sửa tên đăng nhập, đặt lại mật khẩu hoặc xóa tài
                khoản để giáo viên đăng nhập nhanh ngay cả khi ngoại tuyến.
              </p>
              <button
                type="button"
                onClick={openNewAccountModal}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Cấp tài khoản đầu tiên</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-3 px-4">Tên đăng nhập</th>
                    <th className="py-3 px-4">Họ và tên</th>
                    <th className="py-3 px-4">Email liên kết</th>
                    <th className="py-3 px-4">Tổ chuyên môn</th>
                    <th className="py-3 px-4">Quyền hạn</th>
                    <th className="py-3 px-4">Trạng thái đồng bộ</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.username} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                        {acc.username}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{acc.fullName}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{acc.email}</td>
                      <td className="py-3 px-4 text-slate-700">{acc.department}</td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        {ROLE_LABELS[acc.role]}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {acc.credentialKey ? (
                          <span className="text-emerald-800">Đa thiết bị · Đã đồng bộ</span>
                        ) : (
                          <span className="text-amber-700">Chỉ trên máy này · Đặt lại MK để đồng bộ</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditAccountModal(acc)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline mr-3 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa / Đổi MK</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRemoveAccount(acc)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa TK</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Thông tin nhân sự &amp; phân quyền
              </h2>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveModal(e)} className="p-6 overflow-y-auto space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Họ và tên giáo viên *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMember.fullName}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, fullName: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Google (để nhận diện khi đăng nhập) *
                  </label>
                  <input
                    type="email"
                    required
                    value={editingMember.email}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, email: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vai trò phân quyền
                  </label>
                  <select
                    value={editingMember.role}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        role: e.target.value as UserRole,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="leader">Tổ trưởng</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Chức vụ</label>
                  <input
                    type="text"
                    value={editingMember.position}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, position: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tổ chuyên môn
                  </label>
                  <input
                    type="text"
                    value={editingMember.department}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, department: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Môn dạy</label>
                  <select
                    value={editingMember.subject}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        subject: e.target.value as SubjectType,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Giáo dục Thể chất">Giáo dục Thể chất (2 tiết/lớp)</option>
                    <option value="Giáo dục Quốc phòng An ninh">
                      Giáo dục Quốc phòng An ninh (1 tiết/lớp)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Đơn giá / tiết (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={editingMember.ratePerPeriod}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        ratePerPeriod: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Các lớp được phân công (cách nhau bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={classesInput}
                  onChange={(e) => setClassesInput(e.target.value)}
                  placeholder="Ví dụ: 10A9, 10A11, 10A12, 10A13"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kiêm nhiệm
                  </label>
                  <input
                    type="text"
                    value={editingMember.concurrentRole || ''}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, concurrentRole: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Tổ trưởng phụ trách (tùy chọn)
                  </label>
                  <input
                    type="email"
                    value={editingMember.leaderEmail || ''}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, leaderEmail: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Local Private Account Credentials */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <KeyRound className="w-4 h-4 text-emerald-700" />
                    <span>Cấp / sửa tài khoản riêng (đăng nhập cục bộ &amp; ngoại tuyến)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword(generateRandomPassword());
                      setShowMemberPassword(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Tạo mật khẩu ngẫu nhiên</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tên đăng nhập riêng (xóa trắng để thu hồi TK)
                    </label>
                    <input
                      type="text"
                      value={editingMember.username || ''}
                      onChange={(e) =>
                        setEditingMember({ ...editingMember, username: e.target.value })
                      }
                      placeholder="Ví dụ: hieunt"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mật khẩu (để trống nếu giữ nguyên mật khẩu cũ)
                    </label>
                    <div className="relative">
                      <input
                        type={showMemberPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nhập mật khẩu mới..."
                        className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMemberPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label="Hiện/ẩn mật khẩu"
                      >
                        {showMemberPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                >
                  {isBusy ? 'Đang lưu...' : 'Lưu nhân sự'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Create / Edit Account & Password Modal */}
      {accountModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {accountModal.isEdit
                  ? `Chỉnh sửa tài khoản "${accountModal.oldUsername}"`
                  : 'Cấp tài khoản & mật khẩu mới'}
              </h2>
              <button
                type="button"
                onClick={() => setAccountModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveAccountModal(e)} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {modalError}
                </div>
              )}

              {!accountModal.isEdit && personnel.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chọn từ danh sách nhân sự (hoặc nhập mới bên dưới)
                  </label>
                  <select
                    value={accountModal.staffId || ''}
                    onChange={(e) => handleSelectStaffForAccount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">-- Tạo nhân sự mới đồng thời --</option>
                    {personnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Họ và tên *
                  </label>
                  <input
                    type="text"
                    required
                    value={accountModal.fullName}
                    onChange={(e) =>
                      setAccountModal({ ...accountModal, fullName: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={accountModal.email}
                    onChange={(e) => setAccountModal({ ...accountModal, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tổ chuyên môn
                  </label>
                  <input
                    type="text"
                    value={accountModal.department}
                    onChange={(e) =>
                      setAccountModal({ ...accountModal, department: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quyền truy cập
                  </label>
                  <select
                    value={accountModal.role}
                    onChange={(e) =>
                      setAccountModal({ ...accountModal, role: e.target.value as UserRole })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="leader">Tổ trưởng</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tên đăng nhập *
                  </label>
                  <input
                    type="text"
                    required
                    value={accountModal.username}
                    onChange={(e) =>
                      setAccountModal({ ...accountModal, username: e.target.value })
                    }
                    placeholder="Ví dụ: hieunt"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      {accountModal.isEdit ? 'Mật khẩu mới (bỏ trống nếu giữ cũ)' : 'Mật khẩu *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountModal({
                          ...accountModal,
                          password: generateRandomPassword(),
                        });
                        setShowAccountPassword(true);
                      }}
                      className="text-[11px] font-medium text-emerald-800 hover:underline cursor-pointer"
                    >
                      Tạo ngẫu nhiên
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showAccountPassword ? 'text' : 'password'}
                      required={!accountModal.isEdit}
                      value={accountModal.password}
                      onChange={(e) =>
                        setAccountModal({ ...accountModal, password: e.target.value })
                      }
                      placeholder={accountModal.isEdit ? 'Để trống nếu giữ nguyên' : 'Nhập mật khẩu'}
                      className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="Hiện/ẩn mật khẩu"
                    >
                      {showAccountPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAccountModal(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                >
                  {isBusy
                    ? 'Đang lưu...'
                    : accountModal.isEdit
                      ? 'Cập nhật tài khoản'
                      : 'Cấp tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
