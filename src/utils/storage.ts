import type {
  LocalAccountCredential,
  LocalBackupSnapshot,
  PersonnelMember,
  SystemSettings,
  TimesheetRecord,
} from '../types';
import { DEFAULT_SETTINGS } from './calculations';

const DB_NAME = 'outdoor-allowance-db';
const DB_VERSION = 1;

const STORES = {
  META: 'meta',
  PERSONNEL: 'personnel',
  TIMESHEETS: 'timesheets',
  ACCOUNTS: 'local_accounts',
  BACKUPS: 'backups',
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.PERSONNEL)) {
        db.createObjectStore(STORES.PERSONNEL, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TIMESHEETS)) {
        db.createObjectStore(STORES.TIMESHEETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
        db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'username' });
      }
      if (!db.objectStoreNames.contains(STORES.BACKUPS)) {
        db.createObjectStore(STORES.BACKUPS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbReplaceAll<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLocalSettings(): Promise<SystemSettings> {
  try {
    const rec = await idbGet<{ key: string; value: SystemSettings }>(STORES.META, 'settings');
    return rec?.value ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveLocalSettings(settings: SystemSettings): Promise<void> {
  await idbPut(STORES.META, { key: 'settings', value: settings });
}

export async function loadLocalPersonnel(): Promise<PersonnelMember[]> {
  try {
    return await idbGetAll<PersonnelMember>(STORES.PERSONNEL);
  } catch {
    return [];
  }
}

export async function saveLocalPersonnelList(list: PersonnelMember[]): Promise<void> {
  await idbReplaceAll(STORES.PERSONNEL, list);
}

export async function upsertLocalPersonnel(member: PersonnelMember): Promise<void> {
  await idbPut(STORES.PERSONNEL, member);
}

export async function deleteLocalPersonnel(id: string): Promise<void> {
  await idbDelete(STORES.PERSONNEL, id);
}

export async function loadLocalTimesheets(): Promise<TimesheetRecord[]> {
  try {
    return await idbGetAll<TimesheetRecord>(STORES.TIMESHEETS);
  } catch {
    return [];
  }
}

export async function saveLocalTimesheetsList(list: TimesheetRecord[]): Promise<void> {
  await idbReplaceAll(STORES.TIMESHEETS, list);
}

export async function upsertLocalTimesheet(ts: TimesheetRecord): Promise<void> {
  await idbPut(STORES.TIMESHEETS, ts);
}

export async function deleteLocalTimesheet(id: string): Promise<void> {
  await idbDelete(STORES.TIMESHEETS, id);
}

export async function loadLocalAccounts(): Promise<LocalAccountCredential[]> {
  try {
    return await idbGetAll<LocalAccountCredential>(STORES.ACCOUNTS);
  } catch {
    return [];
  }
}

export async function saveLocalAccountsList(list: LocalAccountCredential[]): Promise<void> {
  await idbReplaceAll(STORES.ACCOUNTS, list);
}

export async function saveLocalAccount(account: LocalAccountCredential): Promise<void> {
  await idbPut(STORES.ACCOUNTS, account);
}

export async function deleteLocalAccount(username: string): Promise<void> {
  await idbDelete(STORES.ACCOUNTS, username);
}

export async function createLocalBackupSnapshot(
  reason: string,
  settings: SystemSettings,
  personnel: PersonnelMember[],
  timesheets: TimesheetRecord[]
): Promise<LocalBackupSnapshot> {
  const snapshot: LocalBackupSnapshot = {
    id: `bk_${Date.now()}`,
    createdAt: new Date().toISOString(),
    reason,
    settings,
    personnel,
    timesheets,
  };
  await idbPut(STORES.BACKUPS, snapshot);

  // Keep only the latest 12 snapshots locally
  const all = await idbGetAll<LocalBackupSnapshot>(STORES.BACKUPS);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (all.length > 12) {
    for (const old of all.slice(12)) {
      await idbDelete(STORES.BACKUPS, old.id);
    }
  }
  return snapshot;
}

export async function loadLocalBackups(): Promise<LocalBackupSnapshot[]> {
  try {
    const list = await idbGetAll<LocalBackupSnapshot>(STORES.BACKUPS);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSalt(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function exportBackupJSON(
  settings: SystemSettings,
  personnel: PersonnelMember[],
  timesheets: TimesheetRecord[]
): void {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    personnel,
    timesheets,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sao_luu_Phu_cap_san_bai_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
