import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { PersonnelMember, SubjectType, SystemSettings, TimesheetRecord, UserRole } from '../types';
import { createSafeId, parseClassesString } from './calculations';

export async function exportElementToPDF(element: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  const imgRatio = canvas.width / canvas.height;
  let renderWidth = maxWidth;
  let renderHeight = renderWidth / imgRatio;

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight * imgRatio;
  }

  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = (pageHeight - renderHeight) / 2;

  pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight);
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

export function exportTimesheetToExcel(ts: TimesheetRecord): void {
  const rows: (string | number)[][] = [
    [ts.agencyName, '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
    [ts.schoolName, '', '', '', '', 'Độc lập - Tự do - Hạnh phúc'],
    [],
    [`BẢNG KÊ PHỤ CẤP DẠY NGOÀI TRỜI THÁNG ${ts.month} NĂM ${ts.year}`],
    [],
    [`Họ và tên GV: ${ts.teacherName}`, '', '', '', `Môn dạy: ${ts.subject}`],
    [`Kiêm nhiệm: ${ts.concurrentRole || ''}`, '', '', '', `Lớp dạy: ${ts.classes.join(', ')}`],
    [`Tổng số tiết được phân công: ${ts.assignedPeriodsPerWeek}`, '', '', '', '', '', '', 'ĐVT: VNĐ'],
    [],
    ['TT', 'THỜI GIAN', 'Tiêu chuẩn', 'Thực dạy', 'Phụ cấp', 'SỐ TIỀN/ TIẾT', 'TIỀN PHỤ CẤP', 'LÝ DO', 'GHI CHÚ'],
  ];

  ts.weeks.forEach((w, idx) => {
    const timeRange =
      w.startDate && w.endDate
        ? `Tuần từ: ${w.startDate} đến: ${w.endDate}`
        : 'Tuần từ:            đến:';
    rows.push([
      idx + 1,
      timeRange,
      w.standardPeriods || '',
      w.taughtPeriods,
      w.allowancePeriods || '',
      w.ratePerPeriod,
      w.amount || '',
      w.reason || '',
      w.note || '',
    ]);
  });

  rows.push([
    '',
    'CỘNG',
    ts.totalStandardPeriods,
    ts.totalTaughtPeriods,
    ts.totalAllowancePeriods,
    '',
    ts.totalAmount,
    '',
    '',
  ]);
  rows.push([]);
  rows.push([
    'DUYỆT CỦA LÃNH ĐẠO',
    '',
    '',
    'TỔ TRƯỞNG',
    '',
    '',
    `${ts.locationName || 'Châu Hưng'}, ngày ${ts.signDay || 31} tháng ${ts.month} năm ${ts.year}`,
  ]);
  rows.push(['PHÓ HIỆU TRƯỞNG', '', '', '', '', '', 'NGƯỜI KÊ KHAI']);
  rows.push([]);
  rows.push([]);
  rows.push([
    ts.vicePrincipalName || '',
    '',
    '',
    ts.departmentHeadName || '',
    '',
    '',
    ts.teacherName,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 32 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Thang_${ts.month}_${ts.year}`);
  const safeName = ts.teacherName.replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Bang_ke_phu_cap_${safeName}_T${ts.month}_${ts.year}.xlsx`);
}

export function exportSummaryReportToExcel(
  timesheets: TimesheetRecord[],
  monthLabel: string,
  settings: SystemSettings
): void {
  const rows: (string | number)[][] = [
    [settings.agencyName],
    [settings.schoolName],
    [`BÁO CÁO TỔNG HỢP PHỤ CẤP TIẾT DẠY NGOÀI TRỜI — ${monthLabel}`],
    [],
    [
      'STT',
      'Họ và tên GV',
      'Tổ chuyên môn',
      'Môn dạy',
      'Lớp dạy',
      'Phân công/tuần',
      'Tổng tiết thực dạy',
      'Đơn giá/tiết (VNĐ)',
      'Tổng tiền phụ cấp (VNĐ)',
      'Trạng thái',
    ],
  ];

  let grandTotalPeriods = 0;
  let grandTotalAmount = 0;

  timesheets.forEach((ts, idx) => {
    grandTotalPeriods += ts.totalTaughtPeriods;
    grandTotalAmount += ts.totalAmount;
    const statusText =
      ts.status === 'approved' ? 'Đã duyệt' : ts.status === 'submitted' ? 'Chờ duyệt' : 'Nháp';
    rows.push([
      idx + 1,
      ts.teacherName,
      ts.department,
      ts.subject,
      ts.classes.join(', '),
      ts.assignedPeriodsPerWeek,
      ts.totalTaughtPeriods,
      ts.ratePerPeriod,
      ts.totalAmount,
      statusText,
    ]);
  });

  rows.push(['', 'TỔNG CỘNG', '', '', '', '', grandTotalPeriods, '', grandTotalAmount, '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 22 },
    { wch: 24 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tong_hop_phu_cap');
  XLSX.writeFile(wb, `Bao_cao_tong_hop_phu_cap_${monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`);
}

export function downloadPersonnelTemplateExcel(settings: SystemSettings): void {
  const rows = [
    [
      'Họ và tên',
      'Email',
      'Tên đăng nhập',
      'Mật khẩu khởi tạo',
      'Vai trò',
      'Chức vụ',
      'Tổ chuyên môn',
      'Trường',
      'Môn dạy',
      'Kiêm nhiệm',
      'Lớp dạy',
      'Đơn giá/tiết',
      'Email Tổ trưởng',
    ],
    [
      'Nguyễn Trung Hiếu',
      'nguyentrunghieu@school.edu.vn',
      'hieunt',
      '123456',
      'teacher',
      'Giáo viên',
      'Tổ Thể dục - QP&AN',
      settings.schoolName,
      'Giáo dục Thể chất',
      '',
      '10A9, 10A11, 10A12, 10A13, 10A14, 10A15, 10A17, 12C11, 12C13',
      settings.defaultRatePerPeriod,
      'nguyenthihoa@school.edu.vn',
    ],
    [
      'Nguyễn Thị Hoa',
      'nguyenthihoa@school.edu.vn',
      'hoant',
      '123456',
      'leader',
      'Tổ trưởng chuyên môn',
      'Tổ Thể dục - QP&AN',
      settings.schoolName,
      'Giáo dục Quốc phòng An ninh',
      'Tổ trưởng',
      '10A1, 10A2, 10A3, 10A4, 11B1, 11B2',
      settings.defaultRatePerPeriod,
      'nguyenthihoa@school.edu.vn',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nhan_su_mau');
  XLSX.writeFile(wb, 'Mau_nhap_danh_sach_nhan_su.xlsx');
}

export interface ImportedPersonnelRow {
  member: PersonnelMember;
  initialPassword?: string;
}

export async function parsePersonnelExcel(
  file: File,
  defaultSettings: SystemSettings
): Promise<ImportedPersonnelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const now = new Date().toISOString();

  return rawRows
    .map((row): ImportedPersonnelRow | null => {
      const fullName = String(
        row['Họ và tên'] || row['Ho va ten'] || row['fullName'] || ''
      ).trim();
      if (!fullName) return null;

      const email = String(row['Email'] || row['email'] || '').trim().toLowerCase();
      const username = String(row['Tên đăng nhập'] || row['username'] || '').trim();
      const initialPassword = String(row['Mật khẩu khởi tạo'] || row['password'] || '').trim();
      const rawRole = String(row['Vai trò'] || row['role'] || 'teacher').trim().toLowerCase();
      const role: UserRole =
        rawRole === 'admin' || rawRole === 'quản trị viên'
          ? 'admin'
          : rawRole === 'leader' || rawRole === 'tổ trưởng'
            ? 'leader'
            : 'teacher';
      const position = String(row['Chức vụ'] || row['position'] || 'Giáo viên').trim();
      const department = String(
        row['Tổ chuyên môn'] || row['department'] || 'Tổ Thể dục - QP&AN'
      ).trim();
      const schoolName = String(
        row['Trường'] || row['schoolName'] || defaultSettings.schoolName
      ).trim();
      const rawSubject = String(row['Môn dạy'] || row['subject'] || '').trim();
      const subject: SubjectType = rawSubject.toLowerCase().includes('quốc phòng')
        ? 'Giáo dục Quốc phòng An ninh'
        : 'Giáo dục Thể chất';
      const concurrentRole = String(row['Kiêm nhiệm'] || row['concurrentRole'] || '').trim();
      const classes = parseClassesString(String(row['Lớp dạy'] || row['classes'] || ''));
      const rateRaw = Number(row['Đơn giá/tiết'] || row['ratePerPeriod'] || defaultSettings.defaultRatePerPeriod);
      const ratePerPeriod = Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : defaultSettings.defaultRatePerPeriod;
      const leaderEmail = String(row['Email Tổ trưởng'] || row['leaderEmail'] || '')
        .trim()
        .toLowerCase();

      return {
        member: {
          id: createSafeId('staff'),
          fullName,
          email: email || `${username || createSafeId('gv')}@school.local`,
          leaderEmail: leaderEmail || undefined,
          username: username || undefined,
          role,
          position,
          department,
          schoolName,
          subject,
          concurrentRole,
          classes,
          ratePerPeriod,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        initialPassword: initialPassword || undefined,
      };
    })
    .filter((item): item is ImportedPersonnelRow => item !== null);
}
