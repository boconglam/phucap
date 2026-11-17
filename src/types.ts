export type SubjectType = 'Giáo dục Thể chất' | 'Giáo dục Quốc phòng An ninh';

export type UserRole = 'admin' | 'leader' | 'teacher';

export type TimesheetStatus = 'draft' | 'submitted' | 'approved';

export interface SystemSettings {
  id: string;
  agencyName: string;
  schoolName: string;
  locationName: string;
  vicePrincipalName: string;
  departmentHeadName: string;
  defaultRatePerPeriod: number;
  schoolYearStart: string; // YYYY-MM-DD
  tetReturnDate: string;   // YYYY-MM-DD
  reminderDayOfMonth: number;
  updatedBy: string;
  updatedAt: string;
}

export interface PersonnelMember {
  id: string;
  fullName: string;
  email: string;
  leaderEmail?: string;
  username?: string;
  role: UserRole;
  position: string;
  department: string;
  schoolName?: string;
  subject: SubjectType;
  concurrentRole?: string;
  classes: string[];
  ratePerPeriod: number;
  isActive: boolean;
  linkedUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeekEntry {
  weekNumber: number;
  startDate: string; // DD/MM/YYYY or ''
  endDate: string;   // DD/MM/YYYY or ''
  isEmptySlot?: boolean;
  isHoliday?: boolean;
  holidayLabel?: string;
  standardPeriods: number;
  assignedPeriods: number;
  absentPeriods: number;
  taughtPeriods: number;
  allowancePeriods: number;
  ratePerPeriod: number;
  amount: number;
  reason: string;
  note: string;
}

export interface TimesheetRecord {
  id: string;
  ownerUid: string;
  staffId: string;
  teacherName: string;
  teacherEmail: string;
  leaderEmail?: string;
  department: string;
  schoolName: string;
  agencyName: string;
  subject: SubjectType;
  concurrentRole?: string;
  classes: string[];
  assignedPeriodsPerWeek: number;
  ratePerPeriod: number;
  month: number;
  year: number;
  totalStandardPeriods: number;
  totalTaughtPeriods: number;
  totalAllowancePeriods: number;
  totalAmount: number;
  status: TimesheetStatus;
  weeks: WeekEntry[];
  locationName?: string;
  signDay?: number;
  vicePrincipalName?: string;
  departmentHeadName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  schoolName?: string;
  department?: string;
  position?: string;
  subject?: SubjectType;
  concurrentRole?: string;
  staffId?: string;
  role: UserRole;
  authMode: 'google' | 'local';
  updatedAt: string;
}

export interface LocalAccountCredential {
  username: string;
  passwordHash: string;
  salt: string;
  staffId: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
}

export interface LocalBackupSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  settings: SystemSettings;
  personnel: PersonnelMember[];
  timesheets: TimesheetRecord[];
}
