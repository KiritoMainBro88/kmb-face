(function initializePopup(/** @type {any} */ globalScope) {
  "use strict";

  const Naming = globalScope.FBISNaming ||
    (typeof require === "function" ? require("./naming.js") : null);
  const I18n = globalScope.FBISI18n ||
    (typeof require === "function" ? require("./i18n.js") : null);
  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const { IPC_ACTIONS, STORAGE_KEYS } = Constants;
  const DEFAULT_SETTINGS = Object.freeze({
    [STORAGE_KEYS.LIKE_CONFIRM]: true,
    [STORAGE_KEYS.COSMETIC_BADGE]: true,
    [STORAGE_KEYS.INCLUDE_POST_INFO]: true,
    [STORAGE_KEYS.DEFAULT_DOWNLOAD_MODE]: "zip",
    [STORAGE_KEYS.CLEAN_FEED]: true,
    [STORAGE_KEYS.FILENAME_TEMPLATE]: Naming?.DEFAULT_FILENAME_TEMPLATE || "{author}_{postId}_{index}",
    [STORAGE_KEYS.LANGUAGE]: I18n?.DEFAULT_LANGUAGE || "auto"
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
      [STORAGE_KEYS.LIKE_CONFIRM]: value[STORAGE_KEYS.LIKE_CONFIRM] !== false,
      [STORAGE_KEYS.COSMETIC_BADGE]: value[STORAGE_KEYS.COSMETIC_BADGE] !== false,
      [STORAGE_KEYS.INCLUDE_POST_INFO]: value[STORAGE_KEYS.INCLUDE_POST_INFO] !== false,
      [STORAGE_KEYS.DEFAULT_DOWNLOAD_MODE]:
        value[STORAGE_KEYS.DEFAULT_DOWNLOAD_MODE] === "manager" ? "manager" : "zip",
      [STORAGE_KEYS.CLEAN_FEED]: value[STORAGE_KEYS.CLEAN_FEED] !== false,
      [STORAGE_KEYS.FILENAME_TEMPLATE]: Naming?.normalizeFilenameTemplate
        ? Naming.normalizeFilenameTemplate(value[STORAGE_KEYS.FILENAME_TEMPLATE])
        : String(
          value[STORAGE_KEYS.FILENAME_TEMPLATE] || DEFAULT_SETTINGS[STORAGE_KEYS.FILENAME_TEMPLATE]
        ).trim(),
      [STORAGE_KEYS.LANGUAGE]: I18n?.normalizeLanguagePreference
        ? I18n.normalizeLanguagePreference(value[STORAGE_KEYS.LANGUAGE])
        : ["auto", "vi", "en"].includes(value[STORAGE_KEYS.LANGUAGE])
          ? value[STORAGE_KEYS.LANGUAGE]
          : "auto"
    };
  }

  function isSafeReleaseUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.hostname === "github.com";
    } catch {
      return false;
    }
  }

  async function initializeBrowserPopup() {
    if (!globalScope.document || !globalScope.chrome?.storage?.local) return;

    const controls = /** @type {any} */ ({
      likeConfirm: document.getElementById("like-confirm"),
      cosmeticBadge: document.getElementById("cosmetic-badge"),
      postInfo: document.getElementById("post-info"),
      cleanFeed: document.getElementById("clean-feed"),
      language: document.getElementById("language-select"),
      filenameTemplate: document.getElementById("filename-template"),
      modes: Array.from(document.querySelectorAll('input[name="download-mode"]')),
      status: document.getElementById("status"),
      copyLogs: document.getElementById("copy-logs"),
      reportBug: document.getElementById("report-bug"),
      updateBanner: document.getElementById("update-banner"),
      updateCopy: document.getElementById("update-copy"),
      updateDownload: document.getElementById("update-download")
    });

    const stored = await chrome.storage.local.get({
      ...DEFAULT_SETTINGS,
      [STORAGE_KEYS.HAS_UPDATE]: false,
      [STORAGE_KEYS.LATEST_VERSION]: "",
      [STORAGE_KEYS.RELEASE_URL]: ""
    });
    const settings = normalizeSettings(stored);
    I18n?.setPreference?.(settings[STORAGE_KEYS.LANGUAGE]);
    controls.likeConfirm.checked = settings[STORAGE_KEYS.LIKE_CONFIRM];
    controls.cosmeticBadge.checked = settings[STORAGE_KEYS.COSMETIC_BADGE];
    controls.postInfo.checked = settings[STORAGE_KEYS.INCLUDE_POST_INFO];
    controls.cleanFeed.checked = settings[STORAGE_KEYS.CLEAN_FEED];
    controls.language.value = settings[STORAGE_KEYS.LANGUAGE];
    controls.filenameTemplate.value = settings[STORAGE_KEYS.FILENAME_TEMPLATE];
    controls.modes.find((input) => input.value === settings[STORAGE_KEYS.DEFAULT_DOWNLOAD_MODE]).checked = true;

    const renderLocalizedText = () => {
      if (!I18n?.t) return;
      document.documentElement.lang = I18n.getLanguage();
      for (const rawNode of document.querySelectorAll("[data-i18n]")) {
        const node = /** @type {HTMLElement} */ (rawNode);
        const params = node.dataset.i18n === "popup_subtitle"
          ? { version: chrome.runtime.getManifest().version }
          : {};
        node.textContent = I18n.t(node.dataset.i18n, params);
      }
      if (
        stored[STORAGE_KEYS.HAS_UPDATE] &&
        stored[STORAGE_KEYS.LATEST_VERSION] &&
        isSafeReleaseUrl(stored[STORAGE_KEYS.RELEASE_URL])
      ) {
        controls.updateCopy.textContent = I18n.t("banner_update_label", {
          version: stored[STORAGE_KEYS.LATEST_VERSION]
        });
      }
    };
    renderLocalizedText();

    if (
      stored[STORAGE_KEYS.HAS_UPDATE] &&
      stored[STORAGE_KEYS.LATEST_VERSION] &&
      isSafeReleaseUrl(stored[STORAGE_KEYS.RELEASE_URL])
    ) {
      controls.updateBanner.hidden = false;
      controls.updateDownload.addEventListener("click", () => {
        void chrome.tabs.create({ url: stored[STORAGE_KEYS.RELEASE_URL] });
      });
    }

    let statusTimer = 0;
    const showStatus = (message, isError = false) => {
      globalScope.clearTimeout(statusTimer);
      controls.status.textContent = message || I18n?.t?.("saved") || "Saved";
      controls.status.classList.toggle("error", isError);
      controls.status.classList.add("show");
      statusTimer = globalScope.setTimeout(() => controls.status.classList.remove("show"), 1600);
    };

    const saveBooleans = async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.LIKE_CONFIRM]: controls.likeConfirm.checked,
        [STORAGE_KEYS.COSMETIC_BADGE]: controls.cosmeticBadge.checked,
        [STORAGE_KEYS.INCLUDE_POST_INFO]: controls.postInfo.checked,
        [STORAGE_KEYS.CLEAN_FEED]: controls.cleanFeed.checked
      });
      globalScope.FBISLogger?.info("popup", "SETTINGS_UPDATED");
      showStatus();
    };

    for (const control of [
      controls.likeConfirm,
      controls.cosmeticBadge,
      controls.postInfo,
      controls.cleanFeed
    ]) {
      control.addEventListener("change", () => void saveBooleans());
    }
    controls.language.addEventListener("change", async () => {
      const language = I18n?.normalizeLanguagePreference?.(controls.language.value) || controls.language.value;
      await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: language });
      I18n?.setPreference?.(language);
      renderLocalizedText();
      globalScope.FBISLogger?.info("popup", `LANGUAGE_${String(language).toUpperCase()}`);
      showStatus();
    });
    controls.filenameTemplate.addEventListener("change", async () => {
      const normalized = Naming?.normalizeFilenameTemplate
        ? Naming.normalizeFilenameTemplate(controls.filenameTemplate.value)
        : controls.filenameTemplate.value.trim() || DEFAULT_SETTINGS[STORAGE_KEYS.FILENAME_TEMPLATE];
      controls.filenameTemplate.value = normalized;
      await chrome.storage.local.set({ [STORAGE_KEYS.FILENAME_TEMPLATE]: normalized });
      globalScope.FBISLogger?.info("popup", "FILENAME_TEMPLATE_UPDATED");
      showStatus();
    });
    for (const input of controls.modes) {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        await chrome.storage.local.set({ [STORAGE_KEYS.DEFAULT_DOWNLOAD_MODE]: input.value });
        globalScope.FBISLogger?.info("popup", `DOWNLOAD_MODE_${input.value.toUpperCase()}`);
        showStatus();
      });
    }

    async function collectDiagnostics() {
      let logs = [];
      try {
        const response = await chrome.runtime.sendMessage({ type: IPC_ACTIONS.GET_DIAGNOSTIC_LOGS });
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
        showStatus(I18n?.t?.("copied_logs") || "Logs copied");
      } catch (error) {
        globalScope.FBISLogger?.error("popup", `COPY_LOGS_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        showStatus(I18n?.t?.("copy_logs_failed") || "Could not copy logs", true);
      }
    });

    controls.reportBug.addEventListener("click", async () => {
      try {
        const markdown = await collectDiagnostics();
        await chrome.tabs.create({ url: buildIssueUrl(markdown) });
        globalScope.FBISLogger?.info("popup", "BUG_REPORT_OPENED");
        showStatus(I18n?.t?.("opened_github") || "Opened GitHub");
      } catch (error) {
        globalScope.FBISLogger?.error("popup", `BUG_REPORT_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        showStatus(I18n?.t?.("open_github_failed") || "Could not open GitHub", true);
      }
    });
  }

  const api = {
    DEFAULT_SETTINGS,
    buildDiagnosticsMarkdown,
    buildIssueUrl,
    isSafeReleaseUrl,
    normalizeSettings
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    void initializeBrowserPopup();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
