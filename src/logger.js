(function initializeDiagnosticLogger(/** @type {any} */ globalScope) {
  "use strict";

  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const { IPC_ACTIONS, LIMITS } = Constants;
  const MAX_EVENTS = LIMITS.MAX_LOG_EVENTS;
  const LEVELS = new Set(["INFO", "WARN", "ERROR"]);
  const events = [];

  /**
   * Remove credentials and session identifiers from diagnostic text.
   * @param {*} value
   * @returns {string}
   */
  function sanitizeText(value) {
    let text = String(value ?? "");
    const sensitiveKey = "(?:fb_dtsg|c_user|session(?:[_-]?id)?)";

    text = text.replace(
      new RegExp(`((?:[?&]|\\b)${sensitiveKey}(?:=|%3D))([^&\\s]+)`, "gi"),
      "$1[REDACTED]"
    );
    text = text.replace(
      new RegExp(`([\"']?${sensitiveKey}[\"']?\\s*:\\s*[\"']?)([^\"',}\\s]+)`, "gi"),
      "$1[REDACTED]"
    );
    text = text.replace(/\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, "Authorization: [REDACTED]");
    text = text.replace(/\bcookie\s*:\s*[^\r\n]+/gi, "Cookie: [REDACTED]");
    return text;
  }

  function normalizeEvent(event = {}) {
    const level = String(event.level || "INFO").toUpperCase();
    return {
      time: /^\d{4}-\d{2}-\d{2}T/.test(String(event.time || ""))
        ? String(event.time)
        : new Date().toISOString(),
      module: sanitizeText(event.module || "core").slice(0, LIMITS.MAX_DIAGNOSTIC_MODULE_LENGTH),
      level: LEVELS.has(level) ? level : "INFO",
      code: sanitizeText(event.code || "EVENT").slice(0, LIMITS.MAX_DIAGNOSTIC_CODE_LENGTH)
    };
  }

  function pushEvent(event) {
    events.push(normalizeEvent(event));
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    return events[events.length - 1];
  }

  function forwardToBackground(entry) {
    if (!globalScope.document || !globalScope.chrome?.runtime?.sendMessage) return;
    try {
      const pending = chrome.runtime.sendMessage({ type: IPC_ACTIONS.LOG_EVENT, entry });
      pending?.catch?.(() => undefined);
    } catch {
      // Diagnostics must never interfere with extension behavior.
    }
  }

  function record(module, level, code) {
    const entry = pushEvent({ module, level, code });
    forwardToBackground(entry);
    return entry;
  }

  /**
   * Add an entry received from another extension context.
   * @param {Object} entry
   * @returns {Object}
   */
  function receive(entry) {
    return pushEvent(entry);
  }

  /** @returns {Object[]} */
  function getEntries() {
    return events.map((entry) => ({ ...entry }));
  }

  /** @returns {void} */
  function clear() {
    events.length = 0;
  }

  /**
   * Format diagnostic entries as plain text.
   * @param {Object[]} [entries=getEntries()]
   * @returns {string}
   */
  function formatEntries(entries = getEntries()) {
    if (!Array.isArray(entries) || entries.length === 0) return "(no diagnostic events)";
    return entries
      .slice(-MAX_EVENTS)
      .map((entry) => {
        const safe = normalizeEvent(entry);
        return `${safe.time} [${safe.level}] ${safe.module} ${safe.code}`;
      })
      .join("\n");
  }

  /** @param {string} module @param {string} code @returns {Object} */
  function info(module, code) {
    return record(module, "INFO", code);
  }

  /** @param {string} module @param {string} code @returns {Object} */
  function warn(module, code) {
    return record(module, "WARN", code);
  }

  /** @param {string} module @param {string} code @returns {Object} */
  function error(module, code) {
    return record(module, "ERROR", code);
  }

  const api = Object.freeze({
    MAX_EVENTS,
    clear,
    error,
    formatEntries,
    getEntries,
    info,
    receive,
    sanitizeText,
    warn
  });

  globalScope.FBISLogger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
