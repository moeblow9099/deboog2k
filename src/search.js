export function matchesQuery(entry, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [entry.name, entry.originalName, entry.type, entry.mainEntry]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function typeLabel(type) {
  switch (type) {
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
      return "JavaScript";
    case "json":
      return "JSON";
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "media":
      return "Media";
    default:
      return "File";
  }
}
