import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type {
  PersonnelMember,
  SubjectType,
  SystemSettings,
  TimesheetRecord,
  UserProfile,
} from '../types';
import {
  calculateAssignedPeriods,
  createSafeId,
  formatVND,
  generateWeeksForMonth,
  getDeclarationDate,
  getLastDayOfMonth,
  getPeriodsPerClass,
  parseClassesString,
  recalculateTimesheet,
} from '../utils/calculations';
import { exportElementToPDF, exportTimesheetToExcel } from '../utils/exportPdfExcel';
import { OfficialTimesheetPrint } from './OfficialTimesheetPrint';

interface TimesheetEditorViewProps {
  user: UserProfile;
  settings: SystemSettings;
  personnel: PersonnelMember[];
  initialTimesheet: TimesheetRecord | null;
  existingTimesheets: TimesheetRecord[];
  onSave: (ts: TimesheetRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
}

export const TimesheetEditorView: React.FC<TimesheetEditorViewProps> = ({
  user,
  settings,
  personnel,
  initialTimesheet,
  existingTimesheets,
  onSave,
  onDelete,
  onBack,
}) => {
  const canManageOthers = user.role === 'admin' || user.role === 'leader';

  const visiblePersonnel = useMemo(() => {
    if (user.role === 'admin') return personnel;
    if (user.role === 'leader') {
      return personnel.filter(
        (p) =>
          p.department === user.department ||
          p.leaderEmail?.toLowerCase() === user.email.toLowerCase() ||
          p.email.toLowerCase() === user.email.toLowerCase()
      );
    }
    return personnel.filter(
      (p) => p.id === user.staffId || p.email.toLowerCase() === user.email.toLowerCase()
    );
  }, [personnel, user]);

  const defaultMonth = initialTimesheet?.month ?? new Date().getMonth() + 1;
  const defaultYear = initialTimesheet?.year ?? new Date().getFullYear();

  const buildFreshTimesheet = (
    month: number,
    year: number,
    staff?: PersonnelMember
  ): TimesheetRecord => {
    const subject: SubjectType = staff?.subject ?? user.subject ?? 'Giáo dục Thể chất';
    const classes = staff?.classes ?? [];
    const assigned = calculateAssignedPeriods(classes, subject);
    const rate = staff?.ratePerPeriod ?? settings.defaultRatePerPeriod;
    const now = new Date().toISOString();
    const staffId = staff?.id || user.staffId || createSafeId('staff');
    const weeks = generateWeeksForMonth(month, year, settings, assigned, rate);

    return recalculateTimesheet({
      id: `${staffId}_${year}_${month}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      ownerUid: user.uid,
      staffId,
      teacherName: staff?.fullName || user.displayName,
      teacherEmail: staff?.email || user.email,
      leaderEmail: staff?.leaderEmail,
      department: staff?.department || user.department || 'Tổ Thể dục - QP&AN',
      schoolName: staff?.schoolName || user.schoolName || settings.schoolName,
      agencyName: settings.agencyName,
      subject,
      concurrentRole: staff?.concurrentRole ?? user.concurrentRole ?? '',
      classes,
      assignedPeriodsPerWeek: assigned,
      ratePerPeriod: rate,
      month,
      year,
      totalStandardPeriods: 0,
      totalTaughtPeriods: 0,
      totalAllowancePeriods: 0,
      totalAmount: 0,
      status: 'draft',
      weeks,
      locationName: settings.locationName,
      signDay: getLastDayOfMonth(month, year),
      vicePrincipalName: settings.vicePrincipalName,
      departmentHeadName: settings.departmentHeadName,
      createdAt: now,
      updatedAt: now,
    });
  };

  const [draft, setDraft] = useState<TimesheetRecord>(() => {
    if (initialTimesheet) return recalculateTimesheet(initialTimesheet);
    const matchedStaff =
      visiblePersonnel.find((p) => p.email.toLowerCase() === user.email.toLowerCase()) ??
      visiblePersonnel[0];
    return buildFreshTimesheet(defaultMonth, defaultYear, matchedStaff);
  });

  const [classesInput, setClassesInput] = useState<string>(() => draft.classes.join(', '));
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setClassesInput(draft.classes.join(', '));
  }, [draft.id]);

  const isLocked = draft.status === 'approved' && user.role !== 'admin';

  const handleTeacherChange = (staffId: string) => {
    const staff = visiblePersonnel.find((p) => p.id === staffId);
    if (!staff) return;
    const existing = existingTimesheets.find(
      (t) => t.staffId === staff.id && t.month === draft.month && t.year === draft.year
    );
    if (existing) {
      setDraft(recalculateTimesheet(existing));
      setClassesInput(existing.classes.join(', '));
    } else {
      const fresh = buildFreshTimesheet(draft.month, draft.year, staff);
      setDraft(fresh);
      setClassesInput(fresh.classes.join(', '));
    }
  };

  const handleMonthYearChange = (month: number, year: number) => {
    const existing = existingTimesheets.find(
      (t) => t.staffId === draft.staffId && t.month === month && t.year === year
    );
    if (existing) {
      setDraft(recalculateTimesheet(existing));
      setClassesInput(existing.classes.join(', '));
    } else {
      const weeks = generateWeeksForMonth(
        month,
        year,
        settings,
        draft.assignedPeriodsPerWeek,
        draft.ratePerPeriod
      );
      setDraft((prev) =>
        recalculateTimesheet({
          ...prev,
          id: `${prev.staffId}_${year}_${month}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
          month,
          year,
          signDay: getLastDayOfMonth(month, year),
          status: 'draft',
          weeks,
        })
      );
    }
  };

  const handleClassesBlur = (raw: string) => {
    setClassesInput(raw);
    const parsed = parseClassesString(raw);
    setDraft((prev) => recalculateTimesheet({ ...prev, classes: parsed }));
  };

  const handleSyncFromHR = () => {
    const staff = personnel.find(
      (p) => p.id === draft.staffId || p.email.toLowerCase() === draft.teacherEmail.toLowerCase()
    );
    if (!staff) {
      setFeedback('Không tìm thấy hồ sơ giáo viên trong danh sách nhân sự.');
      return;
    }
    setClassesInput(staff.classes.join(', '));
    setDraft((prev) =>
      recalculateTimesheet({
        ...prev,
        teacherName: staff.fullName,
        department: staff.department,
        schoolName: staff.schoolName || settings.schoolName,
        subject: staff.subject,
        concurrentRole: staff.concurrentRole || '',
        classes: staff.classes,
        ratePerPeriod: staff.ratePerPeriod,
      })
    );
    setFeedback('Đã cập nhật lớp dạy và đơn giá từ danh sách nhân sự.');
  };

  const handleRegenerateWeeks = () => {
    const weeks = generateWeeksForMonth(
      draft.month,
      draft.year,
      settings,
      draft.assignedPeriodsPerWeek,
      draft.ratePerPeriod
    );
    setDraft((prev) => recalculateTimesheet({ ...prev, weeks }));
    setFeedback(
      `Đã tạo lại các tuần cho tháng ${draft.month}/${draft.year} theo lịch năm học & nghỉ Tết.`
    );
  };

  const handleWeekFieldChange = (
    idx: number,
    field: 'startDate' | 'endDate' | 'standardPeriods' | 'absentPeriods' | 'allowancePeriods' | 'reason' | 'note',
    value: string | number
  ) => {
    setDraft((prev) => {
      const nextWeeks = prev.weeks.map((w, i) => {
        if (i !== idx) return w;
        const updated = { ...w, [field]: value };
        if (field === 'startDate' || field === 'endDate') {
          updated.isEmptySlot = !updated.startDate && !updated.endDate;
        }
        return updated;
      });
      return recalculateTimesheet({ ...prev, weeks: nextWeeks });
    });
  };

  const persistDraft = async (nextStatus?: TimesheetRecord['status']) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const declDate = getDeclarationDate(draft.month, draft.year, draft.weeks);
      const toSave = recalculateTimesheet({
        ...draft,
        signDay: declDate.day,
        status: nextStatus ?? draft.status,
        updatedAt: new Date().toISOString(),
      });
      await onSave(toSave);
      setDraft(toSave);
      setFeedback(
        nextStatus === 'approved'
          ? 'Đã duyệt và lưu bảng kê.'
          : nextStatus === 'submitted'
            ? 'Đã gửi duyệt bảng kê.'
            : 'Đã lưu bảng kê thành công (đồng bộ đám mây & sao lưu cục bộ).'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setIsExportingPdf(true);
    try {
      const safeName = draft.teacherName.replace(/\s+/g, '_');
      await exportElementToPDF(
        printRef.current,
        `Bang_ke_phu_cap_${safeName}_T${draft.month}_${draft.year}.pdf`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            &larr; Quay lại
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">
            Bảng kê tháng {draft.month}/{draft.year}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isLocked && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persistDraft()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu bảng kê'}</span>
            </button>
          )}

          {draft.status === 'draft' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persistDraft('submitted')}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-white px-3.5 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi duyệt</span>
            </button>
          )}

          {canManageOthers && draft.status !== 'approved' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persistDraft('approved')}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Duyệt bảng kê</span>
            </button>
          )}

          {user.role === 'admin' && draft.status === 'approved' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persistDraft('draft')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mở khóa nháp</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-700" />
            <span>Xem bản in &amp; PDF</span>
          </button>

          <button
            type="button"
            onClick={() => exportTimesheetToExcel(draft)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Xuất Excel</span>
          </button>

          {(user.role === 'admin' || draft.status === 'draft') && (
            <button
              type="button"
              onClick={() => void onDelete(draft.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="no-print rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Teacher & Calculation Config Panel */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Thông tin kê khai &amp; phân công giảng dạy
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Định mức quy đổi: {getPeriodsPerClass(draft.subject)} tiết/lớp/tuần ({draft.subject})
              · Công thức: Thực dạy = Phân công − Tiết nghỉ
            </p>
          </div>
          <button
            type="button"
            disabled={isLocked}
            onClick={handleSyncFromHR}
            className="text-xs font-medium text-emerald-800 hover:underline disabled:opacity-40 cursor-pointer self-start sm:self-auto"
          >
            Đồng bộ đơn giá &amp; lớp từ nhân sự
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Giáo viên</label>
            {canManageOthers && visiblePersonnel.length > 0 ? (
              <select
                disabled={isLocked}
                value={draft.staffId}
                onChange={(e) => handleTeacherChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
              >
                {visiblePersonnel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.subject === 'Giáo dục Thể chất' ? 'GDTC' : 'QP&AN'})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                disabled
                value={draft.teacherName}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Môn dạy</label>
            <select
              disabled={isLocked}
              value={draft.subject}
              onChange={(e) =>
                setDraft((prev) =>
                  recalculateTimesheet({ ...prev, subject: e.target.value as SubjectType })
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white"
            >
              <option value="Giáo dục Thể chất">Giáo dục Thể chất (2 tiết/lớp)</option>
              <option value="Giáo dục Quốc phòng An ninh">
                Giáo dục Quốc phòng An ninh (1 tiết/lớp)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tháng / Năm</label>
            <div className="flex gap-2">
              <select
                value={draft.month}
                onChange={(e) => handleMonthYearChange(Number(e.target.value), draft.year)}
                className="flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 bg-white"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={draft.year}
                min={2020}
                max={2100}
                onChange={(e) => handleMonthYearChange(draft.month, Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Số tiền / tiết (VNĐ)
            </label>
            <input
              type="number"
              disabled={isLocked}
              min={0}
              step={100}
              value={draft.ratePerPeriod}
              onChange={(e) =>
                setDraft((prev) =>
                  recalculateTimesheet({ ...prev, ratePerPeriod: Number(e.target.value) || 0 })
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Danh sách lớp dạy (cách nhau bằng dấu phẩy)
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={classesInput}
              onChange={(e) => handleClassesBlur(e.target.value)}
              placeholder="Ví dụ: 10A9, 10A11, 10A12, 10A13, 10A14, 10A15, 10A17, 12C11, 12C13"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">Kiêm nhiệm</label>
            <input
              type="text"
              disabled={isLocked}
              value={draft.concurrentRole || ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, concurrentRole: e.target.value }))}
              placeholder="Ví dụ: Chủ nhiệm lớp..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tổng tiết phân công / tuần
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 tabular-nums">
              {draft.assignedPeriodsPerWeek} tiết ({draft.classes.length} lớp ×{' '}
              {getPeriodsPerClass(draft.subject)})
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Teaching Hours Table */}
      <div className="no-print bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Chi tiết số tiết thực dạy theo tuần
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {(() => {
                const d = getDeclarationDate(draft.month, draft.year, draft.weeks);
                const dStr = `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
                return `Ngày kê khai: ${dStr} · Khai giảng: ${settings.schoolYearStart} · Sau Tết: ${settings.tetReturnDate}`;
              })()}
            </p>
          </div>
          <button
            type="button"
            disabled={isLocked}
            onClick={handleRegenerateWeeks}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <CalendarClock className="w-3.5 h-3.5 text-emerald-700" />
            <span>Tự động chia tuần theo năm học</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-3 text-center w-12">TT</th>
                <th className="py-2.5 px-3 min-w-[230px]">Thời gian (Từ ngày - Đến ngày)</th>
                <th className="py-2.5 px-3 text-center w-24">Tiêu chuẩn</th>
                <th className="py-2.5 px-3 text-center w-24">Phân công</th>
                <th className="py-2.5 px-3 text-center w-24">Tiết nghỉ</th>
                <th className="py-2.5 px-3 text-center w-24">Thực dạy</th>
                <th className="py-2.5 px-3 text-center w-24">Phụ cấp</th>
                <th className="py-2.5 px-3 text-right w-32">Tiền phụ cấp</th>
                <th className="py-2.5 px-3 min-w-[160px]">Lý do</th>
                <th className="py-2.5 px-3 min-w-[130px]">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {draft.weeks.map((week, idx) => (
                <tr key={week.weekNumber || idx} className={week.isHoliday ? 'bg-amber-50/40' : ''}>
                  <td className="py-2.5 px-3 text-center text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        disabled={isLocked}
                        value={week.startDate}
                        placeholder="DD/MM/YYYY"
                        onChange={(e) => handleWeekFieldChange(idx, 'startDate', e.target.value)}
                        className="w-26 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                      />
                      <span className="text-slate-400 text-xs">-</span>
                      <input
                        type="text"
                        disabled={isLocked}
                        value={week.endDate}
                        placeholder="DD/MM/YYYY"
                        onChange={(e) => handleWeekFieldChange(idx, 'endDate', e.target.value)}
                        className="w-26 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                      />
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      disabled={isLocked}
                      min={0}
                      value={week.standardPeriods || ''}
                      onChange={(e) =>
                        handleWeekFieldChange(idx, 'standardPeriods', Number(e.target.value) || 0)
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-center text-slate-900"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600">
                    {week.startDate ? draft.assignedPeriodsPerWeek : 0}
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      disabled={isLocked || (!week.startDate && !week.endDate)}
                      min={0}
                      max={draft.assignedPeriodsPerWeek}
                      value={week.absentPeriods}
                      onChange={(e) =>
                        handleWeekFieldChange(idx, 'absentPeriods', Number(e.target.value) || 0)
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-center text-slate-900"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-slate-900">
                    {week.taughtPeriods}
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      disabled={isLocked}
                      min={0}
                      value={week.allowancePeriods || ''}
                      onChange={(e) =>
                        handleWeekFieldChange(idx, 'allowancePeriods', Number(e.target.value) || 0)
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-center text-slate-900"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-emerald-800">
                    {formatVND(week.amount)} đ
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={week.reason}
                      placeholder={week.holidayLabel || 'Lý do nghỉ/bù...'}
                      onChange={(e) => handleWeekFieldChange(idx, 'reason', e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={week.note}
                      placeholder="Ghi chú..."
                      onChange={(e) => handleWeekFieldChange(idx, 'note', e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <td colSpan={2} className="py-3 px-4 text-right">
                  CỘNG THÁNG {draft.month}/{draft.year}
                </td>
                <td className="py-3 px-3 text-center">{draft.totalStandardPeriods}</td>
                <td className="py-3 px-3 text-center">—</td>
                <td className="py-3 px-3 text-center">—</td>
                <td className="py-3 px-3 text-center text-emerald-800">
                  {draft.totalTaughtPeriods}
                </td>
                <td className="py-3 px-3 text-center">{draft.totalAllowancePeriods}</td>
                <td className="py-3 px-3 text-right text-emerald-800">
                  {formatVND(draft.totalAmount)} đ
                </td>
                <td colSpan={2} className="py-3 px-3 text-xs font-normal text-slate-500">
                  Đơn giá: {formatVND(draft.ratePerPeriod)} đ/tiết
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Print / PDF Modal & Hidden/Visible Print View */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col">
          <div className="no-print bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Xem trước bản in chuẩn A4 — Bảng kê phụ cấp dạy ngoài trời
              </h3>
              <p className="text-xs text-slate-500">
                Định dạng chuẩn hành chính khổ ngang (A4 Landscape)
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => void handleDownloadPDF()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'Đang tạo PDF...' : 'Tải file PDF chuẩn'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In ngay</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-slate-200 print:p-0 print:bg-white">
            <div className="shadow-md print:shadow-none inline-block min-w-full">
              <OfficialTimesheetPrint timesheet={draft} sheetRef={printRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
