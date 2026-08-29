import { state, setState, subscribe } from "./state.js";
import { loadFolders, childFolders, folderPath, createFolder, renameFolder, deleteFolder } from "./folders.js";
import {
  loadItems,
  itemsInFolder,
  saveImportedFile,
  renameItem,
  moveItem,
  duplicateItem,
  deleteItem,
  restoreItem,
  formatSize,
  formatDate
} from "./library.js";
import { recentItems, deletedItems } from "./recents.js";
import { matchesQuery, typeLabel } from "./search.js";
import { fileToRecord, detectPastedText } from "./import-engine.js";
import { canPreview } from "./preview-engine.js";
import { setupViewer, openViewer } from "./viewer.js";

const els = {
  badge: document.getElementById("buildBadge"),
  breadcrumb: document.getElementById("breadcrumb"),
  search: document.getElementById("searchInput"),
  library: document.getElementById("library"),
  status: document.getElementById("statusLine"),
  fileInput: document.getElementById("fileInput"),
  folderInput: document.getElementById("folderInput"),
  modalRoot: document.getElementById("modalRoot")
};

subscribe(render);
boot();

document.getElementById("newFolderBtn").addEventListener("click", onNewFolder);
document.getElementById("uploadBtn").addEventListener("click", () => els.fileInput.click());
document.getElementById("folderImportBtn").addEventListener("click", () => els.folderInput.click());
document.getElementById("pasteBtn").addEventListener("click", openPaste);
document.getElementById("historyBtn").addEventListener("click", openHistory);
els.search.addEventListener("input", () => setState({ query: els.search.value }));
els.fileInput.addEventListener("change", async (event) => {
  await importFileList(event.target.files);
  event.target.value = "";
});
els.folderInput.addEventListener("change", async (event) => {
  await importFileList(event.target.files);
  event.target.value = "";
});

async function boot() {
  els.badge.textContent = state.buildVersion;
  try {
    await loadFolders();
    await loadItems();
    setupViewer();
    setState({ ready: true, status: "" });
  } catch (error) {
    setState({ status: error.message || "Storage failed to open." });
  }
}

function render() {
  renderBreadcrumb();
  renderLibrary();
  renderStatus();
}

function renderBreadcrumb() {
  const path = folderPath(state.currentFolderId);
  const parts = [`<button type="button" class="crumb" data-folder="">Files</button>`];
  path.forEach((folder, index) => {
    const current = index === path.length - 1;
    parts.push(`<span class="crumb-sep">/</span>`);
    parts.push(
      `<button type="button" class="crumb"${current ? ' aria-current="page"' : ""} data-folder="${escapeAttr(folder.id)}">${escapeHtml(folder.name)}</button>`
    );
  });
  els.breadcrumb.innerHTML = parts.join("");
  els.breadcrumb.querySelectorAll("[data-folder]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({ currentFolderId: button.getAttribute("data-folder") || null });
    });
  });
}

function renderLibrary() {
  const folders = childFolders(state.currentFolderId).filter((folder) => matchesQuery(folder, state.query));
  const files = itemsInFolder(state.currentFolderId).filter((item) => matchesQuery(item, state.query));
  if (!folders.length && !files.length) {
    els.library.innerHTML = `<div class="empty"><strong>${state.query ? "No matches" : "No files yet"}</strong>${state.query ? "Try another search." : "Upload, paste, or import a folder."}</div>`;
    return;
  }
  const html = [
    ...folders.map((folder) => rowHtml("folder", folder.id, folder.name, "Folder", "folder")),
    ...files.map((item) => rowHtml("file", item.id, item.name, `${typeLabel(item.type)} · ${formatSize(item.size)}`, item.type))
  ].join("");
  els.library.innerHTML = html;
  els.library.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-kind");
      const id = button.getAttribute("data-open");
      if (kind === "folder") setState({ currentFolderId: id });
      else openItem(id);
    });
  });
  els.library.querySelectorAll("[data-more]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const kind = button.getAttribute("data-kind");
      const id = button.getAttribute("data-more");
      if (kind === "folder") openFolderActions(id);
      else openFileActions(id);
    });
  });
}

