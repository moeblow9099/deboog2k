import { getById } from "./storage.js";

const PREVIEWABLE = new Set(["html", "image", "text", "css", "js", "json", "pdf"]);

export function canPreview(item) {
  return Boolean(item && PREVIEWABLE.has(item.type));
}

export async function loadPreview(item) {
  const record = await getById("blobs", item.id);
  if (!record || !record.blob) throw new Error("File content is missing.");
  const blob = record.blob;
  if (item.type === "image") {
    return { mode: "image", url: URL.createObjectURL(blob), blob };
  }
  if (item.type === "pdf") {
    return { mode: "pdf", url: URL.createObjectURL(blob), blob };
  }
  const text = await blob.text();
  if (item.type === "html") {
    return { mode: "html", url: URL.createObjectURL(new Blob([text], { type: "text/html" })), blob, text };
  }
  return { mode: "text", text, blob };
}

export function revokePreview(preview) {
  if (preview && preview.url) URL.revokeObjectURL(preview.url);
}
