const DB_NAME = "deboog2k";
const DB_VERSION = 1;
const OPEN_MS = 600;

let dbPromise = null;
let memory = { folders: [], items: [], blobs: [] };
let useMemory = false;

function failMemory(reason) {
  useMemory = true;
  dbPromise = null;
  return Promise.reject(reason || new Error("memory"));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function openDb() {
  if (useMemory) return failMemory();
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) return failMemory();
  dbPromise = withTimeout(
    new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("folders")) {
            db.createObjectStore("folders", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("items")) {
            const items = db.createObjectStore("items", { keyPath: "id" });
            items.createIndex("folderId", "folderId", { unique: false });
            items.createIndex("savedAt", "savedAt", { unique: false });
          }
          if (!db.objectStoreNames.contains("blobs")) {
            db.createObjectStore("blobs", { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("Storage blocked."));
      } catch (error) {
        reject(error);
      }
    }),
    OPEN_MS
  ).catch((error) => failMemory(error));
  return dbPromise;
}

function memStore(name) {
  return memory[name] || (memory[name] = []);
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll(storeName) {
  try {
    const db = await openDb();
    if (useMemory || !db) throw new Error("memory");
    return await withTimeout(
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
      OPEN_MS
    );
  } catch {
    return memStore(storeName).slice();
  }
}

export async function getById(storeName, id) {
  try {
    const db = await openDb();
    if (useMemory || !db) throw new Error("memory");
    return await withTimeout(
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }),
      OPEN_MS
    );
  } catch {
    return memStore(storeName).find((entry) => entry.id === id) || null;
  }
}

export async function put(storeName, value) {
  try {
    const db = await openDb();
    if (useMemory || !db) throw new Error("memory");
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await withTimeout(txDone(tx), OPEN_MS);
    return value;
  } catch {
    const store = memStore(storeName);
    const index = store.findIndex((entry) => entry.id === value.id);
    if (index >= 0) store[index] = value;
    else store.push(value);
    return value;
  }
}

export async function remove(storeName, id) {
  try {
    const db = await openDb();
    if (useMemory || !db) throw new Error("memory");
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    await withTimeout(txDone(tx), OPEN_MS);
  } catch {
    memory[storeName] = memStore(storeName).filter((entry) => entry.id !== id);
  }
}

export async function putItemWithBlob(item, blobRecord) {
  let record = blobRecord;
  if (blobRecord && blobRecord.blob) {
    try {
      const buf = await withTimeout(blobRecord.blob.arrayBuffer(), OPEN_MS);
      record = {
        id: blobRecord.id,
        blob: new Blob([buf], { type: blobRecord.blob.type || "application/octet-stream" })
      };
    } catch {
      record = blobRecord;
    }
  }
  try {
    const db = await openDb();
    if (useMemory || !db) throw new Error("memory");
    const tx = db.transaction(["items", "blobs"], "readwrite");
    tx.objectStore("items").put(item);
    if (record) tx.objectStore("blobs").put(record);
    await withTimeout(txDone(tx), OPEN_MS);
    return item;
  } catch {
    await put("items", item);
    if (record) await put("blobs", record);
    return item;
  }
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
