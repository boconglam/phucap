import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
} from 'lucide-react';
import type { AppReminder } from '../hooks/useNotifications';
import type { PersonnelMember, SystemSettings, TimesheetRecord, UserProfile } from '../types';
import { formatVND } from '../utils/calculations';
import { exportSummaryReportToExcel } from '../utils/exportPdfExcel';

interface DashboardViewProps {
  user: UserProfile;
  settings: SystemSettings;
  timesheets: TimesheetRecord[];
  personnel: PersonnelMember[];
  reminders: AppReminder[];
  onCreateNew: () => void;
  onSelectTimesheet: (ts: TimesheetRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  settings,
  timesheets,
  personnel,
  reminders,
  onCreateNew,
  onSelectTimesheet,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>();
    personnel.forEach((p) => p.department && set.add(p.department));
    timesheets.forEach((t) => t.department && set.add(t.department));
    return Array.from(set).sort();
  }, [personnel, timesheets]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1, 2026]);
    timesheets.forEach((t) => set.add(t.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [timesheets, currentYear]);

  const filteredTimesheets = useMemo(() => {
    return timesheets
      .filter((ts) => {
        if (ts.year !== selectedYear) return false;
        if (selectedMonth !== 'all' && ts.month !== selectedMonth) return false;
        if (selectedDept !== 'all' && ts.department !== selectedDept) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            ts.teacherName.toLowerCase().includes(q) ||
            ts.subject.toLowerCase().includes(q) ||
            ts.department.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month));
  }, [timesheets, selectedYear, selectedMonth, selectedDept, searchQuery]);

  const summaryStats = useMemo(() => {
    const totalAmount = filteredTimesheets.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTaught = filteredTimesheets.reduce((sum, t) => sum + t.totalTaughtPeriods, 0);
    const approvedCount = filteredTimesheets.filter((t) => t.status === 'approved').length;
    const pendingCount = filteredTimesheets.filter((t) => t.status !== 'approved').length;
    return { totalAmount, totalTaught, approvedCount, pendingCount };
  }, [filteredTimesheets]);

  // Monthly chart data for selectedYear
  const monthlyChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      gdtcAmount: 0,
      gdqpAmount: 0,
      totalPeriods: 0,
      totalAmount: 0,
    }));
    timesheets
      .filter((t) => t.year === selectedYear && (selectedDept === 'all' || t.department === selectedDept))
      .forEach((t) => {
        const idx = t.month - 1;
        if (idx >= 0 && idx < 12) {
          if (t.subject === 'Giáo dục Thể chất') {
            months[idx].gdtcAmount += t.totalAmount;
          } else {
            months[idx].gdqpAmount += t.totalAmount;
          }
          months[idx].totalPeriods += t.totalTaughtPeriods;
          months[idx].totalAmount += t.totalAmount;
        }
      });
    return months;
  }, [timesheets, selectedYear, selectedDept]);

  const maxMonthlyAmount = useMemo(() => {
    const m = Math.max(...monthlyChartData.map((d) => d.totalAmount), 100000);
    return m;
  }, [monthlyChartData]);

  // Subject & Department breakdown
  const categoryBreakdown = useMemo(() => {
    let gdtcPeriods = 0;
    let gdtcAmount = 0;
    let gdqpPeriods = 0;
    let gdqpAmount = 0;
    const byDept = new Map<string, { periods: number; amount: number; count: number }>();

    filteredTimesheets.forEach((t) => {
      if (t.subject === 'Giáo dục Thể chất') {
        gdtcPeriods += t.totalTaughtPeriods;
        gdtcAmount += t.totalAmount;
      } else {
        gdqpPeriods += t.totalTaughtPeriods;
        gdqpAmount += t.totalAmount;
      }
      const prev = byDept.get(t.department) ?? { periods: 0, amount: 0, count: 0 };
      byDept.set(t.department, {
        periods: prev.periods + t.totalTaughtPeriods,
        amount: prev.amount + t.totalAmount,
        count: prev.count + 1,
      });
    });

    const totalAmt = gdtcAmount + gdqpAmount || 1;
    return {
      gdtcPeriods,
      gdtcAmount,
      gdtcPct: Math.round((gdtcAmount / totalAmt) * 100),
      gdqpPeriods,
      gdqpAmount,
      gdqpPct: Math.round((gdqpAmount / totalAmt) * 100),
      departments: Array.from(byDept.entries()).map(([name, val]) => ({ name, ...val })),
    };
  }, [filteredTimesheets]);

  const handleExportSummary = () => {
    const label =
      selectedMonth === 'all' ? `Nam_${selectedYear}` : `Thang_${selectedMonth}_${selectedYear}`;
    exportSummaryReportToExcel(filteredTimesheets, label, settings);
  };

  return (
    <div className="space-y-8">
      {/* Reminders */}
      {reminders.length > 0 && (
        <div className="space-y-2">
          {reminders.map((rem) => (
            <div
              key={rem.id}
              className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
                rem.urgent
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <Bell
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    rem.urgent ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                />
                <div>
                  <p className="font-medium">{rem.title}</p>
                  <p className="text-xs opacity-90 mt-0.5">{rem.body}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCreateNew}
                className="shrink-0 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900 transition-colors cursor-pointer"
              >
                Kê khai ngay
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">
            {user.schoolName || settings.schoolName} · {user.department || 'Chuyên môn'}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Thống kê phụ cấp dạy ngoài trời
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {filteredTimesheets.length > 0 && (
            <button
              type="button"
              onClick={handleExportSummary}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Xuất Excel tổng hợp</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Lập bảng kê mới</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Tổng tiền phụ cấp</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatVND(summaryStats.totalAmount)} <span className="text-sm font-normal text-slate-500">đ</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {selectedMonth === 'all' ? `Cả năm ${selectedYear}` : `Tháng ${selectedMonth}/${selectedYear}`}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Tổng tiết thực dạy</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {summaryStats.totalTaught} <span className="text-sm font-normal text-slate-500">tiết</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Đã trừ các tiết nghỉ theo tuần
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Bảng kê đã duyệt</p>
          <p className="mt-2 text-2xl font-bold text-emerald-800 tabular-nums">
            {summaryStats.approvedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sẵn sàng quyết toán & lưu trữ
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Đang nháp / Chờ duyệt</p>
          <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {summaryStats.pendingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Cần hoàn thiện trước ngày {settings.reminderDayOfMonth}
          </p>
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Monthly Bar Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Biểu đồ phụ cấp theo tháng ({selectedYear})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Phân tách giữa môn Giáo dục Thể chất và Giáo dục Quốc phòng An ninh
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700 inline-block" />
                Thể chất
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 inline-block" />
                QP&amp;AN
              </span>
            </div>
          </div>

          <div className="relative h-56 flex items-end gap-2 pt-8 pb-6 border-b border-slate-200">
            {monthlyChartData.map((d) => {
              const gdtcHeight = Math.round((d.gdtcAmount / maxMonthlyAmount) * 160);
              const gdqpHeight = Math.round((d.gdqpAmount / maxMonthlyAmount) * 160);
              const isHovered = hoveredMonth === d.month;

              return (
                <div
                  key={d.month}
                  onMouseEnter={() => setHoveredMonth(d.month)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  onClick={() => setSelectedMonth(selectedMonth === d.month ? 'all' : d.month)}
                  className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer relative"
                >
                  {isHovered && (
                    <div className="absolute -top-2 z-10 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-900 px-2.5 py-1.5 text-[11px] text-white shadow-sm pointer-events-none tabular-nums">
                      T{d.month}: {formatVND(d.totalAmount)} đ · {d.totalPeriods} tiết
                    </div>
                  )}
                  <div className="w-full max-w-[30px] flex flex-col justify-end items-stretch gap-0.5">
                    {gdqpHeight > 0 && (
                      <div
                        style={{ height: `${Math.max(4, gdqpHeight)}px` }}
                        className="w-full bg-slate-700 rounded-t-xs transition-opacity group-hover:opacity-85"
                      />
                    )}
                    {gdtcHeight > 0 && (
                      <div
                        style={{ height: `${Math.max(4, gdtcHeight)}px` }}
                        className={`w-full bg-emerald-700 transition-opacity group-hover:opacity-85 ${
                          gdqpHeight === 0 ? 'rounded-t-xs' : ''
                        }`}
                      />
                    )}
                    {gdtcHeight === 0 && gdqpHeight === 0 && (
                      <div className="w-full h-1 bg-slate-100 rounded-t-xs" />
                    )}
                  </div>
                  <span
                    className={`mt-2 text-[11px] tabular-nums ${
                      selectedMonth === d.month
                        ? 'font-bold text-emerald-800'
                        : 'text-slate-500'
                    }`}
                  >
                    T{d.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cơ cấu theo danh mục
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tỷ trọng chi trả theo bộ môn và tổ chuyên môn
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-800">Giáo dục Thể chất</span>
                  <span className="tabular-nums text-slate-600">
                    {formatVND(categoryBreakdown.gdtcAmount)} đ ({categoryBreakdown.gdtcPct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-700"
                    style={{ width: `${categoryBreakdown.gdtcPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  {categoryBreakdown.gdtcPeriods} tiết thực dạy · Định mức 2 tiết/lớp
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-800">Giáo dục QP&amp;AN</span>
                  <span className="tabular-nums text-slate-600">
                    {formatVND(categoryBreakdown.gdqpAmount)} đ ({categoryBreakdown.gdqpPct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-700"
                    style={{ width: `${categoryBreakdown.gdqpPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  {categoryBreakdown.gdqpPeriods} tiết thực dạy · Định mức 1 tiết/lớp
                </p>
              </div>
            </div>
          </div>

          {categoryBreakdown.departments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-700 mb-2">Theo tổ chuyên môn</p>
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {categoryBreakdown.departments.map((dept) => (
                  <div
                    key={dept.name}
                    className="flex items-center justify-between text-xs text-slate-600"
                  >
                    <span className="truncate pr-2">{dept.name}</span>
                    <span className="tabular-nums font-medium text-slate-900 shrink-0">
                      {formatVND(dept.amount)} đ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timesheet Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            Danh sách bảng kê phụ cấp
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm giáo viên, môn..."
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <select
              value={selectedMonth}
              onChange={(e) =>
                setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="all">Tất cả các tháng</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>

            {departments.length > 0 && (
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="all">Tất cả tổ chuyên môn</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {filteredTimesheets.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              Chưa có bảng kê nào trong bộ lọc này
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Hãy nhấn &ldquo;Lập bảng kê mới&rdquo; để khởi tạo bảng kê phụ cấp tiết dạy ngoài
              trời theo tháng cho giáo viên.
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo bảng kê đầu tiên</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-4">Giáo viên</th>
                  <th className="py-3 px-4">Kỳ kê khai</th>
                  <th className="py-3 px-4">Môn dạy</th>
                  <th className="py-3 px-4 text-right">Phân công/tuần</th>
                  <th className="py-3 px-4 text-right">Thực dạy</th>
                  <th className="py-3 px-4 text-right">Thành tiền</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 tabular-nums">
                {filteredTimesheets.map((ts) => (
                  <tr
                    key={ts.id}
                    onClick={() => onSelectTimesheet(ts)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{ts.teacherName}</div>
                      <div className="text-xs text-slate-500">{ts.department}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      Tháng {ts.month}/{ts.year}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{ts.subject}</td>
                    <td className="py-3 px-4 text-right text-slate-700">
                      {ts.assignedPeriodsPerWeek} tiết
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-900">
                      {ts.totalTaughtPeriods} tiết
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-800">
                      {formatVND(ts.totalAmount)} đ
                    </td>
                    <td className="py-3 px-4">
                      {ts.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã duyệt
                        </span>
                      ) : ts.status === 'submitted' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          Chờ duyệt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <FileText className="w-3.5 h-3.5" />
                          Bản nháp
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTimesheet(ts);
                        }}
                        className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                      >
                        Mở &amp; In PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
