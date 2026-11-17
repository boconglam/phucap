import type { SubjectType, SystemSettings, TimesheetRecord, WeekEntry } from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'boconglam@gmail.com';

export const DEFAULT_SETTINGS: SystemSettings = {
  id: 'default',
  agencyName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO VĨNH LONG',
  schoolName: 'TRƯỜNG TRUNG HỌC PHỔ THÔNG HUỲNH TẤN PHÁT',
  locationName: 'Châu Hưng',
  vicePrincipalName: 'Hà Thị Kim Thoa',
  departmentHeadName: 'Nguyễn Thị Hoa',
  defaultRatePerPeriod: 25300,
  schoolYearStart: '2026-09-07',
  tetReturnDate: '2027-02-15',
  reminderDayOfMonth: 25,
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
};

export function getPeriodsPerClass(subject: SubjectType): number {
  return subject === 'Giáo dục Thể chất' ? 2 : 1;
}

export function calculateAssignedPeriods(classes: string[], subject: SubjectType): number {
  const cleanClasses = classes.map((c) => c.trim()).filter(Boolean);
  return cleanClasses.length * getPeriodsPerClass(subject);
}

export function formatVND(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '0';
  return Math.round(amount).toLocaleString('vi-VN');
}

export function formatDateVN(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function parseISODateLocal(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getLastDayOfMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function generateWeeksForMonth(
  month: number,
  year: number,
  settings: SystemSettings,
  assignedPeriods: number,
  ratePerPeriod: number
): WeekEntry[] {
  const weeks: WeekEntry[] = [];
  const daysInMonth = getLastDayOfMonth(month, year);
  const schoolStart = parseISODateLocal(settings.schoolYearStart);
  const tetReturn = parseISODateLocal(settings.tetReturnDate);

  // Find all Mondays in the given month (standard weekly ledger format)
  let weekNum = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getDay() === 1) {
      const monday = new Date(d);
      const friday = new Date(d);
      friday.setDate(monday.getDate() + 4);

      let isHoliday = false;
      let holidayLabel = '';
      let absentPeriods = 0;

      if (schoolStart && friday < schoolStart) {
        isHoliday = true;
        holidayLabel = 'Chưa khai giảng năm học';
        absentPeriods = assignedPeriods;
      } else if (tetReturn) {
        // Check if week sits inside the Lunar New Year holiday window (~14 days before tetReturnDate)
        const tetWindowStart = new Date(tetReturn);
        tetWindowStart.setDate(tetWindowStart.getDate() - 14);
        if (monday >= tetWindowStart && monday < tetReturn) {
          isHoliday = true;
          holidayLabel = 'Nghỉ Tết Nguyên Đán';
          absentPeriods = assignedPeriods;
        }
      }

      const taughtPeriods = Math.max(0, assignedPeriods - absentPeriods);
      weeks.push({
        weekNumber: weekNum++,
        startDate: formatDateVN(monday),
        endDate: formatDateVN(friday),
        isEmptySlot: false,
        isHoliday,
        holidayLabel,
        standardPeriods: 0,
        assignedPeriods,
        absentPeriods,
        taughtPeriods,
        allowancePeriods: 0,
        ratePerPeriod,
        amount: taughtPeriods * ratePerPeriod,
        reason: holidayLabel,
        note: '',
      });
    }
  }

  // Pad up to 5 rows to match the official 5-row monthly sheet template
  while (weeks.length < 5) {
    weeks.push({
      weekNumber: weeks.length + 1,
      startDate: '',
      endDate: '',
      isEmptySlot: true,
      isHoliday: false,
      holidayLabel: '',
      standardPeriods: 0,
      assignedPeriods: 0,
      absentPeriods: 0,
      taughtPeriods: 0,
      allowancePeriods: 0,
      ratePerPeriod,
      amount: 0,
      reason: '',
      note: '',
    });
  }

  return weeks;
}

export function recalculateTimesheet(ts: TimesheetRecord): TimesheetRecord {
  const assignedPerWeek = calculateAssignedPeriods(ts.classes, ts.subject);
  const updatedWeeks = ts.weeks.map((w) => {
    if (w.isEmptySlot && !w.startDate) {
      return {
        ...w,
        assignedPeriods: 0,
        taughtPeriods: 0,
        amount: 0,
        ratePerPeriod: ts.ratePerPeriod,
      };
    }
    const baseAssigned = assignedPerWeek;
    const absent = Math.min(baseAssigned, Math.max(0, Number(w.absentPeriods) || 0));
    const taught = Math.max(0, baseAssigned - absent);
    const rate = Number(ts.ratePerPeriod) || 0;
    return {
      ...w,
      assignedPeriods: baseAssigned,
      absentPeriods: absent,
      taughtPeriods: taught,
      ratePerPeriod: rate,
      amount: taught * rate,
    };
  });

  const totalStandardPeriods = updatedWeeks.reduce((s, w) => s + (Number(w.standardPeriods) || 0), 0);
  const totalTaughtPeriods = updatedWeeks.reduce((s, w) => s + (Number(w.taughtPeriods) || 0), 0);
  const totalAllowancePeriods = updatedWeeks.reduce((s, w) => s + (Number(w.allowancePeriods) || 0), 0);
  const totalAmount = totalTaughtPeriods * (Number(ts.ratePerPeriod) || 0);

  return {
    ...ts,
    assignedPeriodsPerWeek: assignedPerWeek,
    weeks: updatedWeeks,
    totalStandardPeriods,
    totalTaughtPeriods,
    totalAllowancePeriods,
    totalAmount,
  };
}

export function parseClassesString(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}
