import { getAll, put, remove, newId } from "./storage.js";
import { state, setState } from "./state.js";
import { listLiveItems, loadItems } from "./library.js";

export async function loadFolders() {
  const folders = await getAll("folders");
  setState({ folders });
  return folders;
}

export function folderById(id) {
  return state.folders.find((folder) => folder.id === id) || null;
}

export function childFolders(parentId) {
  return state.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function folderPath(folderId) {
  const path = [];
  let current = folderId;
  const guard = new Set();
  while (current && !guard.has(current)) {
    guard.add(current);
    const folder = folderById(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export async function createFolder(name, parentId = state.currentFolderId) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Folder name is required.");
  const now = Date.now();
  const folder = {
    id: newId(),
    name: clean,
    parentId: parentId || null,
    createdAt: now,
    updatedAt: now
  };
  await put("folders", folder);
  await loadFolders();
  return folder;
}

export async function renameFolder(id, name) {
  const folder = folderById(id);
  if (!folder) throw new Error("Folder not found.");
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Folder name is required.");
  folder.name = clean;
  folder.updatedAt = Date.now();
  await put("folders", folder);
  await loadFolders();
  return folder;
}

export async function deleteFolder(id) {
  const folder = folderById(id);
  if (!folder) throw new Error("Folder not found.");
  const liveItems = listLiveItems().filter((item) => item.folderId === id);
  for (const item of liveItems) {
    item.folderId = folder.parentId || null;
    item.modifiedAt = Date.now();
    await put("items", item);
  }
  const children = childFolders(id);
  for (const child of children) {
    child.parentId = folder.parentId || null;
    child.updatedAt = Date.now();
    await put("folders", child);
  }
  await remove("folders", id);
  await loadFolders();
  await loadItems();
  if (state.currentFolderId === id) {
    setState({ currentFolderId: folder.parentId || null });
  }
}