function rowHtml(kind, id, name, meta, iconType) {
  return `<div class="row">
    <button type="button" class="row-hit" data-kind="${kind}" data-open="${escapeAttr(id)}">
      <span class="row-icon ${escapeAttr(iconType)}">${kind === "folder" ? "F" : iconType.slice(0, 1).toUpperCase()}</span>
      <span class="row-main">
        <span class="row-name">${escapeHtml(name)}</span>
        <span class="row-meta">${escapeHtml(meta)}</span>
      </span>
    </button>
    <button type="button" class="row-more" data-kind="${kind}" data-more="${escapeAttr(id)}">More</button>
  </div>`;
}

function renderStatus() {
  if (!state.status) {
    els.status.hidden = true;
    els.status.textContent = "";
    return;
  }
  els.status.hidden = false;
  els.status.textContent = state.status;
}

async function importFileList(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let saved = 0;
  for (const file of files) {
    if (shouldSkipImport(file)) continue;
    const relative = file.webkitRelativePath || file.name;
    const record = fileToRecord(file, relative);
    await saveImportedFile({
      ...record,
      folderId: state.currentFolderId
    });
    saved += 1;
  }
  setState({ status: saved ? `Saved ${saved} item${saved === 1 ? "" : "s"}.` : "Nothing imported." });
  const last = state.items.filter((item) => !item.deletedAt).sort((a, b) => b.savedAt - a.savedAt)[0];
  if (last && canPreview(last)) await openViewer(last);
}

function shouldSkipImport(file) {
  const path = `${file.webkitRelativePath || file.name}`.replace(/\\/g, "/");
  const base = path.split("/").pop();
  if (!base || base === ".DS_Store") return true;
  if (path.includes("__MACOSX/")) return true;
  return false;
}

async function onNewFolder() {
  const name = await promptText("New folder", "Name", "");
  if (name == null) return;
  try {
    await createFolder(name);
    setState({ status: "Folder created." });
  } catch (error) {
    setState({ status: error.message });
  }
}

function openPaste() {
  const body = `<p class="detect-line" id="pasteDetect">Detected: Text</p>
    <div class="field"><label for="pasteText">Content</label><textarea id="pasteText"></textarea></div>
    <div class="actions">
      <button type="button" class="primary" id="pasteSave">Save</button>
      <button type="button" id="sheetCancel">Close</button>
    </div>`;
  const sheet = openSheet("Paste", body);
  const textarea = sheet.querySelector("#pasteText");
  const detect = sheet.querySelector("#pasteDetect");
  const refresh = () => {
    detect.textContent = `Detected: ${typeLabel(detectPastedText(textarea.value).type)}`;
  };
  textarea.addEventListener("input", refresh);
  sheet.querySelector("#pasteSave").addEventListener("click", async () => {
    const value = textarea.value;
    if (!String(value).trim()) {
      setState({ status: "Paste is empty." });
      return;
    }
    const detected = detectPastedText(value);
    const blob = new Blob([value], { type: detected.mime });
    await saveImportedFile({
      name: detected.name,
      originalName: detected.name,
      type: detected.type,
      mime: detected.mime,
      size: blob.size,
      folderId: state.currentFolderId,
      blob
    });
    closeSheet();
    setState({ status: `Saved ${detected.name}.` });
    const last = state.items.filter((item) => !item.deletedAt).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (last && canPreview(last)) await openViewer(last);
  });
}

