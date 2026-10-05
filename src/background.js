"use strict";

if (typeof importScripts === "function") {
  importScripts("constants.js", "logger.js", "naming.js");
}

const DiagnosticLogger = globalThis.FBISLogger || {
  error() {},
  getEntries() { return []; },
  info() {},
  receive() {},
  warn() {}
};
const Naming = globalThis.FBISNaming ||
  (typeof require === "function" ? require("./naming.js") : null);
const Constants = globalThis.FBISConstants ||
  (typeof require === "function" ? require("./constants.js") : null);
const { IPC_ACTIONS, LIMITS, MEDIA_HOSTS, STORAGE_KEYS, TIMINGS, UPDATE } = Constants;
const UPDATE_ALARM_NAME = UPDATE.ALARM_NAME;
const UPDATE_INTERVAL_MINUTES = TIMINGS.UPDATE_CHECK_INTERVAL_HOURS * 60;
const UPDATE_API_URL = UPDATE.API_URL;

function parseSemver(value) {
  const match = String(value || "").trim().match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
  );
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : []
  };
}

function semverCompare(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) throw new TypeError("Phiên bản semantic không hợp lệ.");

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return Number(aPart) > Number(bPart) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart > bPart ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate() {
  const response = await fetch(UPDATE_API_URL, {
    headers: { Accept: "application/vnd.github.v3+json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}.`);

  const release = await response.json();
  const latestVersion = String(release?.tag_name || "").trim();
  const releaseUrl = String(release?.html_url || "").trim();
  if (!latestVersion || !releaseUrl) throw new Error("GitHub Release thiếu tag_name hoặc html_url.");

  const currentVersion = chrome.runtime.getManifest().version;
  const hasUpdate = semverCompare(latestVersion, currentVersion) > 0;
  await chrome.storage.local.set({
    [STORAGE_KEYS.HAS_UPDATE]: hasUpdate,
    [STORAGE_KEYS.LATEST_VERSION]: latestVersion,
    [STORAGE_KEYS.RELEASE_URL]: releaseUrl
  });
  await chrome.action.setBadgeText({ text: hasUpdate ? UPDATE.BADGE_TEXT : "" });
  if (hasUpdate) {
    await chrome.action.setBadgeBackgroundColor({ color: UPDATE.BADGE_COLOR });
  }
  return { hasUpdate, latestVersion, releaseUrl };
}

async function ensureUpdateAlarm() {
  if (!chrome.alarms?.get || !chrome.alarms?.create) return;
  const existing = await chrome.alarms.get(UPDATE_ALARM_NAME);
  if (existing?.periodInMinutes === UPDATE_INTERVAL_MINUTES) return;
  await chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
}

function runUpdateCheck() {
  return checkForUpdate().catch((error) => {
    DiagnosticLogger.warn(
      "background",
      `UPDATE_CHECK_FAILED ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  });
}

if (typeof importScripts === "function") {
  void ensureUpdateAlarm().catch((error) => {
    DiagnosticLogger.warn(
      "background",
      `UPDATE_ALARM_FAILED ${error instanceof Error ? error.message : "unknown"}`
    );
  });
  chrome.runtime.onInstalled?.addListener(() => {
    void ensureUpdateAlarm();
    void runUpdateCheck();
  });
  chrome.runtime.onStartup?.addListener(() => {
    void ensureUpdateAlarm();
    void runUpdateCheck();
  });
  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm?.name === UPDATE_ALARM_NAME) void runUpdateCheck();
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isFacebookPage(tab.url)) {
    await showActionError(tab.id, "Hãy mở một bài viết trên facebook.com rồi bấm lại.");
    return;
  }

  clearActionError(tab.id);

  try {
    await chrome.tabs.sendMessage(tab.id, { type: IPC_ACTIONS.TOGGLE_PANEL });
  } catch (error) {
    await showActionError(
      tab.id,
      "Content script chưa sẵn sàng. Hãy tải lại Facebook rồi thử lại."
    );
    console.warn("Facebook Post Image Saver content script unavailable", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === IPC_ACTIONS.LOG_EVENT) {
    DiagnosticLogger.receive(message.entry);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === IPC_ACTIONS.GET_DIAGNOSTIC_LOGS || message?.type === IPC_ACTIONS.COPY_LOGS) {
    sendResponse({ ok: true, entries: DiagnosticLogger.getEntries() });
    return false;
  }

  if (message?.type === IPC_ACTIONS.FETCH_SMALL_VIDEO) {
    fetchSmallVideo(message, sender)
      .then(sendResponse)
      .catch((error) => {
        DiagnosticLogger.error("background", `FETCH_SMALL_VIDEO_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Không kiểm tra được video."
        });
      });
    return true;
  }

  if (message?.type === IPC_ACTIONS.DOWNLOAD_VIDEOS) {
    downloadVideos(message, sender)
      .then(sendResponse)
      .catch((error) => {
        DiagnosticLogger.error("background", `DOWNLOAD_VIDEO_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        sendResponse({
          ok: false,
          started: 0,
          failed: 0,
          error: error instanceof Error ? error.message : "Không thể bắt đầu tải video."
        });
      });
    return true;
  }

  if (message?.type === IPC_ACTIONS.FETCH_MEDIA_BATCH) {
    fetchMediaBatch(message, sender)
      .then(sendResponse)
      .catch((error) => {
        DiagnosticLogger.error("background", `FETCH_MEDIA_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        sendResponse({
          ok: false,
          items: [],
          error: error instanceof Error ? error.message : "Không tải được media từ background."
        });
      });
    return true;
  }

  if (message?.type === IPC_ACTIONS.DOWNLOAD_ZIP) {
    downloadZip(message, sender)
      .then(sendResponse)
      .catch((error) => {
        DiagnosticLogger.error("background", `DOWNLOAD_ZIP_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không thể tải ZIP." });
      });
    return true;
  }

  if (message?.type === IPC_ACTIONS.CHECK_UPDATE) {
    runUpdateCheck().then((result) => sendResponse({ ok: Boolean(result), result }));
    return true;
  }

  if (message?.type !== IPC_ACTIONS.DOWNLOAD_IMAGES) {
    return false;
  }

  downloadBatch(message, sender)
    .then(sendResponse)
    .catch((error) => {
      DiagnosticLogger.error("background", `DOWNLOAD_IMAGE_FAILED ${error instanceof Error ? error.message : "unknown"}`);
      sendResponse({
        ok: false,
        started: 0,
        failed: 0,
        error: error instanceof Error ? error.message : "Không thể bắt đầu tải ảnh."
      });
    });

  return true;
});

async function fetchSmallVideo(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu video không đến từ một tab Facebook hợp lệ.");
  }
  const video = validateVideo({ url: message.url }, 0);
  const probe = await fetch(video.url, {
    method: "HEAD",
    credentials: "include",
    cache: "no-store",
    redirect: "follow"
  });
  if (!probe.ok) {
    return { ok: true, tooLarge: true, size: null, reason: `HEAD HTTP ${probe.status}` };
  }

  const size = Number.parseInt(probe.headers.get("content-length") || "", 10);
  if (!Number.isFinite(size) || size < 0 || size > LIMITS.MAX_INLINE_VIDEO_SIZE_BYTES) {
    return { ok: true, tooLarge: true, size: Number.isFinite(size) ? size : null };
  }

  const response = await fetch(video.url, {
    credentials: "include",
    cache: "force-cache",
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Video HTTP ${response.status}.`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > LIMITS.MAX_INLINE_VIDEO_SIZE_BYTES) {
    return { ok: true, tooLarge: true, size: buffer.byteLength };
  }
  return {
    ok: true,
    tooLarge: false,
    size: buffer.byteLength,
    contentType: response.headers.get("content-type") || "video/mp4",
    base64: arrayBufferToBase64(buffer)
  };
}

async function downloadVideos(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu tải video không đến từ một tab Facebook hợp lệ.");
  }
  if (!Array.isArray(message.videos) || message.videos.length === 0) {
    throw new Error("Danh sách video trống.");
  }
  if (message.videos.length > LIMITS.MAX_VIDEOS_PER_BATCH) {
    throw new Error(`Mỗi lượt chỉ hỗ trợ tối đa ${LIMITS.MAX_VIDEOS_PER_BATCH} video.`);
  }

  const postId = sanitizeFilePart(message.postId || "unknown", LIMITS.MAX_FILE_PART_LENGTH);
  const author = message.author || "Facebook";
  const filenameTemplate = await getFilenameTemplate();
  const validated = message.videos.map((video, index) => validateVideo(video, index));
  let started = 0;
  const failures = [];

  for (let index = 0; index < validated.length; index += 1) {
    const video = validated[index];
    const filename = video.filename || `${Naming.parseFilenameTemplate(filenameTemplate, {
      author,
      postId,
      index: index + 1
    })}.mp4`;
    try {
      await chrome.downloads.download({
        url: video.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      });
      started += 1;
    } catch (error) {
      failures.push({
        index,
        error: error instanceof Error ? error.message : "Chrome từ chối download video."
      });
    }
  }

  return { ok: failures.length === 0, started, failed: failures.length, failures };
}

async function fetchMediaBatch(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu media không đến từ một tab Facebook hợp lệ.");
  }
  if (!Array.isArray(message.urls) || message.urls.length === 0) {
    throw new Error("Danh sách media trống.");
  }
  if (message.urls.length > LIMITS.MAX_CONCURRENT_FETCH) {
    throw new Error(`Mỗi lượt chỉ fetch tối đa ${LIMITS.MAX_CONCURRENT_FETCH} ảnh.`);
  }

  const validated = message.urls.map((url, index) => validateImage({ url }, index));
  const items = await Promise.all(
    validated.map(async (image) => {
      const response = await fetch(image.url, {
        credentials: "include",
        cache: "force-cache",
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(`Media HTTP ${response.status}.`);
      }
      const buffer = await response.arrayBuffer();
      return {
        url: image.url,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        base64: arrayBufferToBase64(buffer)
      };
    })
  );

  return { ok: true, items };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function downloadZip(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu ZIP không đến từ một tab Facebook hợp lệ.");
  }
  if (typeof message.url !== "string" || !/^blob:https:\/\/(?:[^/]+\.)?facebook\.com\//i.test(message.url)) {
    throw new Error("Blob ZIP không hợp lệ.");
  }

  const filename = sanitizeZipFilename(message.filename);
  const downloadId = await chrome.downloads.download({
    url: message.url,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  });
  await waitForDownloadCompletion(downloadId);
  return { ok: true, downloadId, completed: true };
}

function waitForDownloadCompletion(downloadId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("Download ZIP chưa hoàn tất sau thời gian chờ.")),
      TIMINGS.DOWNLOAD_COMPLETION_TIMEOUT_MS
    );

    function cleanup() {
      clearTimeout(timeout);
      chrome.downloads.onChanged.removeListener(handleChanged);
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    }

    function handleChanged(delta) {
      if (delta.id !== downloadId || !delta.state?.current) return;
      if (delta.state.current === "complete") finish();
      else if (delta.state.current === "interrupted") {
        finish(new Error("Chrome báo download ZIP bị gián đoạn."));
      }
    }

    chrome.downloads.onChanged.addListener(handleChanged);
    chrome.downloads.search({ id: downloadId }).then((items) => {
      const state = items?.[0]?.state;
      if (state === "complete") finish();
      else if (state === "interrupted") finish(new Error("Chrome báo download ZIP bị gián đoạn."));
    }).catch(() => undefined);
  });
}

