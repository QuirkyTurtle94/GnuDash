/**
 * OPFS (Origin Private File System) utilities for managing
 * the persisted GNUCash database file.
 *
 * These run on the main thread using the async OPFS API.
 */

const DB_DIR = "gnucash-dashboard";
const DB_FILE = "db.gnucash";

async function getDbDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DB_DIR, { create: true });
}

export async function hasOPFSFile(): Promise<boolean> {
  try {
    const dir = await getDbDir();
    await dir.getFileHandle(DB_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFromOPFS(): Promise<void> {
  try {
    const dir = await getDbDir();
    await dir.removeEntry(DB_FILE);
  } catch {
    // File didn't exist, that's fine
  }
}

export function isOPFSSupported(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
}
