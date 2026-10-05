"use strict";

if (typeof importScripts === "function") {
  importScripts("logger.js");
}

const DiagnosticLogger = globalThis.FBISLogger || {
  error() {},
  getEntries() { return []; },
  info() {},
  receive() {},
  warn() {}
};

const MAX_DOWNLOADS_PER_BATCH = 500;
const MAX_MEDIA_FETCH_BATCH = 5;
const MAX_VIDEO_ZIP_BYTES = 15 * 1024 * 1024;
const MAX_URL_LENGTH = 8192;
const ALLOWED_MEDIA_HOSTS = ["fbcdn.net", "facebook.com", "fbsbx.com"];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isFacebookPage(tab.url)) {
    await showActionError(tab.id, "Hãy mở một bài viết trên facebook.com rồi bấm lại.");
    return;
  }

  clearActionError(tab.id);

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FBIS_TOGGLE_PANEL" });
  } catch (error) {
    await showActionError(
      tab.id,
      "Content script chưa sẵn sàng. Hãy tải lại Facebook rồi thử lại."
    );
    console.warn("Facebook Post Image Saver content script unavailable", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FBIS_LOG_EVENT") {
    DiagnosticLogger.receive(message.entry);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "FBIS_GET_DIAGNOSTIC_LOGS") {
    sendResponse({ ok: true, entries: DiagnosticLogger.getEntries() });
    return false;
  }

  if (message?.type === "FBIS_FETCH_SMALL_VIDEO") {
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

  if (message?.type === "FBIS_DOWNLOAD_VIDEOS") {
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

  if (message?.type === "FBIS_FETCH_MEDIA_BATCH") {
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

  if (message?.type === "FBIS_DOWNLOAD_ZIP") {
    downloadZip(message, sender)
      .then(sendResponse)
      .catch((error) => {
        DiagnosticLogger.error("background", `DOWNLOAD_ZIP_FAILED ${error instanceof Error ? error.message : "unknown"}`);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không thể tải ZIP." });
      });
    return true;
  }

  if (message?.type !== "FBIS_DOWNLOAD_IMAGES") {
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
  if (!Number.isFinite(size) || size < 0 || size > MAX_VIDEO_ZIP_BYTES) {
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
  if (buffer.byteLength > MAX_VIDEO_ZIP_BYTES) {
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
  if (message.videos.length > 50) {
    throw new Error("Mỗi lượt chỉ hỗ trợ tối đa 50 video.");
  }

  const postId = sanitizeFilePart(message.postId || "unknown", 80);
  const validated = message.videos.map((video, index) => validateVideo(video, index));
  let started = 0;
  const failures = [];

  for (let index = 0; index < validated.length; index += 1) {
    const video = validated[index];
    const suffix = validated.length > 1 ? `_${String(index + 1).padStart(2, "0")}` : "";
    const filename = `FB_${postId}_video${suffix}.mp4`;
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
  if (message.urls.length > MAX_MEDIA_FETCH_BATCH) {
    throw new Error(`Mỗi lượt chỉ fetch tối đa ${MAX_MEDIA_FETCH_BATCH} ảnh.`);
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
    const timeout = setTimeout(() => finish(new Error("Download ZIP chưa hoàn tất sau thời gian chờ.")), 300000);

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
    .slice(0, 180);
  return safe.toLowerCase().endsWith(".zip") ? safe : `${safe || "Facebook_Images"}.zip`;
}

async function downloadBatch(message, sender) {
  if (!sender.tab?.id || !isFacebookPage(sender.tab.url)) {
    throw new Error("Yêu cầu tải không đến từ một tab Facebook hợp lệ.");
  }

  if (!Array.isArray(message.images) || message.images.length === 0) {
    throw new Error("Danh sách ảnh trống.");
  }

  if (message.images.length > MAX_DOWNLOADS_PER_BATCH) {
    throw new Error(`Mỗi lượt chỉ hỗ trợ tối đa ${MAX_DOWNLOADS_PER_BATCH} ảnh.`);
  }

  const validated = message.images.map((image, index) => validateImage(image, index));
  const folder = buildDownloadFolder(message.albumId);
  let started = 0;
  const failures = [];

  for (let index = 0; index < validated.length; index += 1) {
    const image = validated[index];
    const filename = `${folder}/${String(index + 1).padStart(3, "0")}.${image.extension}`;

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
      await delay(80);
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
  if (!image || typeof image.url !== "string" || image.url.length > MAX_URL_LENGTH) {
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
    !ALLOWED_MEDIA_HOSTS.some((host) => isHostOrSubdomain(parsed.hostname, host))
  ) {
    throw new Error(`Nguồn của ảnh #${index + 1} không được phép.`);
  }

  return {
    url: parsed.href,
    extension: getTrustedImageExtension(parsed.pathname)
  };
}

function validateVideo(video, index) {
  if (!video || typeof video.url !== "string" || video.url.length > MAX_URL_LENGTH) {
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
    !ALLOWED_MEDIA_HOSTS.some((host) => isHostOrSubdomain(parsed.hostname, host))
  ) {
    throw new Error(`Nguồn của video #${index + 1} không được phép.`);
  }

  return { url: parsed.href, extension: "mp4" };
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
    .sendMessage(tabId, { type: "FBIS_DOWNLOAD_PROGRESS", ...progress })
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
    getTrustedImageExtension,
    isFacebookPage,
    isHostOrSubdomain,
    sanitizeFilePart,
    validateImage,
    validateVideo
  };
}
