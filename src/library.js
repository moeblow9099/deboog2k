import { getAll, put, putItemWithBlob, getById, newId } from "./storage.js";
import { state, setState } from "./state.js";

export async function loadItems() {
  const items = await getAll("items");
  setState({ items });
  return items;
}

export function listLiveItems() {
  return state.items.filter((item) => !item.deletedAt);
}

export function itemsInFolder(folderId) {
  return listLiveItems()
    .filter((item) => item.folderId === folderId)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveImportedFile({ name, originalName, type, mime, size, folderId, blob }) {
  const now = Date.now();
  const item = {
    id: newId(),
    name,
    originalName: originalName || name,
    type,
    mime: mime || "application/octet-stream",
    size: size || 0,
    savedAt: now,
    modifiedAt: now,
    viewedAt: null,
    folderId: folderId || null,
    deletedAt: null,
    fileCount: 1,
    mainEntry: name
  };
  await putItemWithBlob(item, { id: item.id, blob });
  await loadItems();
  return item;
}

export async function renameItem(id, name) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("File not found.");
  const clean = String(name || "").trim();
  if (!clean) throw new Error("File name is required.");
  item.name = clean;
  item.modifiedAt = Date.now();
  await put("items", item);
  await loadItems();
  return item;
}

export async function moveItem(id, folderId) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("File not found.");
  item.folderId = folderId || null;
  item.modifiedAt = Date.now();
  await put("items", item);
  await loadItems();
  return item;
}

export async function duplicateItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("File not found.");
  const blobRecord = await getById("blobs", id);
  const copy = {
    ...item,
    id: newId(),
    name: nextCopyName(item.name),
    savedAt: Date.now(),
    modifiedAt: Date.now(),
    viewedAt: null,
    deletedAt: null
  };
  await putItemWithBlob(copy, blobRecord ? { id: copy.id, blob: blobRecord.blob } : null);
  await loadItems();
  return copy;
}

export async function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("File not found.");
  item.deletedAt = Date.now();
  item.modifiedAt = Date.now();
  await put("items", item);
  await loadItems();
  return item;
}

export async function restoreItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error("File not found.");
  item.deletedAt = null;
  item.modifiedAt = Date.now();
  await put("items", item);
  await loadItems();
  return item;
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function nextCopyName(name) {
  const dot = name.lastIndexOf(".");
  if (dot > 0) return `${name.slice(0, dot)} copy${name.slice(dot)}`;
  return `${name} copy`;
}
