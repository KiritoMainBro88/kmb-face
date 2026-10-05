(function initializeDiagnosticLogger(globalScope) {
  "use strict";

  const MAX_EVENTS = 50;
  const LEVELS = new Set(["INFO", "WARN", "ERROR"]);
  const events = [];

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
      module: sanitizeText(event.module || "core").slice(0, 48),
      level: LEVELS.has(level) ? level : "INFO",
      code: sanitizeText(event.code || "EVENT").slice(0, 500)
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
      const pending = chrome.runtime.sendMessage({ type: "FBIS_LOG_EVENT", entry });
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

  function receive(entry) {
    return pushEvent(entry);
  }

  function getEntries() {
    return events.map((entry) => ({ ...entry }));
  }

  function clear() {
    events.length = 0;
  }

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

  const api = Object.freeze({
    MAX_EVENTS,
    clear,
    error: (module, code) => record(module, "ERROR", code),
    formatEntries,
    getEntries,
    info: (module, code) => record(module, "INFO", code),
    receive,
    sanitizeText,
    warn: (module, code) => record(module, "WARN", code)
  });

  globalScope.FBISLogger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
