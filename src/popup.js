(function initializePopup(globalScope) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    fbis_enable_like_confirm: true,
    fbis_enable_cosmetic_badge: true,
    fbis_include_post_info: true,
    fbis_default_download_mode: "zip"
  });
  const ISSUE_NEW_URL = "https://github.com/KiritoMainBro88/kmb-face/issues/new";

  function buildDiagnosticsMarkdown({ version = "unknown", userAgent = "unknown", logs = [] } = {}) {
    const Logger = globalScope.FBISLogger;
    const safeVersion = Logger?.sanitizeText?.(version) || String(version);
    const safeUserAgent = Logger?.sanitizeText?.(userAgent) || String(userAgent);
    const formattedLogs = Logger?.formatEntries?.(logs) ||
      (logs.length ? logs.map((item) => JSON.stringify(item)).join("\n") : "(no diagnostic events)");
    return [
      "## Mô tả lỗi",
      "<!-- Mô tả ngắn lỗi bạn gặp -->",
      "",
      "## Môi trường",
      `- Extension: v${safeVersion}`,
      `- Browser: ${safeUserAgent}`,
      "",
      "## Diagnostic logs (đã khử dữ liệu nhạy cảm)",
      "```text",
      formattedLogs,
      "```"
    ].join("\n");
  }

  function buildIssueUrl(markdown) {
    return `${ISSUE_NEW_URL}?title=${encodeURIComponent("[Bug] Lỗi phát sinh")}&body=${encodeURIComponent(markdown)}`;
  }

  function normalizeSettings(value = {}) {
    return {
      fbis_enable_like_confirm: value.fbis_enable_like_confirm !== false,
      fbis_enable_cosmetic_badge: value.fbis_enable_cosmetic_badge !== false,
      fbis_include_post_info: value.fbis_include_post_info !== false,
      fbis_default_download_mode:
        value.fbis_default_download_mode === "manager" ? "manager" : "zip"
    };
  }

  async function initializeBrowserPopup() {
    if (!globalScope.document || !globalScope.chrome?.storage?.local) return;

    const controls = {
      likeConfirm: document.getElementById("like-confirm"),
      cosmeticBadge: document.getElementById("cosmetic-badge"),
      postInfo: document.getElementById("post-info"),
      modes: Array.from(document.querySelectorAll('input[name="download-mode"]')),
      status: document.getElementById("status"),
      copyLogs: document.getElementById("copy-logs"),
      reportBug: document.getElementById("report-bug")
    };

    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const settings = normalizeSettings(stored);
    controls.likeConfirm.checked = settings.fbis_enable_like_confirm;
    controls.cosmeticBadge.checked = settings.fbis_enable_cosmetic_badge;
    controls.postInfo.checked = settings.fbis_include_post_info;
    controls.modes.find((input) => input.value === settings.fbis_default_download_mode).checked = true;

    let statusTimer = 0;
    const showStatus = (message = "Đã lưu", isError = false) => {
      globalScope.clearTimeout(statusTimer);
      controls.status.textContent = message;
      controls.status.classList.toggle("error", isError);
      controls.status.classList.add("show");
      statusTimer = globalScope.setTimeout(() => controls.status.classList.remove("show"), 1600);
    };

    const saveBooleans = async () => {
      await chrome.storage.local.set({
        fbis_enable_like_confirm: controls.likeConfirm.checked,
        fbis_enable_cosmetic_badge: controls.cosmeticBadge.checked,
        fbis_include_post_info: controls.postInfo.checked
      });
      globalScope.FBISLogger?.info("popup", "SETTINGS_UPDATED");
      showStatus();
    };

    for (const control of [controls.likeConfirm, controls.cosmeticBadge, controls.postInfo]) {
      control.addEventListener("change", () => void saveBooleans());
    }
    for (const input of controls.modes) {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        await chrome.storage.local.set({ fbis_default_download_mode: input.value });
        globalScope.FBISLogger?.info("popup", `DOWNLOAD_MODE_${input.value.toUpperCase()}`);
        showStatus();
      });
    }

    async function collectDiagnostics() {
      let logs = [];
      try {
        const response = await chrome.runtime.sendMessage({ type: "FBIS_GET_DIAGNOSTIC_LOGS" });
        logs = Array.isArray(response?.entries) ? response.entries : [];
      } catch (error) {
        globalScope.FBISLogger?.warn("popup", `LOG_FETCH_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        logs = globalScope.FBISLogger?.getEntries?.() || [];
      }
      return buildDiagnosticsMarkdown({
        version: chrome.runtime.getManifest().version,
        userAgent: globalScope.navigator?.userAgent || "unknown",
        logs
      });
    }

    controls.copyLogs.addEventListener("click", async () => {
      try {
        const markdown = await collectDiagnostics();
        await navigator.clipboard.writeText(markdown);
        globalScope.FBISLogger?.info("popup", "DIAGNOSTICS_COPIED");
        showStatus("Đã copy log");
      } catch (error) {
        globalScope.FBISLogger?.error("popup", `COPY_LOGS_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        showStatus("Không copy được log", true);
      }
    });

    controls.reportBug.addEventListener("click", async () => {
      try {
        const markdown = await collectDiagnostics();
        await chrome.tabs.create({ url: buildIssueUrl(markdown) });
        globalScope.FBISLogger?.info("popup", "BUG_REPORT_OPENED");
        showStatus("Đã mở GitHub");
      } catch (error) {
        globalScope.FBISLogger?.error("popup", `BUG_REPORT_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        showStatus("Không mở được GitHub", true);
      }
    });
  }

  const api = { DEFAULT_SETTINGS, buildDiagnosticsMarkdown, buildIssueUrl, normalizeSettings };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    void initializeBrowserPopup();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