function sanitizeZipFilename(value) {
  const safe = String(value || "Facebook_Images.zip")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.MAX_FILENAME_TEMPLATE_LENGTH);
  return safe.toLowerCase().endsWith(".zip") ? safe : `${safe || "Facebook_Images"}.zip`;
}

async function downloadBatch(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu tải không đến từ một tab Facebook hợp lệ.");
  }

  if (!Array.isArray(message.images) || message.images.length === 0) {
    throw new Error("Danh sách ảnh trống.");
  }

  if (message.images.length > LIMITS.MAX_DOWNLOADS_PER_BATCH) {
    throw new Error(`Mỗi lượt chỉ hỗ trợ tối đa ${LIMITS.MAX_DOWNLOADS_PER_BATCH} ảnh.`);
  }

  const validated = message.images.map((image, index) => validateImage(image, index));
  const postId = message.postId || message.albumId || "unknown";
  const folder = buildDownloadFolder(postId);
  const filenameTemplate = await getFilenameTemplate();
  let started = 0;
  const failures = [];

  for (let index = 0; index < validated.length; index += 1) {
    const image = validated[index];
    const stem = Naming.parseFilenameTemplate(filenameTemplate, {
      author: message.author || "Facebook",
      postId,
      index: index + 1
    });
    const filename = `${folder}/${stem}.${image.extension}`;

    try {
      await chrome.downloads.download({
        url: image.url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      });
      started += 1;
    } catch (error) {
      failures.push({
        index,
        error: error instanceof Error ? error.message : "Chrome từ chối download."
      });
    }

    sendDownloadProgress(sender.tab.id, {
      processed: index + 1,
      total: validated.length,
      started,
      failed: failures.length
    });

    if (index < validated.length - 1) {
      await delay(TIMINGS.DOWNLOAD_STAGGER_MS);
    }
  }

  return {
    ok: failures.length === 0,
    started,
    failed: failures.length,
    failures
  };
}

