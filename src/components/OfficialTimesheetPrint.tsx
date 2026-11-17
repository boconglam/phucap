import React from 'react';
import type { TimesheetRecord } from '../types';
import { formatVND, getLastDayOfMonth } from '../utils/calculations';

interface OfficialTimesheetPrintProps {
  timesheet: TimesheetRecord;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
}

export const OfficialTimesheetPrint: React.FC<OfficialTimesheetPrintProps> = ({
  timesheet,
  sheetRef,
}) => {
  const signDay = timesheet.signDay || getLastDayOfMonth(timesheet.month, timesheet.year);
  const classesLabel = timesheet.classes.join(', ');

  return (
    <div
      ref={sheetRef}
      className="print-container font-official bg-white text-black mx-auto"
      style={{
        width: '277mm',
        minHeight: '190mm',
        padding: '10mm 12mm',
        color: '#000000',
        backgroundColor: '#ffffff',
        boxSizing: 'border-box',
        fontFamily: "'Times New Roman', Times, 'Noto Serif', serif",
      }}
    >
      {/* Header Row: Agency / School on left, National Motto on right */}
      <div className="flex justify-between items-start text-[12.5pt] leading-snug">
        <div className="text-center w-[48%]">
          <div className="uppercase font-normal tracking-tight">{timesheet.agencyName}</div>
          <div className="uppercase font-bold tracking-tight">{timesheet.schoolName}</div>
          <div className="mx-auto mt-1 w-48 border-b border-black" />
        </div>
        <div className="text-center w-[48%]">
          <div className="uppercase font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div className="font-bold underline underline-offset-4">
            Độc lập - Tự do - Hạnh phúc
          </div>
        </div>
      </div>

      {/* Document Title */}
      <h1
        className="text-center font-bold uppercase text-[14pt] mt-4 mb-4 tracking-wide"
        style={{ fontFamily: "'Times New Roman', Times, 'Noto Serif', serif" }}
      >
        BẢNG KÊ PHỤ CẤP DẠY NGOÀI TRỜI THÁNG {timesheet.month} NĂM {timesheet.year}
      </h1>

      {/* Teacher & Assignment Metadata */}
      <div className="grid grid-cols-12 gap-x-6 text-[11.5pt] leading-relaxed mb-1">
        <div className="col-span-6 space-y-0.5">
          <div className="font-bold">Họ và tên GV: {timesheet.teacherName}</div>
          <div>Kiêm nhiệm: {timesheet.concurrentRole || ''}</div>
          <div>Tổng số tiết được phân công {timesheet.assignedPeriodsPerWeek}</div>
        </div>
        <div className="col-span-6 space-y-0.5">
          <div>Môn dạy: {timesheet.subject}</div>
          <div className="flex items-start gap-1">
            <span className="shrink-0">Lớp dạy:</span>
            <span>{classesLabel}</span>
          </div>
        </div>
      </div>

      {/* Currency Unit */}
      <div className="text-right text-[11pt] mb-1">ĐVT: VNĐ</div>

      {/* Official Table */}
      <table
        className="w-full border-collapse text-[11pt] tabular-nums"
        style={{ borderColor: '#000000' }}
      >
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="border border-black px-1.5 py-1.5 text-center font-bold w-[42px]"
            >
              TT
            </th>
            <th
              rowSpan={2}
              className="border border-black px-2 py-1.5 text-center font-bold w-[230px]"
            >
              THỜI GIAN
            </th>
            <th colSpan={3} className="border border-black px-2 py-1 text-center font-bold">
              SỐ TIẾT
            </th>
            <th
              rowSpan={2}
              className="border border-black px-2 py-1.5 text-center font-bold w-[92px] leading-tight"
            >
              SỐ TIỀN/
              <br />
              TIẾT
            </th>
            <th
              rowSpan={2}
              className="border border-black px-2 py-1.5 text-center font-bold w-[112px]"
            >
              TIỀN PHỤ CẤP
            </th>
            <th
              rowSpan={2}
              className="border border-black px-2 py-1.5 text-center font-bold w-[130px]"
            >
              LÝ DO
            </th>
            <th
              rowSpan={2}
              className="border border-black px-2 py-1.5 text-center font-bold w-[120px]"
            >
              GHI CHÚ
            </th>
          </tr>
          <tr>
            <th className="border border-black px-1.5 py-1 text-center font-bold w-[78px]">
              Tiêu chuẩn
            </th>
            <th className="border border-black px-1.5 py-1 text-center font-bold w-[78px]">
              Thực dạy
            </th>
            <th className="border border-black px-1.5 py-1 text-center font-bold w-[72px]">
              Phụ cấp
            </th>
          </tr>
        </thead>
        <tbody>
          {timesheet.weeks.map((week, index) => {
            const isEmpty = !week.startDate && !week.endDate;
            return (
              <tr key={week.weekNumber || index}>
                <td className="border border-black px-1.5 py-2 text-center">{index + 1}</td>
                <td className="border border-black px-2 py-2 text-left whitespace-nowrap">
                  {isEmpty ? (
                    <span>
                      Tuần từ:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;đến:
                    </span>
                  ) : (
                    <span>
                      Tuần từ: {week.startDate} đến: {week.endDate}
                    </span>
                  )}
                </td>
                <td className="border border-black px-2 py-2 text-center">
                  {week.standardPeriods > 0 ? week.standardPeriods : ''}
                </td>
                <td className="border border-black px-2 py-2 text-center">
                  {week.taughtPeriods}
                </td>
                <td className="border border-black px-2 py-2 text-center">
                  {week.allowancePeriods > 0 ? week.allowancePeriods : ''}
                </td>
                <td className="border border-black px-2 py-2 text-right">
                  {formatVND(week.ratePerPeriod)}
                </td>
                <td className="border border-black px-2 py-2 text-right">
                  {week.amount > 0 ? formatVND(week.amount) : ''}
                </td>
                <td className="border border-black px-2 py-2 text-left text-[10.5pt]">
                  {week.reason}
                </td>
                <td className="border border-black px-2 py-2 text-left text-[10.5pt]">
                  {week.note}
                </td>
              </tr>
            );
          })}
          {/* Total Row */}
          <tr className="font-bold">
            <td className="border border-black px-1.5 py-2 text-center"></td>
            <td className="border border-black px-2 py-2 text-center uppercase">CỘNG</td>
            <td className="border border-black px-2 py-2 text-center">
              {timesheet.totalStandardPeriods}
            </td>
            <td className="border border-black px-2 py-2 text-center">
              {timesheet.totalTaughtPeriods}
            </td>
            <td className="border border-black px-2 py-2 text-center">
              {timesheet.totalAllowancePeriods}
            </td>
            <td className="border border-black px-2 py-2 text-right"></td>
            <td className="border border-black px-2 py-2 text-right">
              {formatVND(timesheet.totalAmount)}
            </td>
            <td className="border border-black px-2 py-2"></td>
            <td className="border border-black px-2 py-2"></td>
          </tr>
        </tbody>
      </table>

      {/* Signature Block */}
      <div className="grid grid-cols-3 gap-4 mt-5 text-[11.5pt] text-center">
        <div>
          <div className="font-bold uppercase">DUYỆT CỦA LÃNH ĐẠO</div>
          <div className="font-bold uppercase">PHÓ HIỆU TRƯỞNG</div>
          <div className="h-20" />
          <div className="font-bold">{timesheet.vicePrincipalName || ''}</div>
        </div>
        <div>
          <div className="h-5" />
          <div className="font-bold uppercase">TỔ TRƯỞNG</div>
          <div className="h-20" />
          <div className="font-bold">{timesheet.departmentHeadName || ''}</div>
        </div>
        <div>
          <div className="italic">
            {timesheet.locationName || 'Châu Hưng'}, ngày {signDay} tháng {timesheet.month} năm{' '}
            {timesheet.year}
          </div>
          <div className="font-bold uppercase">NGƯỜI KÊ KHAI</div>
          <div className="h-20" />
          <div className="font-bold">{timesheet.teacherName}</div>
        </div>
      </div>
    </div>
  );
};
