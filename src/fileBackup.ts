import type { BackupV1, ReviewRecordV1 } from './model'
import { backupJson, parseBackup } from './storage'

export const CURRENT_BACKUP_FILE = 'sop-score-tracker-current.json'
export const SUGGESTED_BACKUP_FOLDER = 'Documents 안의 EDM'

const DB_NAME = 'sop-score-tracker:file-backup:v1'
const STORE_NAME = 'settings'
const DIRECTORY_KEY = 'backup-directory'

export type BackupDirectory = FileSystemDirectoryHandle & {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: 'readwrite'; startIn: 'documents' }) => Promise<BackupDirectory>
}

export function supportsFolderBackup(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function' && 'indexedDB' in window
}

export async function pickBackupDirectory(): Promise<BackupDirectory> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) throw new Error('이 브라우저는 폴더 자동 백업을 지원하지 않습니다.')
  return picker({ mode: 'readwrite', startIn: 'documents' })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function rememberBackupDirectory(directory: BackupDirectory): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(directory, DIRECTORY_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function rememberedBackupDirectory(): Promise<BackupDirectory | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DIRECTORY_KEY)
      request.onsuccess = () => resolve((request.result as BackupDirectory | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export function hasWritePermission(directory: BackupDirectory): Promise<PermissionState> {
  return directory.queryPermission({ mode: 'readwrite' })
}

export function requestWritePermission(directory: BackupDirectory): Promise<PermissionState> {
  return directory.requestPermission({ mode: 'readwrite' })
}

function isMissingFile(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

async function readTextFile(directory: BackupDirectory, name: string): Promise<string | null> {
  try {
    const file = await directory.getFileHandle(name)
    return await (await file.getFile()).text()
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

export async function readCurrentBackup(directory: BackupDirectory): Promise<BackupV1 | null> {
  const text = await readTextFile(directory, CURRENT_BACKUP_FILE)
  return text === null ? null : parseBackup(JSON.parse(text))
}

async function writeTextFile(directory: BackupDirectory, name: string, content: string): Promise<void> {
  const file = await directory.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  try {
    await writable.write(content)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

function localDate(): string {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export async function writeCurrentBackup(directory: BackupDirectory, records: ReviewRecordV1[]): Promise<string> {
  const previous = await readCurrentBackup(directory)
  if (previous) {
    const historyName = `sop-score-tracker-history-${localDate()}.json`
    if (await readTextFile(directory, historyName) === null) {
      await writeTextFile(directory, historyName, JSON.stringify(previous, null, 2))
    }
  }
  const content = backupJson(records)
  await writeTextFile(directory, CURRENT_BACKUP_FILE, content)
  return (JSON.parse(content) as BackupV1).exportedAt
}

export async function writeSafetyBackup(directory: BackupDirectory, records: ReviewRecordV1[], label: 'before-restore' | 'before-replace'): Promise<void> {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-')
  const suffix = crypto.randomUUID().slice(0, 8)
  await writeTextFile(directory, `sop-score-tracker-${label}-${timestamp}-${suffix}.json`, backupJson(records))
}
