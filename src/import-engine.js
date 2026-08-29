export function detectFromName(name, mime = "") {
  const lower = String(name || "").toLowerCase();
  const typeMime = String(mime || "").toLowerCase();
  if (/\.(html|htm)$/.test(lower) || typeMime.includes("text/html")) return "html";
  if (/\.css$/.test(lower) || typeMime.includes("text/css")) return "css";
  if (/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(lower) || typeMime.includes("javascript")) return "js";
  if (/\.json$/.test(lower) || typeMime.includes("json")) return "json";
  if (/\.(txt|md|markdown|xml|yml|yaml|py|svg)$/.test(lower) || typeMime.startsWith("text/")) return "text";
  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/.test(lower) || typeMime.startsWith("image/")) return "image";
  if (/\.pdf$/.test(lower) || typeMime.includes("pdf")) return "pdf";
  if (/\.(mp3|wav|m4a|mp4|mov|webm)$/.test(lower) || typeMime.startsWith("audio/") || typeMime.startsWith("video/")) {
    return "media";
  }
  return "file";
}

export function detectPastedText(text) {
  const value = String(text || "").trim();
  if (!value) return { type: "text", name: "paste.txt", mime: "text/plain" };
  if (value.startsWith("<") && /<\/?[a-z]/i.test(value)) {
    return { type: "html", name: "paste.html", mime: "text/html" };
  }
  if (/^[\s\n]*[{[]/.test(value)) {
    try {
      JSON.parse(value);
      return { type: "json", name: "paste.json", mime: "application/json" };
    } catch {
      /* not json */
    }
  }
  if (/[{;]/.test(value) && /[.#a-z][\w-]*\s*\{/i.test(value)) {
    return { type: "css", name: "paste.css", mime: "text/css" };
  }
  return { type: "text", name: "paste.txt", mime: "text/plain" };
}

export function fileToRecord(file, relativePath = "") {
  const name = relativePath || file.name || "untitled";
  const type = detectFromName(name, file.type);
  return {
    name: name.split("/").pop(),
    originalName: file.name || name,
    type,
    mime: file.type || "application/octet-stream",
    size: file.size || 0,
    blob: file
  };
}
