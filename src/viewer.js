import { canPreview, loadPreview, revokePreview } from "./preview-engine.js";

const VIEWPORTS = {
  desktop: { w: 1280, h: 800 },
  tablet: { w: 768, h: 1024 },
  mobile: { w: 390, h: 844 }
};

let shell;
let bar;
let stage;
let world;
let frame;
let gesture;
let currentItem = null;
let preview = null;
let viewport = "desktop";
let scale = 1;
let tx = 0;
let ty = 0;
let fitScale = 1;
let pointers = new Map();
let lastPinch = null;
let tapStart = null;
let onExit = null;

export function setupViewer(handlers = {}) {
  onExit = handlers.onExit || null;
  if (document.getElementById("viewer")) return;
  shell = document.createElement("section");
  shell.id = "viewer";
  shell.className = "viewer";
  shell.innerHTML = `
    <div class="viewer-bar" id="viewerBar">
      <button type="button" id="viewerExit">Exit</button>
      <button type="button" id="viewerFull">Full</button>
      <button type="button" id="viewerSnap">Snap</button>
      <button type="button" data-vp="desktop">Desktop</button>
      <button type="button" data-vp="tablet">Tablet</button>
      <button type="button" data-vp="mobile">Mobile</button>
    </div>
    <div class="viewer-stage" id="viewerStage">
      <div class="viewer-world" id="viewerWorld">
        <div class="viewer-frame" id="viewerFrame"></div>
      </div>
      <div class="viewer-gesture" id="viewerGesture"></div>
    </div>`;
  document.body.appendChild(shell);
  bar = shell.querySelector("#viewerBar");
  stage = shell.querySelector("#viewerStage");
  world = shell.querySelector("#viewerWorld");
  frame = shell.querySelector("#viewerFrame");
  gesture = shell.querySelector("#viewerGesture");
  shell.querySelector("#viewerExit").addEventListener("click", closeViewer);
  shell.querySelector("#viewerFull").addEventListener("click", toggleFull);
  shell.querySelector("#viewerSnap").addEventListener("click", snapshot);
  bar.querySelectorAll("[data-vp]").forEach((button) => {
    button.addEventListener("click", () => setViewport(button.getAttribute("data-vp")));
  });
  bindGestures();
  window.addEventListener("resize", () => {
    if (shell.classList.contains("is-open")) refit(true);
  });
  window.addEventListener("orientationchange", () => {
    if (!shell.classList.contains("is-open")) return;
    window.setTimeout(() => refit(true), 250);
  });
}

export async function openViewer(item) {
  if (!canPreview(item)) return false;
  setupViewer();
  currentItem = item;
  revokePreview(preview);
  preview = await loadPreview(item);
  renderContent();
  shell.classList.add("is-open");
  shell.classList.remove("is-full");
  document.body.style.overflow = "hidden";
  setViewport(viewport);
  return true;
}

export function closeViewer() {
  if (!shell) return;
  shell.classList.remove("is-open", "is-full");
  document.body.style.overflow = "";
  frame.innerHTML = "";
  revokePreview(preview);
  preview = null;
  currentItem = null;
  if (onExit) onExit();
}

function setViewport(name) {
  viewport = VIEWPORTS[name] ? name : "desktop";
  bar.querySelectorAll("[data-vp]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-vp") === viewport);
  });
  applyFrameSize();
  refit(true);
}

function applyFrameSize() {
  const size = VIEWPORTS[viewport];
  frame.style.width = `${size.w}px`;
  frame.style.height = `${size.h}px`;
}

function renderContent() {
  frame.innerHTML = "";
  if (!preview) return;
  if (preview.mode === "image") {
    const img = document.createElement("img");
    img.alt = currentItem.name;
    img.src = preview.url;
    frame.appendChild(img);
    return;
  }
  if (preview.mode === "pdf") {
    const embed = document.createElement("embed");
    embed.type = "application/pdf";
    embed.src = preview.url;
    frame.appendChild(embed);
    return;
  }
  if (preview.mode === "html") {
    const iframe = document.createElement("iframe");
    iframe.title = currentItem.name;
    iframe.src = preview.url;
    frame.appendChild(iframe);
    return;
  }
  const pre = document.createElement("pre");
  pre.textContent = preview.text || "";
  frame.appendChild(pre);
}