function validateImage(image, index) {
  if (!image || typeof image.url !== "string" || image.url.length > LIMITS.MAX_URL_LENGTH) {
    throw new Error(`URL của ảnh #${index + 1} không hợp lệ.`);
  }

  let parsed;
  try {
    parsed = new URL(image.url);
  } catch {
    throw new Error(`URL của ảnh #${index + 1} không hợp lệ.`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !MEDIA_HOSTS.some((host) => isHostOrSubdomain(parsed.hostname, host))
  ) {
    throw new Error(`Nguồn của ảnh #${index + 1} không được phép.`);
  }

  return {
    url: parsed.href,
    extension: getTrustedImageExtension(parsed.pathname)
  };
}

function validateVideo(video, index) {
  if (!video || typeof video.url !== "string" || video.url.length > LIMITS.MAX_URL_LENGTH) {
    throw new Error(`URL của video #${index + 1} không hợp lệ.`);
  }

  let parsed;
  try {
    parsed = new URL(video.url);
  } catch {
    throw new Error(`URL của video #${index + 1} không hợp lệ.`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !MEDIA_HOSTS.some((host) => isHostOrSubdomain(parsed.hostname, host))
  ) {
    throw new Error(`Nguồn của video #${index + 1} không được phép.`);
  }

  return {
    url: parsed.href,
    extension: "mp4",
    filename: sanitizeRelativeMediaFilename(video.filename, "mp4")
  };
}

function sanitizeRelativeMediaFilename(value, extension) {
  if (typeof value !== "string" || !value.trim()) return "";
  const segments = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => Naming.sanitizeFilenamePart(segment, "media", 100));
  if (segments.length === 0) return "";
  const suffix = `.${extension}`;
  const last = segments[segments.length - 1];
  if (!last.toLowerCase().endsWith(suffix)) segments[segments.length - 1] = `${last}${suffix}`;
  return segments.join("/");
}

async function getFilenameTemplate() {
  const fallback = Naming.DEFAULT_FILENAME_TEMPLATE;
  try {
    const stored = await chrome.storage.local.get({ [STORAGE_KEYS.FILENAME_TEMPLATE]: fallback });
    return Naming.normalizeFilenameTemplate(stored[STORAGE_KEYS.FILENAME_TEMPLATE]);
  } catch {
    return fallback;
  }
}

function isHostOrSubdomain(hostname, allowedHost) {
  const normalized = hostname.toLowerCase();
  return normalized === allowedHost || normalized.endsWith(`.${allowedHost}`);
}

function getTrustedImageExtension(pathname) {
  const match = pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)$/);
  if (!match) {
    return "jpg";
  }
  return match[1] === "jpeg" ? "jpg" : match[1];
}

