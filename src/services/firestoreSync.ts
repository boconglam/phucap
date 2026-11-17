import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { PersonnelMember, SystemSettings, TimesheetRecord, UserProfile } from '../types';
import { BOOTSTRAPPED_ADMIN_EMAIL, DEFAULT_SETTINGS } from '../utils/calculations';

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export async function fetchSystemSettingsCloud(): Promise<SystemSettings | null> {
  if (!auth.currentUser) return null;
  const path = 'system_settings/default';
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'default'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      ...DEFAULT_SETTINGS,
      id: String(d.id || 'default'),
      agencyName: String(d.agencyName || DEFAULT_SETTINGS.agencyName),
      schoolName: String(d.schoolName || DEFAULT_SETTINGS.schoolName),
      locationName: String(d.locationName || DEFAULT_SETTINGS.locationName),
      vicePrincipalName: String(d.vicePrincipalName || ''),
      departmentHeadName: String(d.departmentHeadName || ''),
      defaultRatePerPeriod: Number(d.defaultRatePerPeriod ?? DEFAULT_SETTINGS.defaultRatePerPeriod),
      schoolYearStart: String(d.schoolYearStart || DEFAULT_SETTINGS.schoolYearStart),
      tetReturnDate: String(d.tetReturnDate || DEFAULT_SETTINGS.tetReturnDate),
      reminderDayOfMonth: Number(d.reminderDayOfMonth ?? DEFAULT_SETTINGS.reminderDayOfMonth),
      updatedBy: String(d.updatedBy || 'system'),
      updatedAt: tsToIso(d.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveSystemSettingsCloud(settings: SystemSettings): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'system_settings/default';
  const ref = doc(db, 'system_settings', 'default');
  try {
    const existing = await getDoc(ref);
    const payload = {
      id: 'default',
      agencyName: settings.agencyName.slice(0, 200),
      schoolName: settings.schoolName.slice(0, 200),
      locationName: settings.locationName.slice(0, 100),
      vicePrincipalName: (settings.vicePrincipalName || '').slice(0, 100),
      departmentHeadName: (settings.departmentHeadName || '').slice(0, 100),
      defaultRatePerPeriod: Number(settings.defaultRatePerPeriod) || 0,
      schoolYearStart: settings.schoolYearStart.slice(0, 20),
      tetReturnDate: settings.tetReturnDate.slice(0, 20),
      reminderDayOfMonth: Math.min(31, Math.max(1, Number(settings.reminderDayOfMonth) || 25)),
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserProfileCloud(uid: string): Promise<UserProfile | null> {
  if (!auth.currentUser) return null;
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid),
      email: String(d.email),
      displayName: String(d.displayName),
      schoolName: d.schoolName ? String(d.schoolName) : undefined,
      department: d.department ? String(d.department) : undefined,
      position: d.position ? String(d.position) : undefined,
      subject: d.subject,
      concurrentRole: d.concurrentRole ? String(d.concurrentRole) : undefined,
      staffId: d.staffId ? String(d.staffId) : undefined,
      role: d.role,
      authMode: 'google',
      updatedAt: tsToIso(d.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserProfileCloud(profile: UserProfile): Promise<void> {
  if (!auth.currentUser) return;
  const path = `users/${profile.uid}`;
  const ref = doc(db, 'users', profile.uid);
  try {
    const existing = await getDoc(ref);
    const payload = stripUndefined({
      uid: profile.uid,
      email: profile.email.slice(0, 150),
      displayName: profile.displayName.slice(0, 120),
      schoolName: profile.schoolName?.slice(0, 200),
      department: profile.department?.slice(0, 120),
      position: profile.position?.slice(0, 100),
      subject: profile.subject?.slice(0, 100),
      concurrentRole: profile.concurrentRole?.slice(0, 150),
      staffId: profile.staffId?.slice(0, 128),
      role: profile.role,
      updatedAt: serverTimestamp(),
    });
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPersonnelCloud(userEmail: string, isAdminUser: boolean): Promise<PersonnelMember[]> {
  if (!auth.currentUser) return [];
  const path = 'personnel';
  try {
    const colRef = collection(db, 'personnel');
    const results = new Map<string, PersonnelMember>();

    if (isAdminUser && userEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(colRef);
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        results.set(docSnap.id, mapPersonnelDoc(docSnap.id, d));
      });
    } else {
      const qSelf = query(colRef, where('email', '==', userEmail.toLowerCase()));
      const qLeader = query(colRef, where('leaderEmail', '==', userEmail.toLowerCase()));
      const [s1, s2] = await Promise.all([getDocs(qSelf), getDocs(qLeader)]);
      s1.forEach((docSnap) => results.set(docSnap.id, mapPersonnelDoc(docSnap.id, docSnap.data())));
      s2.forEach((docSnap) => results.set(docSnap.id, mapPersonnelDoc(docSnap.id, docSnap.data())));
    }
    return Array.from(results.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function mapPersonnelDoc(id: string, d: Record<string, unknown>): PersonnelMember {
  return {
    id,
    fullName: String(d.fullName || ''),
    email: String(d.email || ''),
    leaderEmail: d.leaderEmail ? String(d.leaderEmail) : undefined,
    username: d.username ? String(d.username) : undefined,
    role: (d.role as PersonnelMember['role']) || 'teacher',
    position: String(d.position || 'Giáo viên'),
    department: String(d.department || ''),
    schoolName: d.schoolName ? String(d.schoolName) : undefined,
    subject: (d.subject as PersonnelMember['subject']) || 'Giáo dục Thể chất',
    concurrentRole: d.concurrentRole ? String(d.concurrentRole) : '',
    classes: Array.isArray(d.classes) ? d.classes.map(String) : [],
    ratePerPeriod: Number(d.ratePerPeriod ?? 25300),
    isActive: Boolean(d.isActive ?? true),
    linkedUid: d.linkedUid ? String(d.linkedUid) : undefined,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

export async function savePersonnelCloud(member: PersonnelMember): Promise<void> {
  if (!auth.currentUser) return;
  const path = `personnel/${member.id}`;
  const ref = doc(db, 'personnel', member.id);
  try {
    const existing = await getDoc(ref);
    const baseData = stripUndefined({
      id: member.id,
      fullName: member.fullName.slice(0, 120),
      email: member.email.toLowerCase().slice(0, 150),
      leaderEmail: member.leaderEmail ? member.leaderEmail.toLowerCase().slice(0, 150) : undefined,
      username: member.username ? member.username.slice(0, 80) : undefined,
      role: member.role,
      position: member.position.slice(0, 100),
      department: member.department.slice(0, 120),
      schoolName: member.schoolName ? member.schoolName.slice(0, 200) : undefined,
      subject: member.subject,
      concurrentRole: (member.concurrentRole || '').slice(0, 150),
      classes: member.classes.slice(0, 30),
      ratePerPeriod: Number(member.ratePerPeriod) || 0,
      isActive: Boolean(member.isActive),
      linkedUid: member.linkedUid?.slice(0, 128),
      updatedAt: serverTimestamp(),
    });
    if (existing.exists()) {
      await updateDoc(ref, baseData);
    } else {
      await setDoc(ref, { ...baseData, createdAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePersonnelCloud(staffId: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = `personnel/${staffId}`;
  try {
    await deleteDoc(doc(db, 'personnel', staffId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchTimesheetsCloud(
  uid: string,
  userEmail: string,
  isAdminUser: boolean
): Promise<TimesheetRecord[]> {
  if (!auth.currentUser) return [];
  const path = 'timesheets';
  try {
    const colRef = collection(db, 'timesheets');
    const results = new Map<string, TimesheetRecord>();

    if (isAdminUser && userEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      const snap = await getDocs(colRef);
      snap.forEach((docSnap) => results.set(docSnap.id, mapTimesheetDoc(docSnap.id, docSnap.data())));
    } else {
      const qOwner = query(colRef, where('ownerUid', '==', uid));
      const qEmail = query(colRef, where('teacherEmail', '==', userEmail.toLowerCase()));
      const qLeader = query(colRef, where('leaderEmail', '==', userEmail.toLowerCase()));
      const [s1, s2, s3] = await Promise.all([getDocs(qOwner), getDocs(qEmail), getDocs(qLeader)]);
      s1.forEach((docSnap) => results.set(docSnap.id, mapTimesheetDoc(docSnap.id, docSnap.data())));
      s2.forEach((docSnap) => results.set(docSnap.id, mapTimesheetDoc(docSnap.id, docSnap.data())));
      s3.forEach((docSnap) => results.set(docSnap.id, mapTimesheetDoc(docSnap.id, docSnap.data())));
    }
    return Array.from(results.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function mapTimesheetDoc(id: string, d: Record<string, unknown>): TimesheetRecord {
  return {
    id,
    ownerUid: String(d.ownerUid || ''),
    staffId: String(d.staffId || ''),
    teacherName: String(d.teacherName || ''),
    teacherEmail: String(d.teacherEmail || ''),
    leaderEmail: d.leaderEmail ? String(d.leaderEmail) : undefined,
    department: String(d.department || ''),
    schoolName: String(d.schoolName || ''),
    agencyName: String(d.agencyName || ''),
    subject: (d.subject as TimesheetRecord['subject']) || 'Giáo dục Thể chất',
    concurrentRole: d.concurrentRole ? String(d.concurrentRole) : '',
    classes: Array.isArray(d.classes) ? d.classes.map(String) : [],
    assignedPeriodsPerWeek: Number(d.assignedPeriodsPerWeek ?? 0),
    ratePerPeriod: Number(d.ratePerPeriod ?? 0),
    month: Number(d.month ?? 1),
    year: Number(d.year ?? 2026),
    totalStandardPeriods: Number(d.totalStandardPeriods ?? 0),
    totalTaughtPeriods: Number(d.totalTaughtPeriods ?? 0),
    totalAllowancePeriods: Number(d.totalAllowancePeriods ?? 0),
    totalAmount: Number(d.totalAmount ?? 0),
    status: (d.status as TimesheetRecord['status']) || 'draft',
    weeks: Array.isArray(d.weeks) ? (d.weeks as TimesheetRecord['weeks']) : [],
    locationName: d.locationName ? String(d.locationName) : undefined,
    signDay: d.signDay ? Number(d.signDay) : undefined,
    vicePrincipalName: d.vicePrincipalName ? String(d.vicePrincipalName) : undefined,
    departmentHeadName: d.departmentHeadName ? String(d.departmentHeadName) : undefined,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

export async function saveTimesheetCloud(ts: TimesheetRecord): Promise<void> {
  if (!auth.currentUser) return;
  const path = `timesheets/${ts.id}`;
  const ref = doc(db, 'timesheets', ts.id);
  try {
    const existing = await getDoc(ref);
    const payload = stripUndefined({
      id: ts.id,
      ownerUid: ts.ownerUid || auth.currentUser.uid,
      staffId: ts.staffId,
      teacherName: ts.teacherName.slice(0, 120),
      teacherEmail: ts.teacherEmail.toLowerCase().slice(0, 150),
      leaderEmail: ts.leaderEmail ? ts.leaderEmail.toLowerCase().slice(0, 150) : undefined,
      department: ts.department.slice(0, 120),
      schoolName: ts.schoolName.slice(0, 200),
      agencyName: ts.agencyName.slice(0, 200),
      subject: ts.subject,
      concurrentRole: (ts.concurrentRole || '').slice(0, 150),
      classes: ts.classes.slice(0, 30),
      assignedPeriodsPerWeek: Number(ts.assignedPeriodsPerWeek) || 0,
      ratePerPeriod: Number(ts.ratePerPeriod) || 0,
      month: Number(ts.month),
      year: Number(ts.year),
      totalStandardPeriods: Number(ts.totalStandardPeriods) || 0,
      totalTaughtPeriods: Number(ts.totalTaughtPeriods) || 0,
      totalAllowancePeriods: Number(ts.totalAllowancePeriods) || 0,
      totalAmount: Number(ts.totalAmount) || 0,
      status: ts.status,
      weeks: ts.weeks.slice(0, 6),
      locationName: ts.locationName?.slice(0, 100),
      signDay: ts.signDay,
      vicePrincipalName: ts.vicePrincipalName?.slice(0, 100),
      departmentHeadName: ts.departmentHeadName?.slice(0, 100),
      updatedAt: serverTimestamp(),
    });
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTimesheetCloud(id: string): Promise<void> {
  if (!auth.currentUser) return;
  const path = `timesheets/${id}`;
  try {
    await deleteDoc(doc(db, 'timesheets', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