function refit(resetUser) {
  const stageBox = stage.getBoundingClientRect();
  const size = VIEWPORTS[viewport];
  const widthFit = stageBox.width / size.w;
  fitScale = Math.max(0.05, widthFit);
  if (resetUser) {
    scale = 1;
    tx = 0;
    ty = ((stageBox.height - size.h * fitScale) / 2) / fitScale;
  }
  applyTransform();
}

function applyTransform() {
  const s = fitScale * scale;
  world.style.transform = `translate(${tx * s}px, ${ty * s}px) scale(${s})`;
}

function bindGestures() {
  gesture.addEventListener("touchstart", onTouchStart, { passive: false });
  gesture.addEventListener("touchmove", onTouchMove, { passive: false });
  gesture.addEventListener("touchend", onTouchEnd, { passive: false });
  gesture.addEventListener("touchcancel", onTouchEnd, { passive: false });
}

function onTouchStart(event) {
  event.preventDefault();
  for (const touch of event.changedTouches) {
    pointers.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
  }
  if (pointers.size === 1) {
    const touch = event.changedTouches[0];
    tapStart = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  } else {
    tapStart = null;
    lastPinch = pinchState();
  }
}

function onTouchMove(event) {
  event.preventDefault();
  for (const touch of event.changedTouches) {
    pointers.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
  }
  if (pointers.size < 2 || !lastPinch) return;
  const next = pinchState();
  if (!next) return;
  const s = fitScale * scale;
  tx += (next.x - lastPinch.x) / s;
  ty += (next.y - lastPinch.y) / s;
  const ratio = next.dist / lastPinch.dist;
  if (Number.isFinite(ratio) && ratio > 0) {
    scale = clamp(scale * ratio, 0.25, 8);
  }
  lastPinch = pinchState();
  applyTransform();
}

function onTouchEnd(event) {
  event.preventDefault();
  const wasTap = pointers.size === 1 && tapStart && Date.now() - tapStart.t < 350;
  const tap = tapStart;
  for (const touch of event.changedTouches) pointers.delete(touch.identifier);
  if (pointers.size < 2) lastPinch = null;
  if (wasTap && tap && event.changedTouches.length === 1) {
    const dx = event.changedTouches[0].clientX - tap.x;
    const dy = event.changedTouches[0].clientY - tap.y;
    if (Math.hypot(dx, dy) < 10) forwardTap(tap.x, tap.y);
  }
  if (pointers.size === 0) tapStart = null;
}

function pinchState() {
  const pts = Array.from(pointers.values());
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[1];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
  };
}

function forwardTap(x, y) {
  const iframe = frame.querySelector("iframe");
  if (!iframe || !iframe.contentDocument) return;
  gesture.style.pointerEvents = "none";
  const rect = iframe.getBoundingClientRect();
  const hit = iframe.contentDocument.elementFromPoint(
    (x - rect.left) * (iframe.clientWidth / Math.max(rect.width, 1)),
    (y - rect.top) * (iframe.clientHeight / Math.max(rect.height, 1))
  );
  gesture.style.pointerEvents = "";
  if (hit) hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: iframe.contentWindow }));
}

function toggleFull() {
  shell.classList.toggle("is-full");
  window.setTimeout(() => refit(true), 60);
}

async function snapshot() {
  try {
    const blob = await captureBlob();
    const file = new File([blob], `${safeName(currentItem?.name || "preview")}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "DEBOOG2K" });
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    window.alert(error.message || "Snapshot failed.");
  }
}

async function captureBlob() {
  if (preview?.mode === "image" && preview.blob) return preview.blob;
  const iframe = frame.querySelector("iframe");
  if (iframe && iframe.contentDocument) {
    return rasterizeDocument(iframe.contentDocument);
  }
  if (preview?.mode === "text") {
    return rasterizeText(preview.text || "");
  }
  throw new Error("Snapshot cannot capture this preview.");
}

function rasterizeDocument(doc) {
  const width = Math.max(doc.documentElement.scrollWidth, VIEWPORTS[viewport].w);
  const height = Math.max(doc.documentElement.scrollHeight, 1);
  const html = new XMLSerializer().serializeToString(doc.documentElement);
  return svgToPng(html, width, height);
}

function rasterizeText(text) {
  const escaped = text.replace(/&/g, "&").replace(/</g, "<");
  const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="white-space:pre-wrap;font:13px monospace;padding:16px">${escaped}</div>`;
  return svgToPng(html, VIEWPORTS[viewport].w, VIEWPORTS[viewport].h);
}

function svgToPng(html, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Snapshot failed."))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Snapshot failed."));
    };
    img.src = url;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeName(name) {
  return String(name).replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "preview";
}