function buildDownloadFolder(albumId) {
  const safeId = String(albumId || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `Facebook Images/post-${safeId || "unknown"}`;
}

function sanitizeFilePart(value, maxLength = 80) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength) || "unknown";
}

function isFacebookPage(url) {
  if (typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isHostOrSubdomain(parsed.hostname, "facebook.com");
  } catch {
    return false;
  }
}

function sendDownloadProgress(tabId, progress) {
  chrome.tabs
    .sendMessage(tabId, { type: IPC_ACTIONS.DOWNLOAD_PROGRESS, ...progress })
    .catch(() => undefined);
}

async function showActionError(tabId, title) {
  if (!tabId) {
    return;
  }
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" }),
    chrome.action.setBadgeText({ tabId, text: "!" }),
    chrome.action.setTitle({ tabId, title })
  ]);
}

function clearActionError(tabId) {
  if (!tabId) {
    return;
  }
  chrome.action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
  chrome.action
    .setTitle({ tabId, title: "Tải ảnh trong bài viết Facebook" })
    .catch(() => undefined);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildDownloadFolder,
    arrayBufferToBase64,
    checkForUpdate,
    getTrustedImageExtension,
    isFacebookPage,
    isHostOrSubdomain,
    parseSemver,
    sanitizeFilePart,
    semverCompare,
    validateImage,
    validateVideo
  };
}
