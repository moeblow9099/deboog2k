import { getById } from "./storage.js";

export function canPreview(item) {
  return Boolean(item);
}

export async function loadPreview(item, blobHint) {
  let blob = blobHint || null;
  if (!blob) {
    const record = await getById("blobs", item.id);
    blob = record && record.blob;
  }
  if (!blob) throw new Error("File content is missing.");
  const type = item.type || "";
  const mime = String(item.mime || blob.type || "").toLowerCase();
  if (type === "image" || mime.startsWith("image/")) {
    return { mode: "image", url: URL.createObjectURL(blob), blob };
  }
  if (type === "pdf" || mime.includes("pdf")) {
    return { mode: "pdf", url: URL.createObjectURL(blob), blob };
  }
  if (type === "html" || mime.includes("html")) {
    const text = await blob.text();
    return { mode: "html", url: URL.createObjectURL(new Blob([text], { type: "text/html" })), blob, text };
  }
  if (type === "media" || mime.startsWith("video/") || mime.startsWith("audio/")) {
    return { mode: "media", url: URL.createObjectURL(blob), blob, mime };
  }
  if (["text", "css", "js", "json"].includes(type) || mime.startsWith("text/") || mime.includes("json") || mime.includes("javascript")) {
    return { mode: "text", text: await blob.text(), blob };
  }
  return { mode: "file", url: URL.createObjectURL(blob), blob, mime };
}

export function revokePreview(preview) {
  if (preview && preview.url) URL.revokeObjectURL(preview.url);
}
