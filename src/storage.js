const DB_NAME = "deboog2k";
const DB_VERSION = 1;

let dbPromise = null;
let memory = { folders: [], items: [], blobs: [] };
let useMemory = false;

function openDb() {
  if (useMemory) return Promise.reject(new Error("memory"));
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    useMemory = true;
    return Promise.reject(new Error("memory"));
  }
  dbPromise = new Promise((resolve, reject) => {
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
      req.onerror = () => {
        useMemory = true;
        dbPromise = null;
        reject(req.error || new Error("Storage blocked."));
      };
    } catch (error) {
      useMemory = true;
      dbPromise = null;
      reject(error);
    }
  });
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memStore(storeName).slice();
  }
}

export async function getById(storeName, id) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memStore(storeName).find((entry) => entry.id === id) || null;
  }
}

export async function put(storeName, value) {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await txDone(tx);
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
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    await txDone(tx);
  } catch {
    memory[storeName] = memStore(storeName).filter((entry) => entry.id !== id);
  }
}

export async function putItemWithBlob(item, blobRecord) {
  try {
    const db = await openDb();
    const tx = db.transaction(["items", "blobs"], "readwrite");
    tx.objectStore("items").put(item);
    if (blobRecord) tx.objectStore("blobs").put(blobRecord);
    await txDone(tx);
    return item;
  } catch {
    await put("items", item);
    if (blobRecord) await put("blobs", blobRecord);
    return item;
  }
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
