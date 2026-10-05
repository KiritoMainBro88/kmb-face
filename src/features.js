(function initializeFacebookUtilities(globalScope) {
  "use strict";

  const STORY_HOST_ID = "fbis-story-download-root";
  const LIKE_POPOVER_ID = "fbis-like-confirm-root";
  const BADGE_CLASS = "fbis-verified-badge";
  const HIDDEN_FEED_CLASS = "fbis-hidden-feed-item";
  const DiagnosticLogger = globalScope.FBISLogger;
  const LIKE_CONFIRM_WINDOW_MS = 3000;
  const DEFAULT_SETTINGS = Object.freeze({
    fbis_enable_like_confirm: true,
    fbis_enable_cosmetic_badge: true,
    fbis_clean_feed: true
  });
  const featureSettings = { ...DEFAULT_SETTINGS };
  const pendingLikeControls = new WeakMap();
  let activeLikeControl = null;
  let lastKnownUrl = "";
  let currentUserName = "";
  let storyBusy = false;
  let utilityScanTimer = 0;

  function isStoryLocation(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      return /\/stories(?:\/|$)/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function extractStoryId(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      for (const key of ["story_fbid", "story_id", "id"]) {
        const value = parsed.searchParams.get(key);
        if (/^\d+$/.test(value || "")) return value;
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      const storyIndex = segments.findIndex((segment) => segment.toLowerCase() === "stories");
      for (let index = segments.length - 1; index > storyIndex; index -= 1) {
        if (/^\d+$/.test(segments[index])) return segments[index];
      }
      return "";
    } catch {
      return "";
    }
  }

  function isLikeLabel(value) {
    const label = String(value || "").trim();
    if (!label || /(?:bỏ\s+thích|unlike)/i.test(label)) return false;
    return /(?:^|\s)(?:thích|like)(?:$|\s|[,.!?])/i.test(label);
  }

  function isLikeControl(element) {
    if (!element?.closest) return false;
    const labelled = element.closest("[aria-label]");
    if (!labelled) return false;
    const clickable = labelled.closest('button, [role="button"]');
    return Boolean(clickable && isLikeLabel(labelled.getAttribute("aria-label")));
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeFeatureSettings(value = {}) {
    return {
      fbis_enable_like_confirm: value.fbis_enable_like_confirm !== false,
      fbis_enable_cosmetic_badge: value.fbis_enable_cosmetic_badge !== false,
      fbis_clean_feed: value.fbis_clean_feed !== false
    };
  }

  function isLikeConfirmationEnabled(settings = featureSettings) {
    return settings?.fbis_enable_like_confirm !== false;
  }

  function isCosmeticBadgeEnabled(settings = featureSettings) {
    return settings?.fbis_enable_cosmetic_badge !== false;
  }

  function isCleanFeedEnabled(settings = featureSettings) {
    return settings?.fbis_clean_feed !== false;
  }

  function isSponsoredRedirectHref(value) {
    if (!value) return false;
    try {
      const parsed = new URL(value, "https://www.facebook.com/");
      if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return false;
      return (
        /\/(?:ads|ad_center|adsmanager)(?:\/|$)/i.test(parsed.pathname) ||
        parsed.searchParams.has("ad_id") ||
        parsed.searchParams.has("sponsored")
      );
    } catch {
      return false;
    }
  }

  function isSponsoredOrSuggestedPost(article) {
    if (!article) return false;
    const text = normalizeName(article.textContent).toLowerCase();
    if (
      /(?:được tài trợ|sponsored|gợi ý cho bạn|suggested for you|reels và video ngắn)/i.test(text)
    ) {
      return true;
    }
    const links = article.querySelectorAll?.("a[href]") || [];
    for (const link of links) {
      if (isSponsoredRedirectHref(link.getAttribute?.("href") || link.href)) return true;
    }
    return false;
  }

  function applyCleanFeed() {
    if (!globalScope.document) return;
    if (!isCleanFeedEnabled()) {
      document.querySelectorAll(`.${HIDDEN_FEED_CLASS}`).forEach((node) => {
        node.classList.remove(HIDDEN_FEED_CLASS);
      });
      return;
    }

    for (const article of document.querySelectorAll('div[role="article"]')) {
      if (article.parentElement?.closest?.('div[role="article"]')) continue;
      article.classList.toggle(HIDDEN_FEED_CLASS, isSponsoredOrSuggestedPost(article));
    }
  }

  function ensureMainWorldBridge() {
    if (!globalScope.document || !globalScope.chrome?.runtime?.getURL) return;
    if (document.getElementById("fbis-main-world-bridge")) return;
    const script = document.createElement("script");
    script.id = "fbis-main-world-bridge";
    script.src = chrome.runtime.getURL("src/injected.js");
    script.async = false;
    script.addEventListener("load", () => script.remove(), { once: true });
    (document.head || document.documentElement).appendChild(script);
  }

  function requestMainBridge(type, payload = {}, timeout = 2500) {
    const requestId = `fbis-feature-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = globalScope.setTimeout(() => {
        globalScope.removeEventListener("message", handleMessage);
        reject(new Error("Story resolver timeout."));
      }, timeout);

      function handleMessage(event) {
        const message = event.data;
        if (
          event.source !== globalScope ||
          message?.source !== "FBIS_MAIN" ||
          message.requestId !== requestId ||
          message.type !== `${type}_RESULT`
        ) {
          return;
        }
        globalScope.clearTimeout(timer);
        globalScope.removeEventListener("message", handleMessage);
        if (message.ok) resolve(message);
        else reject(new Error(message.error || "Resolver failed."));
      }

      globalScope.addEventListener("message", handleMessage);
      globalScope.postMessage({ source: "FBIS_CONTENT", type, requestId, ...payload }, "*");
    });
  }

  function isPauseLabel(value) {
    return /(?:tạm\s*dừng|pause)/i.test(String(value || ""));
  }

  function isPlayLabel(value) {
    return /(?:^|\s)(?:phát|tiếp\s*tục|play|resume)(?:$|\s|[,.!?])/i.test(String(value || ""));
  }

  function findStoryPlaybackControl(predicate) {
    const controls = document.querySelectorAll('[aria-label]');
    for (const control of controls) {
      if (!control.matches?.('button, [role="button"]')) continue;
      if (predicate(control.getAttribute("aria-label"))) return control;
    }
    return null;
  }

  function dispatchStorySpace(target) {
    const eventTarget = target || document.body || document.documentElement;
    if (!eventTarget?.dispatchEvent) return false;
    for (const type of ["keydown", "keyup"]) {
      eventTarget.dispatchEvent(
        new KeyboardEvent(type, {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true
        })
      );
    }
    return true;
  }

  function pauseStoryPlayback() {
    const alreadyPaused = findStoryPlaybackControl(isPlayLabel);
    if (alreadyPaused) return { mode: "already-paused" };

    const pauseControl = findStoryPlaybackControl(isPauseLabel);
    if (pauseControl) {
      pauseControl.click();
      return { mode: "button", control: pauseControl };
    }

    const container = findStoryContainer();
    if (dispatchStorySpace(container)) {
      return { mode: "space", container };
    }
    return { mode: "none" };
  }

  function resumeStoryPlayback(guard) {
    if (!guard || guard.mode === "none" || guard.mode === "already-paused") return;
    if (guard.mode === "space") {
      dispatchStorySpace(guard.container?.isConnected ? guard.container : findStoryContainer());
      return;
    }

    const playControl = findStoryPlaybackControl(isPlayLabel);
    if (playControl) {
      playControl.click();
      return;
    }
    if (guard.control?.isConnected) guard.control.click();
  }

  async function downloadStory(storyId, setState) {
    if (storyBusy) return;
    storyBusy = true;
    const playbackGuard = pauseStoryPlayback();
    setState?.("loading", "Đang lấy Story HD…");
    try {
      ensureMainWorldBridge();
      const response = await requestMainBridge("FBIS_RESOLVE_STORY", { storyId }, 3000);
      const story = response.story;
      if (!story?.url) throw new Error("Không tìm thấy media Story HD.");

      if (story.type === "video") {
        const result = await chrome.runtime.sendMessage({
          type: "FBIS_DOWNLOAD_VIDEOS",
          postId: `story-${storyId || "current"}`,
          videos: [{ url: story.url }]
        });
        if (!result?.ok && !result?.started) {
          throw new Error(result?.error || "Không bắt đầu được tải Story video.");
        }
      } else {
        const result = await chrome.runtime.sendMessage({
          type: "FBIS_DOWNLOAD_IMAGES",
          albumId: `story-${storyId || "current"}`,
          images: [{ url: story.url }]
        });
        if (!result?.ok && !result?.started) {
          throw new Error(result?.error || "Không bắt đầu được tải Story ảnh.");
        }
      }
      setState?.("done", "✓ Đã gửi Story HD");
    } catch (error) {
      DiagnosticLogger?.error("features", `STORY_DOWNLOAD_FAILED ${error instanceof Error ? error.message : "unknown"}`);
      setState?.("error", error instanceof Error ? error.message : "Tải Story thất bại");
    } finally {
      resumeStoryPlayback(playbackGuard);
      storyBusy = false;
    }
  }

  function installStoryButton() {
    if (!globalScope.document) return;
    const existing = document.getElementById(STORY_HOST_ID);
    if (!isStoryLocation(location.href)) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const storyId = extractStoryId(location.href);
    if (!storyId) return;
    const host = document.createElement("div");
    host.id = STORY_HOST_ID;
    host.style.cssText = "all:initial;position:fixed;top:72px;right:24px;z-index:2147483646;";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      button{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:9px 13px;background:rgba(0,0,0,.72);color:#fff;font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;opacity:.82;transition:opacity .15s ease,transform .15s ease}
      button:hover,button:focus-visible{opacity:1}button:active{transform:translateY(1px)}button:disabled{cursor:progress}.error{max-width:250px;color:#ffd0d0}
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "⚡ Tải Story (HD)";
    button.addEventListener("click", () => {
      button.disabled = true;
      downloadStory(storyId, (state, text) => {
        button.textContent = text;
        button.classList.toggle("error", state === "error");
        if (state === "done" || state === "error") {
          globalScope.setTimeout(() => {
            button.disabled = false;
            button.classList.remove("error");
            button.textContent = "⚡ Tải Story (HD)";
          }, 1800);
        }
      });
    });
    root.append(style, button);
    const storyContainer = findStoryContainer();
    (storyContainer || document.documentElement).appendChild(host);
  }

  function findStoryContainer() {
    const candidates = [
      ...document.querySelectorAll('[role="main"] [role="dialog"], [role="main"], main')
    ];
    return candidates.find((node) => node.querySelector?.("video, img")) || candidates[0] || null;
  }

  function findLikeControl(target) {
    if (!target?.closest) return null;
    const labelled = target.closest("[aria-label]");
    if (!labelled || !isLikeLabel(labelled.getAttribute("aria-label"))) return null;
    return labelled.closest('button, [role="button"]');
  }

  function removeLikePopover() {
    document.getElementById(LIKE_POPOVER_ID)?.remove();
  }

  function clearLikeConfirmation(control = activeLikeControl) {
    if (!control) {
      removeLikePopover();
      return;
    }
    const pending = pendingLikeControls.get(control);
    if (pending?.timer) globalScope.clearTimeout(pending.timer);
    pendingLikeControls.delete(control);
    if (activeLikeControl === control) activeLikeControl = null;
    removeLikePopover();
  }

  function showLikeConfirmation(control, expiresAt) {
    if (activeLikeControl && activeLikeControl !== control) {
      clearLikeConfirmation(activeLikeControl);
    } else {
      removeLikePopover();
    }
    const rect = control.getBoundingClientRect();
    const host = document.createElement("div");
    host.id = LIKE_POPOVER_ID;
    host.style.cssText = `all:initial;position:fixed;left:${Math.max(4, rect.left)}px;top:${Math.max(4, rect.top)}px;width:${Math.max(96, rect.width)}px;height:${Math.max(28, rect.height)}px;z-index:2147483647;pointer-events:none;`;
    const root = host.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.textContent = "Click lại để xác nhận";
    box.style.cssText = "display:grid;width:100%;height:100%;min-height:28px;place-items:center;padding:4px 8px;border:1px solid rgba(117,170,255,.9);border-radius:9px;background:rgba(8,102,255,.94);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.32);font:700 11px/1.15 system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;white-space:nowrap;";
    root.appendChild(box);
    document.documentElement.appendChild(host);

    const delay = Math.max(0, expiresAt - Date.now());
    const timer = globalScope.setTimeout(() => clearLikeConfirmation(control), delay);
    pendingLikeControls.set(control, { expiresAt, timer });
    activeLikeControl = control;
  }

  function handleLikeCapture(event) {
    if (!isLikeConfirmationEnabled()) return;
    const control = findLikeControl(event.target);
    if (!control) return;

    const pending = pendingLikeControls.get(control);
    if (pending && pending.expiresAt >= Date.now()) {
      clearLikeConfirmation(control);
      return;
    }

    if (pending) clearLikeConfirmation(control);
    event.preventDefault();
    event.stopImmediatePropagation();
    showLikeConfirmation(control, Date.now() + LIKE_CONFIRM_WINDOW_MS);
  }

  function findCurrentUserName() {
    const selectors = [
      'nav a[aria-label][href*="/profile.php"]',
      'nav a[aria-label][href*="/me/"]',
      'header a[aria-label][href*="/profile.php"]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const name = normalizeName(node?.getAttribute?.("aria-label"));
      if (name && !/(?:menu|facebook|home|trang chủ|notifications?|thông báo)/i.test(name)) {
        return name;
      }
    }

    const navLinks = Array.from(document.querySelectorAll('nav a[aria-label][href]'));
    for (const link of navLinks) {
      const name = normalizeName(link.getAttribute("aria-label"));
      let parsed;
      try {
        parsed = new URL(link.href, location.href);
      } catch {
        continue;
      }
      if (
        parsed.hostname.endsWith("facebook.com") &&
        name &&
        !/(?:menu|facebook|home|trang chủ|notifications?|thông báo|messenger|search|tìm kiếm)/i.test(name)
      ) {
        return name;
      }
    }
    return "";
  }

  function createVerifiedBadge() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-label", "Local cosmetic verified badge");
    svg.classList.add(BADGE_CLASS);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "7.5");
    circle.setAttribute("fill", "#0866ff");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4.2 8.1 6.7 10.5 11.9 5.4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "white");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(circle, path);
    return svg;
  }

  function applyCosmeticBadges() {
    if (!isCosmeticBadgeEnabled()) {
      removeCosmeticBadges();
      return;
    }
    if (!currentUserName) currentUserName = findCurrentUserName();
    if (!currentUserName) return;
    const candidates = document.querySelectorAll('h1,h2,h3,h4,strong,a[role="link"],span[dir="auto"]');
    for (const node of candidates) {
      if (node.closest(`#${STORY_HOST_ID}, #${LIKE_POPOVER_ID}`)) continue;
      if (normalizeName(node.textContent) !== currentUserName) continue;
      if (node.querySelector(`.${BADGE_CLASS}`)) continue;
      node.appendChild(createVerifiedBadge());
    }
  }

  function removeCosmeticBadges() {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  }

  async function loadFeatureSettings() {
    if (!globalScope.chrome?.storage?.local) return;
    try {
      const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
      Object.assign(featureSettings, normalizeFeatureSettings(stored));
    } catch {
      Object.assign(featureSettings, DEFAULT_SETTINGS);
    }
  }

  function handleFeatureSettingsChanged(changes, areaName) {
    if (areaName !== "local") return;
    let shouldRescanBadges = false;

    if (changes.fbis_enable_like_confirm) {
      featureSettings.fbis_enable_like_confirm =
        changes.fbis_enable_like_confirm.newValue !== false;
      if (!featureSettings.fbis_enable_like_confirm) clearLikeConfirmation();
    }
    if (changes.fbis_enable_cosmetic_badge) {
      featureSettings.fbis_enable_cosmetic_badge =
        changes.fbis_enable_cosmetic_badge.newValue !== false;
      shouldRescanBadges = true;
    }
    if (changes.fbis_clean_feed) {
      featureSettings.fbis_clean_feed = changes.fbis_clean_feed.newValue !== false;
      applyCleanFeed();
    }

    if (shouldRescanBadges) {
      if (!featureSettings.fbis_enable_cosmetic_badge) removeCosmeticBadges();
      else {
        currentUserName = "";
        scheduleUtilityScan();
      }
    }
  }

  function scheduleUtilityScan() {
    if (utilityScanTimer) globalScope.clearTimeout(utilityScanTimer);
    utilityScanTimer = globalScope.setTimeout(() => {
      utilityScanTimer = 0;
      if (location.href !== lastKnownUrl) {
        lastKnownUrl = location.href;
        installStoryButton();
      } else if (isStoryLocation(location.href)) {
        installStoryButton();
      }
      applyCosmeticBadges();
      applyCleanFeed();
    }, 180);
  }

  async function initializeBrowserFeatures() {
    if (!globalScope.document || !globalScope.chrome?.runtime) return;
    await loadFeatureSettings();
    ensureMainWorldBridge();
    lastKnownUrl = location.href;
    installStoryButton();
    applyCosmeticBadges();
    applyCleanFeed();
    document.addEventListener("click", handleLikeCapture, true);
    globalScope.addEventListener("popstate", scheduleUtilityScan);
    globalScope.chrome?.storage?.onChanged?.addListener(handleFeatureSettingsChanged);
    new MutationObserver(scheduleUtilityScan).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    globalScope.setInterval(() => {
      if (location.href !== lastKnownUrl) scheduleUtilityScan();
    }, 750);
  }

  const api = {
    extractStoryId,
    findStoryContainer,
    isCosmeticBadgeEnabled,
    isCleanFeedEnabled,
    isLikeConfirmationEnabled,
    isLikeControl,
    isLikeLabel,
    isPauseLabel,
    isPlayLabel,
    isSponsoredOrSuggestedPost,
    isSponsoredRedirectHref,
    isStoryLocation,
    normalizeFeatureSettings,
    normalizeName
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    void initializeBrowserFeatures();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
