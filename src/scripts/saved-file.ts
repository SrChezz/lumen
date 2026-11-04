// Keeps the last PDF opened from disk in IndexedDB, so a reload or a crashed
// tab can bring it back. The file stays in this browser; nothing is uploaded.

export type SavedFile = { name: string; key: string; blob: Blob };

/** Files bigger than this aren't kept. */
export const MAX_SAVED_BYTES = 100 * 1024 * 1024;

const DB_NAME = "lumen";
const STORE = "files";
const LAST = "last";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function saveFile(file: SavedFile) {
  try { await run("readwrite", (s) => s.put(file, LAST)); } catch {}
}

export async function loadFile(): Promise<SavedFile | null> {
  try {
    const v = (await run("readonly", (s) => s.get(LAST))) as SavedFile | undefined;
    return v && v.blob instanceof Blob && typeof v.name === "string" && typeof v.key === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function forgetFile() {
  try { await run("readwrite", (s) => s.delete(LAST)); } catch {}
}