function openHistory() {
  const recents = recentItems();
  const trash = deletedItems();
  const recentHtml = recents.length
    ? recents
        .map(
          (item) => `<div class="row">
            <span class="row-icon ${escapeAttr(item.type)}">${item.type.slice(0, 1).toUpperCase()}</span>
            <span class="row-main">
              <span class="row-name">${escapeHtml(item.name)}</span>
              <span class="row-meta">Saved ${escapeHtml(formatDate(item.savedAt))}</span>
            </span>
            <button type="button" class="row-more" data-open-item="${escapeAttr(item.id)}">Open</button>
          </div>`
        )
        .join("")
    : `<div class="empty">No saved items.</div>`;
  const trashHtml = trash.length
    ? trash
        .map(
          (item) => `<div class="row">
            <span class="row-icon ${escapeAttr(item.type)}">${item.type.slice(0, 1).toUpperCase()}</span>
            <span class="row-main">
              <span class="row-name">${escapeHtml(item.name)}</span>
              <span class="row-meta">Deleted ${escapeHtml(formatDate(item.deletedAt))}</span>
            </span>
            <button type="button" class="row-more" data-restore="${escapeAttr(item.id)}">Restore</button>
          </div>`
        )
        .join("")
    : `<div class="empty">Nothing in Recently Deleted.</div>`;
  const sheet = openSheet(
    "History",
    `<h3 class="field-label">Saved</h3><div class="history-list">${recentHtml}</div>
     <h3 class="field-label">Recently Deleted</h3><div class="history-list">${trashHtml}</div>
     <div class="actions"><button type="button" id="sheetCancel">Close</button></div>`
  );
  sheet.querySelectorAll("[data-open-item]").forEach((button) => {
    button.addEventListener("click", () => {
      closeSheet();
      openItem(button.getAttribute("data-open-item"));
    });
  });
  sheet.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", async () => {
      await restoreItem(button.getAttribute("data-restore"));
      closeSheet();
      setState({ status: "Item restored." });
    });
  });
}

async function openItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (canPreview(item)) {
    try {
      await openViewer(item);
      return;
    } catch (error) {
      setState({ status: error.message || "Preview failed." });
    }
  }
  openDetails(id);
}

function openDetails(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const sheet = openSheet(
    item.name,
    `<dl class="detail-grid">
      <div><dt>Name</dt><dd>${escapeHtml(item.name)}</dd></div>
      <div><dt>Type</dt><dd>${escapeHtml(typeLabel(item.type))}</dd></div>
      <div><dt>Size</dt><dd>${escapeHtml(formatSize(item.size))}</dd></div>
      <div><dt>Saved</dt><dd>${escapeHtml(formatDate(item.savedAt))}</dd></div>
      <div><dt>Modified</dt><dd>${escapeHtml(formatDate(item.modifiedAt))}</dd></div>
      <div><dt>Original name</dt><dd>${escapeHtml(item.originalName)}</dd></div>
    </dl>
    <div class="actions">
      <button type="button" id="detailMore">More</button>
      <button type="button" id="sheetCancel">Close</button>
    </div>`
  );
  sheet.querySelector("#detailMore").addEventListener("click", () => {
    closeSheet();
    openFileActions(id);
  });
}

function openFileActions(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const sheet = openSheet(
    item.name,
    `<div class="actions">
      <button type="button" id="actRename">Rename</button>
      <button type="button" id="actMove">Move</button>
      <button type="button" id="actDuplicate">Duplicate</button>
      <button type="button" class="danger" id="actDelete">Delete</button>
      <button type="button" id="sheetCancel">Close</button>
    </div>`
  );
  sheet.querySelector("#actRename").addEventListener("click", async () => {
    closeSheet();
    const name = await promptText("Rename", "Name", item.name);
    if (name == null) return;
    await renameItem(id, name);
    setState({ status: "File renamed." });
  });
  sheet.querySelector("#actMove").addEventListener("click", () => {
    closeSheet();
    openMoveSheet(id);
  });
  sheet.querySelector("#actDuplicate").addEventListener("click", async () => {
    await duplicateItem(id);
    closeSheet();
    setState({ status: "File duplicated." });
  });
  sheet.querySelector("#actDelete").addEventListener("click", async () => {
    const ok = await confirmAction("Delete this file? It will move to Recently Deleted.");
    if (!ok) return;
    await deleteItem(id);
    closeSheet();
    setState({ status: "File moved to Recently Deleted." });
  });
}

