(function initializeFilenameNaming(/** @type {any} */ globalScope) {
  "use strict";

  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const { LIMITS } = Constants;
  const DEFAULT_FILENAME_TEMPLATE = "{author}_{postId}_{index}";

  /**
   * Sanitize one filename component for cross-platform downloads.
   * @param {*} value
   * @param {string} [fallback='unknown']
   * @param {number} [maxLength=LIMITS.MAX_FILE_PART_LENGTH]
   * @returns {string}
   */
  function sanitizeFilenamePart(
    value,
    fallback = "unknown",
    maxLength = LIMITS.MAX_FILE_PART_LENGTH
  ) {
    const safe = String(value || fallback)
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._ ]+|[. _]+$/g, "")
      .slice(0, maxLength);
    return safe || fallback;
  }

  /**
   * Normalize a user-provided filename template.
   * @param {*} value
   * @returns {string}
   */
  function normalizeFilenameTemplate(value) {
    const template = String(value || "").trim();
    return template
      ? template.slice(0, LIMITS.MAX_FILENAME_TEMPLATE_LENGTH)
      : DEFAULT_FILENAME_TEMPLATE;
  }

  /**
   * Format a date as YYYYMMDD.
   * @param {Date} [date=new Date()]
   * @returns {string}
   */
  function formatDownloadDate(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  /**
   * Expand the supported filename template variables.
   * @param {string} template
   * @param {{author?: string, postId?: string, index?: number|string, date?: Date}} [context={}]
   * @returns {string}
   */
  function parseFilenameTemplate(template, context = {}) {
    const replacements = {
      author: sanitizeFilenamePart(context.author || "Facebook", "Facebook", 60),
      postId: sanitizeFilenamePart(
        context.postId || "unknown",
        "unknown",
        LIMITS.MAX_FILE_PART_LENGTH
      ),
      index: String(
        Math.max(1, Number.parseInt(String(context.index ?? ""), 10) || 1)
      ).padStart(3, "0"),
      date: formatDownloadDate(context.date instanceof Date ? context.date : new Date())
    };

    const rendered = normalizeFilenameTemplate(template).replace(
      /\{(author|postId|index|date)\}/g,
      (_match, key) => replacements[key]
    );
    return sanitizeFilenamePart(
      rendered,
      `Facebook_${replacements.postId}_${replacements.index}`,
      LIMITS.MAX_FILENAME_STEM_LENGTH
    );
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
