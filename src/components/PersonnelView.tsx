import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  FileSpreadsheet,
  KeyRound,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
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
  onSaveMember: (member: PersonnelMember, newPassword?: string) => Promise<void>;
  onBulkImport: (items: Array<{ member: PersonnelMember; initialPassword?: string }>) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  leader: 'Tổ trưởng',
  teacher: 'Giáo viên',
};

export const PersonnelView: React.FC<PersonnelViewProps> = ({
  user,
  settings,
  personnel,
  onSaveMember,
  onBulkImport,
  onDeleteMember,
}) => {
  const isAdmin = user.role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  const [editingMember, setEditingMember] = useState<PersonnelMember | null>(null);
  const [classesInput, setClassesInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
  };

  const openEditModal = (m: PersonnelMember) => {
    setEditingMember({ ...m });
    setClassesInput(m.classes.join(', '));
    setNewPassword('');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.fullName.trim()) return;
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
          <p className="text-xs text-slate-500">Quản lý nhân sự &amp; phân quyền truy cập</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Danh sách giáo viên giảng dạy ngoài trời
          </h1>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
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
          </div>
        )}
      </div>

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

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
        >
          <option value="all">Tất cả môn dạy</option>
          <option value="Giáo dục Thể chất">Giáo dục Thể chất</option>
          <option value="Giáo dục Quốc phòng An ninh">Giáo dục Quốc phòng An ninh</option>
        </select>
      </div>

      {/* Directory Table */}
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

      {/* Add / Edit Modal */}
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
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-3">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  <span>Cấp tài khoản riêng (đăng nhập cục bộ &amp; ngoại tuyến)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tên đăng nhập riêng
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
                      Mật khẩu (để trống nếu giữ nguyên)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
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
    </div>
  );
};
