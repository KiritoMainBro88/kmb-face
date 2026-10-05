(function initializeFilenameNaming(globalScope) {
  "use strict";

  const DEFAULT_FILENAME_TEMPLATE = "{author}_{postId}_{index}";
  const MAX_FILENAME_STEM_LENGTH = 160;

  function sanitizeFilenamePart(value, fallback = "unknown", maxLength = 80) {
    const safe = String(value || fallback)
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._ ]+|[. _]+$/g, "")
      .slice(0, maxLength);
    return safe || fallback;
  }

  function normalizeFilenameTemplate(value) {
    const template = String(value || "").trim();
    return template ? template.slice(0, 180) : DEFAULT_FILENAME_TEMPLATE;
  }

  function formatDownloadDate(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function parseFilenameTemplate(template, context = {}) {
    const replacements = {
      author: sanitizeFilenamePart(context.author || "Facebook", "Facebook", 60),
      postId: sanitizeFilenamePart(context.postId || "unknown", "unknown", 80),
      index: String(Math.max(1, Number.parseInt(context.index, 10) || 1)).padStart(3, "0"),
      date: formatDownloadDate(context.date instanceof Date ? context.date : new Date())
    };

    const rendered = normalizeFilenameTemplate(template).replace(
      /\{(author|postId|index|date)\}/g,
      (_match, key) => replacements[key]
    );
    return sanitizeFilenamePart(rendered, `Facebook_${replacements.postId}_${replacements.index}`, MAX_FILENAME_STEM_LENGTH);
  }

  const api = {
    DEFAULT_FILENAME_TEMPLATE,
    formatDownloadDate,
    normalizeFilenameTemplate,
    parseFilenameTemplate,
    sanitizeFilenamePart
  };

  globalScope.FBISNaming = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