function openFolderActions(id) {
  const folder = state.folders.find((entry) => entry.id === id);
  if (!folder) return;
  const sheet = openSheet(
    folder.name,
    `<div class="actions">
      <button type="button" id="actOpen">Open</button>
      <button type="button" id="actRename">Rename</button>
      <button type="button" class="danger" id="actDelete">Delete</button>
      <button type="button" id="sheetCancel">Close</button>
    </div>`
  );
  sheet.querySelector("#actOpen").addEventListener("click", () => {
    setState({ currentFolderId: id });
    closeSheet();
  });
  sheet.querySelector("#actRename").addEventListener("click", async () => {
    closeSheet();
    const name = await promptText("Rename folder", "Name", folder.name);
    if (name == null) return;
    await renameFolder(id, name);
    setState({ status: "Folder renamed." });
  });
  sheet.querySelector("#actDelete").addEventListener("click", async () => {
    const ok = await confirmAction("Delete this folder? Files inside will move to the parent folder.");
    if (!ok) return;
    await deleteFolder(id);
    closeSheet();
    setState({ status: "Folder deleted. Contained files were moved up." });
  });
}

function openMoveSheet(id) {
  const options = [`<option value="">Files (root)</option>`]
    .concat(state.folders.map((folder) => `<option value="${escapeAttr(folder.id)}">${escapeHtml(folder.name)}</option>`))
    .join("");
  const sheet = openSheet(
    "Move",
    `<div class="field"><label for="moveTarget">Folder</label><select id="moveTarget">${options}</select></div>
     <div class="actions"><button type="button" class="primary" id="moveSave">Move</button><button type="button" id="sheetCancel">Close</button></div>`
  );
  sheet.querySelector("#moveSave").addEventListener("click", async () => {
    const target = sheet.querySelector("#moveTarget").value || null;
    await moveItem(id, target);
    closeSheet();
    setState({ status: "File moved." });
  });
}

function promptText(title, label, value) {
  return new Promise((resolve) => {
    const sheet = openSheet(
      title,
      `<div class="field"><label for="promptInput">${escapeHtml(label)}</label><input id="promptInput" value="${escapeAttr(value)}"></div>
       <div class="actions"><button type="button" class="primary" id="promptOk">Save</button><button type="button" id="sheetCancel">Close</button></div>`
    );
    const input = sheet.querySelector("#promptInput");
    input.focus();
    input.select();
    const finish = (result) => {
      closeSheet();
      resolve(result);
    };
    sheet.querySelector("#promptOk").addEventListener("click", () => finish(input.value));
    sheet._onCancel = () => finish(null);
  });
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const sheet = openSheet(
      "Confirm",
      `<p>${escapeHtml(message)}</p>
       <div class="actions">
         <button type="button" class="danger" id="confirmOk">Delete</button>
         <button type="button" id="sheetCancel">Close</button>
       </div>`
    );
    sheet.querySelector("#confirmOk").addEventListener("click", () => {
      closeSheet();
      resolve(true);
    });
    sheet._onCancel = () => resolve(false);
  });
}

function openSheet(title, bodyHtml) {
  closeSheet();
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
    <div class="sheet-head"><h2>${escapeHtml(title)}</h2><button type="button" class="sheet-close" id="sheetCancel">Close</button></div>
    ${bodyHtml}
  </div>`;
  els.modalRoot.appendChild(backdrop);
  const sheet = backdrop.querySelector(".sheet");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) cancelSheet(sheet);
  });
  backdrop.querySelectorAll("#sheetCancel").forEach((button) => {
    button.addEventListener("click", () => cancelSheet(sheet));
  });
  document.addEventListener("keydown", onEscape);
  return sheet;
}

function cancelSheet(sheet) {
  if (sheet && typeof sheet._onCancel === "function") {
    const fn = sheet._onCancel;
    sheet._onCancel = null;
    closeSheet();
    fn();
    return;
  }
  closeSheet();
}

function closeSheet() {
  document.removeEventListener("keydown", onEscape);
  els.modalRoot.innerHTML = "";
}

function onEscape(event) {
  if (event.key === "Escape") {
    const sheet = els.modalRoot.querySelector(".sheet");
    cancelSheet(sheet);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
