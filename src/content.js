(function initializeContentScript() {
  "use strict";

  if (
    globalThis.__FBIS_CONTENT_SCRIPT_LOADED__ &&
    document.getElementById("fbis-extension-root")
  ) {
    return;
  }

  const Collector = globalThis.FacebookAlbumCollector;
  if (!Collector) {
    throw new Error("FacebookAlbumCollector was not loaded.");
  }
  const Zip = globalThis.fflate;
  const DiagnosticLogger = globalThis.FBISLogger;
  if (!Zip?.Zip || !Zip?.ZipPassThrough || !Zip?.strToU8) {
    throw new Error("fflate was not loaded.");
  }

  const DEFAULT_SETTINGS = Object.freeze({
    fbis_include_post_info: true,
    fbis_default_download_mode: "zip"
  });
  const contentSettings = { ...DEFAULT_SETTINGS };
  const quickActionViews = new Set();

  document.getElementById("fbis-extension-root")?.remove();
  document.documentElement.classList.remove("fbis-picking-post");

  const state = {
    visible: false,
    picking: false,
    scanning: false,
    downloading: false,
    cancelRequested: false,
    selectedPost: null,
    selectedSummary: "",
    expectedCount: null,
    albumId: "unknown",
    images: [],
    selectedIndexes: new Set(),
    hoveredPost: null,
    quickActionBusy: new WeakSet()
  };

  const host = document.createElement("div");
  host.id = "fbis-extension-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const collector = new Collector.CarouselCollector();
  class SilentFastCollector extends Collector.CarouselCollector {
    async waitForReadyViewerState(previous, timeout, isCancelled) {
      if (!previous) {
        return super.waitForReadyViewerState(previous, timeout, isCancelled);
      }

      const maxWait = Math.min(Number(timeout) || 800, 800);
      const deadline = Date.now() + maxWait;
      while (Date.now() < deadline) {
        if (isCancelled?.()) return null;
        const state = Collector.readViewerState(this.document, this.window, previous);
        if (state?.element?.complete && state.element.naturalWidth > 0) {
          const photoChanged = Boolean(
            previous.photoId && state.photoId && state.photoId !== previous.photoId
          );
          const sourceChanged = Boolean(
            state.sourceIdentity && state.sourceIdentity !== previous.sourceIdentity
          );
          if (photoChanged || sourceChanged) {
            return state;
          }
        }
        await new Promise((resolve) => this.window.setTimeout(resolve, 20));
      }
      return null;
    }

    async advanceViewer(current, isCancelled) {
      if (isCancelled?.()) return null;
      if (!Collector.dispatchNextKeyboardEvent(this.document, this.window)) {
        return super.advanceViewer(current, isCancelled);
      }
      return this.waitForReadyViewerState(current, 800, isCancelled);
    }
  }
  const fastCollector = new SilentFastCollector({
    pollInterval: 20,
    openTimeout: 2500,
    changeTimeout: 800,
    keyboardRetryTimeout: 800,
    keyboardRetryLimit: 1,
    safetyLimit: 500
  });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>${getPanelStyles()}</style>
    <aside class="panel is-hidden" aria-label="Facebook Post Image Saver">
      <header class="header">
        <div class="brand-mark" aria-hidden="true">↓</div>
        <div class="heading-wrap">
          <h1>Facebook Image Saver</h1>
          <p>Tải trọn bộ ảnh trong một bài viết</p>
        </div>
        <button class="icon-button" data-action="close" type="button" aria-label="Đóng bảng tải ảnh">×</button>
      </header>

      <div class="body">
        <section class="intro">
          <div class="step-number">1</div>
          <div>
            <strong>Chọn bài viết</strong>
            <p class="muted">Có thể chọn bài trên feed hoặc dùng bài/modal đang mở.</p>
          </div>
        </section>

        <div class="selection-card is-empty" data-slot="selection-card">
          <div class="selection-icon" aria-hidden="true">▧</div>
          <div class="selection-copy">
            <strong data-slot="selection-title">Chưa chọn bài viết</strong>
            <span data-slot="selection-meta">Mở bài có nhiều ảnh rồi chọn bên dưới.</span>
          </div>
        </div>

        <div class="button-row selection-actions">
          <button class="button secondary" data-action="pick" type="button">Chọn bài trên trang</button>
          <button class="button ghost is-hidden" data-action="use-open" type="button">Dùng bài đang mở</button>
        </div>

        <section class="scan-actions is-hidden" data-slot="scan-actions">
          <div class="divider"></div>
          <div class="intro compact">
            <div class="step-number">2</div>
            <div>
              <strong>Quét và tải ảnh</strong>
              <p class="muted">Facebook sẽ tự chuyển lần lượt qua carousel.</p>
            </div>
          </div>
          <div class="button-row">
            <button class="button primary" data-action="scan-all" type="button">Tải tất cả</button>
            <button class="button secondary" data-action="scan-choose" type="button">Chọn ảnh</button>
          </div>
        </section>

        <section class="progress-card is-hidden" data-slot="progress-card" aria-live="polite">
          <div class="progress-heading">
            <strong data-slot="progress-title">Đang quét ảnh…</strong>
            <span data-slot="progress-count">0</span>
          </div>
          <div class="progress-track"><div class="progress-fill" data-slot="progress-fill"></div></div>
          <p class="status-text" data-slot="status-text">Giữ tab này mở trong lúc quét.</p>
          <button class="text-button" data-action="cancel" type="button">Dừng quét</button>
        </section>

        <section class="results is-hidden" data-slot="results">
          <div class="divider"></div>
          <div class="results-heading">
            <div>
              <strong>Ảnh đã tìm thấy</strong>
              <p class="muted" data-slot="selected-count">Đã chọn 0 ảnh</p>
            </div>
            <div class="mini-actions">
              <button class="text-button" data-action="select-all" type="button">Tất cả</button>
              <button class="text-button" data-action="select-none" type="button">Bỏ chọn</button>
            </div>
          </div>
          <div class="gallery" data-slot="gallery"></div>
          <button class="button primary full-width" data-action="download-selected" type="button">Tải ảnh đã chọn</button>
        </section>

        <p class="privacy-note">Ảnh chỉ được xử lý trong trình duyệt của bạn.</p>
      </div>
    </aside>

    <button class="picker-toast is-hidden" data-slot="picker-toast" type="button" data-action="cancel-pick">
      Nhấp vào bài viết cần tải ảnh · <strong>Hủy</strong>
    </button>
  `;

  const elements = {
    panel: shadow.querySelector(".panel"),
    pickerToast: shadow.querySelector('[data-slot="picker-toast"]'),
    selectionCard: shadow.querySelector('[data-slot="selection-card"]'),
    selectionTitle: shadow.querySelector('[data-slot="selection-title"]'),
    selectionMeta: shadow.querySelector('[data-slot="selection-meta"]'),
    useOpenButton: shadow.querySelector('[data-action="use-open"]'),
    scanActions: shadow.querySelector('[data-slot="scan-actions"]'),
    progressCard: shadow.querySelector('[data-slot="progress-card"]'),
    progressTitle: shadow.querySelector('[data-slot="progress-title"]'),
    progressCount: shadow.querySelector('[data-slot="progress-count"]'),
    progressFill: shadow.querySelector('[data-slot="progress-fill"]'),
    statusText: shadow.querySelector('[data-slot="status-text"]'),
    results: shadow.querySelector('[data-slot="results"]'),
    selectedCount: shadow.querySelector('[data-slot="selected-count"]'),
    gallery: shadow.querySelector('[data-slot="gallery"]'),
    downloadSelectedButton: shadow.querySelector('[data-action="download-selected"]')
  };

  shadow.addEventListener("click", handlePanelClick);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FBIS_TOGGLE_PANEL") {
      togglePanel();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "FBIS_DOWNLOAD_PROGRESS") {
      updateDownloadProgress(message);
    }
    return false;
  });
  globalThis.__FBIS_CONTENT_SCRIPT_LOADED__ = true;
  ensureMainWorldBridge();
  void initializeContentSettings().finally(startFeedQuickActions);

  function normalizeContentSettings(value = {}) {
    return {
      fbis_include_post_info: value.fbis_include_post_info !== false,
      fbis_default_download_mode:
        value.fbis_default_download_mode === "manager" ? "manager" : "zip"
    };
  }

  async function initializeContentSettings() {
    if (!chrome.storage?.local) return;
    try {
      const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
      Object.assign(contentSettings, normalizeContentSettings(stored));
    } catch {
      Object.assign(contentSettings, DEFAULT_SETTINGS);
    }
    chrome.storage?.onChanged?.addListener(handleContentSettingsChanged);
  }

  function handleContentSettingsChanged(changes, areaName) {
    if (areaName !== "local") return;
    if (changes.fbis_include_post_info) {
      contentSettings.fbis_include_post_info = changes.fbis_include_post_info.newValue !== false;
    }
    if (changes.fbis_default_download_mode) {
      contentSettings.fbis_default_download_mode =
        changes.fbis_default_download_mode.newValue === "manager" ? "manager" : "zip";
      refreshQuickActionLabels();
    }
  }

  function getDefaultQuickActionMode(pureVideo) {
    return pureVideo ? "video" : contentSettings.fbis_default_download_mode;
  }

  function getQuickActionLabel({ pureVideo, estimatedImages, estimatedVideos }) {
    if (pureVideo) return "⚡ Tải Video HD (MP4)";
    if (contentSettings.fbis_default_download_mode === "manager") {
      const total = estimatedImages + estimatedVideos;
      return `⚡ IDM Direct ${total} media`;
    }
    if (estimatedVideos > 0) return `⚡ Tải ${estimatedImages} ảnh + ${estimatedVideos} Video`;
    return `⚡ Tải nhanh ${estimatedImages} ảnh (ZIP)`;
  }

  function refreshQuickActionLabels() {
    for (const view of quickActionViews) {
      if (!view.host.isConnected) {
        quickActionViews.delete(view);
        continue;
      }
      view.label.textContent = getQuickActionLabel(view);
    }
  }

  function ensureMainWorldBridge() {
    if (document.getElementById("fbis-main-world-bridge")) return;
    const script = document.createElement("script");
    script.id = "fbis-main-world-bridge";
    script.src = chrome.runtime.getURL("src/injected.js");
    script.async = false;
    script.addEventListener("load", () => script.remove(), { once: true });
    (document.head || document.documentElement).appendChild(script);
  }

  function requestMainBridge(type, payload = {}, timeout = 2500) {
    const requestId = `fbis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("MAIN-world resolver timeout."));
      }, timeout);

      function handleMessage(event) {
        const message = event.data;
        if (
          event.source !== window ||
          message?.source !== "FBIS_MAIN" ||
          message.requestId !== requestId ||
          message.type !== `${type}_RESULT`
        ) {
          return;
        }
        window.clearTimeout(timer);
        window.removeEventListener("message", handleMessage);
        if (message.ok) resolve(message);
        else reject(new Error(message.error || "MAIN-world resolver failed."));
      }

      window.addEventListener("message", handleMessage);
      window.postMessage({ source: "FBIS_CONTENT", type, requestId, ...payload }, "*");
    });
  }

  function startFeedQuickActions() {
    let timer = 0;
    const scan = () => {
      timer = 0;
      for (const post of document.querySelectorAll('div[role="article"]')) {
        if (post.parentElement?.closest?.('div[role="article"]')) continue;
        installQuickAction(post);
      }
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(scan, 150);
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  }

  function installQuickAction(post) {
    if (!post?.isConnected || post.querySelector('[data-fbis-quick-action="1"]')) return;
    const links = Collector.getPostPhotoLinks(post);
    const videoRefs = Collector.getPostVideoRefs(post);
    if (links.length === 0 && videoRefs.length === 0) return;

    const countInfo = Collector.estimateExpectedCount(post);
    const mediaContainer = links[0]?.parentElement || videoRefs[0]?.element?.parentElement || post;
    const estimatedImages = links.length > 0 ? (countInfo.expected || links.length) : 0;
    const estimatedVideos = videoRefs.length;
    const pureVideo = estimatedImages === 0 && estimatedVideos > 0;
    const host = document.createElement("span");
    host.dataset.fbisQuickAction = "1";
    host.style.cssText = "position:absolute;top:8px;right:8px;z-index:20;display:block;";
    if (getComputedStyle(mediaContainer).position === "static") {
      mediaContainer.style.position = "relative";
    }
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial}.wrap{position:relative;display:inline-flex;align-items:stretch;filter:drop-shadow(0 4px 16px rgba(0,0,0,.28))}.q,.more{border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.72);color:#fff;font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:.64;cursor:pointer;transition:opacity .15s ease,transform .15s ease,background .15s ease}.q{display:inline-flex;align-items:center;gap:7px;border-radius:20px 0 0 20px;padding:7px 10px 7px 11px;border-right:0}.more{width:30px;border-radius:0 20px 20px 0;padding:0}.q:hover,.q:focus-visible,.more:hover,.more:focus-visible{opacity:1;background:rgba(0,0,0,.86)}.q:active,.more:active{transform:translateY(1px)}.q:disabled,.more:disabled,.menu button:disabled{cursor:progress;opacity:.72}.i{width:15px;height:15px;display:grid;place-items:center}.spin{animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}.done{color:#62d58b}.menu{position:absolute;top:calc(100% + 6px);right:0;min-width:190px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(20,20,22,.97);box-shadow:0 10px 28px rgba(0,0,0,.42);z-index:3}.menu[hidden]{display:none}.menu button{display:block;width:100%;border:0;border-radius:8px;padding:9px 10px;background:transparent;color:#fff;text-align:left;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}.menu button:hover,.menu button:focus-visible{background:rgba(255,255,255,.1)}.toast{position:absolute;right:0;top:calc(100% + 8px);max-width:240px;padding:7px 10px;border-radius:9px;background:rgba(18,18,20,.96);color:#fff;font:600 11px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transform:translateY(-3px);pointer-events:none;transition:opacity .15s ease,transform .15s ease;z-index:4}.toast.show{opacity:1;transform:translateY(0)}`;
    const wrap = document.createElement("span");
    wrap.className = "wrap";
    const button = document.createElement("button");
    button.className = "q";
    button.type = "button";
    const icon = document.createElement("span");
    icon.className = "i";
    icon.textContent = pureVideo ? "▶" : "⇩";
    const label = document.createElement("span");
    const quickView = { host, label, pureVideo, estimatedImages, estimatedVideos };
    label.textContent = getQuickActionLabel(quickView);
    button.append(icon, label);
    const moreButton = document.createElement("button");
    moreButton.className = "more";
    moreButton.type = "button";
    moreButton.setAttribute("aria-label", "Chọn chế độ tải");
    moreButton.textContent = "▾";
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;
    const menuOptions = [
      ["zip", "Tải ZIP"],
      ["manager", "Tải qua IDM / FDM"],
      ["copy", "Copy link HD"],
      ["comments", "💬 Quét Media Bình luận (ZIP)"]
    ];
    const optionButtons = menuOptions.map(([mode, text]) => {
      const option = document.createElement("button");
      option.type = "button";
      option.dataset.mode = mode;
      option.textContent = text;
      menu.appendChild(option);
      return option;
    });
    const toast = document.createElement("span");
    toast.className = "toast";
    wrap.append(button, moreButton, menu, toast);
    root.append(style, wrap);
    mediaContainer.appendChild(host);
    quickActionViews.add(quickView);

    moreButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.quickActionBusy.has(post)) menu.hidden = !menu.hidden;
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runQuickAction(post, getDefaultQuickActionMode(pureVideo), {
        button,
        moreButton,
        optionButtons,
        menu,
        icon,
        label,
        toast
      });
    });

    for (const option of optionButtons) {
      option.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        runQuickAction(post, option.dataset.mode, {
          button,
          moreButton,
          optionButtons,
          menu,
          icon,
          label,
          toast
        });
      });
    }
  }

  async function runQuickAction(post, mode, ui) {
    if (state.quickActionBusy.has(post)) return;
    state.quickActionBusy.add(post);
    ui.menu.hidden = true;
    ui.button.disabled = true;
    ui.moreButton.disabled = true;
    for (const option of ui.optionButtons) option.disabled = true;
    ui.icon.classList.remove("done");
    ui.icon.classList.add("spin");
    ui.icon.textContent = "↻";

    try {
      const media = await resolveQuickMedia(post, (text) => { ui.label.textContent = text; });
      const metadata = Collector.extractPostMetadata(post, location.href);
      const totalMedia = media.images.length + media.videos.length;
      let successText;

      if (mode === "comments") {
        const comments = Collector.collectCommentMedia(post);
        const commentCount = comments.reduce((sum, comment) => sum + comment.media.length, 0);
        if (commentCount === 0) throw new Error("Không tìm thấy media trong bình luận đã tải trên trang.");
        ui.label.textContent = `Đang gom ${commentCount} media bình luận...`;
        await createAndDownloadZip({ ...media, comments }, metadata, (done, total) => {
          ui.label.textContent = `Đang nén ZIP (${done}/${total})...`;
        });
        successText = `Đã gom ${commentCount} media bình luận`;
      } else if (mode === "video") {
        if (media.videos.length === 0) throw new Error("Không tìm thấy URL Video HD.");
        ui.label.textContent = "Đang gửi Video HD sang Chrome...";
        await downloadVideosDirect(media.videos, metadata.postId);
        successText = media.videos.length === 1 ? "Đã bắt đầu tải Video HD" : `Đã gửi ${media.videos.length} video`;
      } else if (mode === "manager") {
        ui.label.textContent = `Đang gửi ${totalMedia} link sang IDM / FDM...`;
        await downloadThroughManager(media, metadata.postId);
        successText = `Đã gửi ${totalMedia} link`;
      } else if (mode === "copy") {
        await copyHdLinks(media);
        successText = `Đã copy ${totalMedia} link HD`;
        showQuickToast(ui.toast, successText);
      } else {
        await createAndDownloadZip(media, metadata, (done, total) => {
          ui.label.textContent = `Đang nén ZIP (${done}/${total})...`;
        });
        successText = media.videos.length > 0
          ? `Đã xử lý ${media.images.length} ảnh + ${media.videos.length} video`
          : `Đã tải ZIP ${media.images.length} ảnh`;
      }

      ui.icon.classList.remove("spin");
      ui.icon.classList.add("done");
      ui.icon.textContent = "✓";
      ui.label.textContent = successText;
    } catch (error) {
      DiagnosticLogger?.error("content", `QUICK_ACTION_FAILED ${error instanceof Error ? error.message : "unknown"}`);
      ui.icon.classList.remove("spin");
      ui.icon.textContent = "!";
      ui.label.textContent = error instanceof Error ? error.message : "Tải nhanh thất bại";
    } finally {
      state.quickActionBusy.delete(post);
      ui.button.disabled = false;
      ui.moreButton.disabled = false;
      for (const option of ui.optionButtons) option.disabled = false;
    }
  }

  async function downloadThroughManager(media, albumId) {
    const results = [];
    if (media.images.length > 0) {
      const response = await chrome.runtime.sendMessage({
        type: "FBIS_DOWNLOAD_IMAGES",
        albumId: albumId || "unknown",
        images: media.images.map(({ url }) => ({ url }))
      });
      if (!response?.ok && !response?.started) {
        throw new Error(response?.error || "Chrome không gửi được link ảnh sang trình quản lý tải.");
      }
      results.push(response);
    }
    if (media.videos.length > 0) {
      results.push(await downloadVideosDirect(media.videos, albumId));
    }
    return results;
  }

  async function downloadVideosDirect(videos, postId) {
    const response = await chrome.runtime.sendMessage({
      type: "FBIS_DOWNLOAD_VIDEOS",
      postId: postId || "unknown",
      videos: videos.map(({ url, filename }) => ({ url, filename }))
    });
    if (!response?.ok && !response?.started) {
      throw new Error(response?.error || "Chrome không bắt đầu được video download.");
    }
    return response;
  }

  async function copyHdLinks(media) {
    const text = [...media.images, ...media.videos]
      .map((item) => item.url)
      .filter(Boolean)
      .join("\r\n");
    if (!text) throw new Error("Không có link HD để copy.");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Trình duyệt từ chối copy link.");
  }

  function showQuickToast(toast, message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  async function resolveQuickMedia(post, onStatus) {
    const photoLinks = Collector.getPostPhotoLinks(post);
    const videoRefs = Collector.getPostVideoRefs(post);
    const countInfo = Collector.estimateExpectedCount(post);
    const expected = photoLinks.length > 0 ? countInfo.expected : null;
    const rendered = photoLinks.length > 0 ? collectRenderedImages(post) : [];
    const directVideos = dedupeVideos(
      videoRefs.filter((video) => video.url).map((video) => ({
        url: video.url,
        quality: "direct",
        source: "video-element",
        videoId: video.videoId || null
      }))
    );

    const metadata = Collector.extractPostMetadata(post, location.href);
    onStatus("Đang kéo link...");
    let relayImages = [];
    let relayVideos = [];
    try {
      const relay = await requestMainBridge("FBIS_RESOLVE_POST", { postId: metadata.postId }, 2500);
      relayImages = Array.isArray(relay.images) ? relay.images : [];
      relayVideos = Array.isArray(relay.videos) ? relay.videos : [];
    } catch {
      // The DOM carousel is the compatibility fallback.
    }

    const mergedImages = dedupeImages([...rendered, ...relayImages]);
    const videos = dedupeVideos([...directVideos, ...relayVideos]);
    const imagesComplete = photoLinks.length === 0 || (expected ? mergedImages.length >= expected : mergedImages.length > 0);
    if (imagesComplete) {
      if (videoRefs.length > 0 && videos.length === 0) {
        throw new Error("Không tìm thấy URL Video HD trực tiếp.");
      }
      return {
        images: photoLinks.length === 0
          ? []
          : expected
            ? mergedImages.slice(0, expected)
            : mergedImages,
        videos
      };
    }

    onStatus("Đang quét nhanh carousel...");
    const returnUrl = location.href;
    document.documentElement.classList.add("fbis-silent-scan");
    try {
      const result = await fastCollector.collectFromPost(post, {
        expectedCount: expected,
        albumId: metadata.postId,
        onProgress: ({ found, expected: total }) => onStatus(`Đang quét nhanh ${found}${total ? `/${total}` : ""} ảnh...`)
      });
      if (result.images.length === 0 && videos.length === 0) throw new Error("Không tìm thấy media để tải.");
      return { images: result.images, videos };
    } finally {
      closePhotoViewer(returnUrl);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      document.documentElement.classList.remove("fbis-silent-scan");
    }
  }

  function closePhotoViewer(returnUrl) {
    if (!Collector.isPhotoViewerLocation(location.href)) return;
    const viewerScope = Collector.findActiveViewerScope(document, window);
    const searchRoot = viewerScope?.closest?.('[role="dialog"]') || viewerScope?.parentElement || document;
    const closeControl = Array.from(searchRoot.querySelectorAll?.("[aria-label]") || []).find((element) => {
      const label = String(element.getAttribute("aria-label") || "");
      return /(?:close|đóng|quay\s+lại|back|fermer|schließen|cerrar|chiudi|关闭|閉じる|닫기)/i.test(label);
    });
    const clickable = closeControl?.closest?.('button, [role="button"], a') || closeControl;
    if (clickable?.click) {
      clickable.click();
    } else if (returnUrl && location.href !== returnUrl) {
      history.back();
    }
  }

  function collectRenderedImages(post) {
    const images = [];
    for (const image of post.querySelectorAll("img")) {
      if (Collector.isInExcludedPostSubtree(image, post)) continue;
      const rect = image.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 90) continue;
      const url = Collector.getBestImageUrl(image);
      if (url) images.push({ url, width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    }
    return dedupeImages(images);
  }

  function dedupeImages(images) {
    const seen = new Set();
    return images.filter((image) => {
      const key = Collector.normalizeImageIdentity(image?.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function dedupeVideos(videos) {
    const seen = new Set();
    return videos.filter((video) => {
      try {
        const parsed = new URL(video?.url || "");
        const key = `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
        if (!key || seen.has(key)) return false;
        const fromPlayableField = /^(?:playable_url_quality_hd|browser_native_hd_url|playable_url)$/i.test(
          String(video?.source || "")
        );
        const allowed = fromPlayableField
          ? Collector.isAllowedMediaUrl(video.url)
          : Collector.isAllowedVideoUrl(video.url);
        if (!allowed) return false;
        seen.add(key);
        return true;
      } catch {
        return false;
      }
    });
  }

  function togglePanel() {
    state.visible = !state.visible;
    elements.panel.classList.toggle("is-hidden", !state.visible || state.picking);
    if (state.visible) {
      autoDetectContext();
    } else if (state.picking) {
      stopPicking();
    }
  }

  function autoDetectContext() {
    if (
      state.scanning ||
      state.downloading ||
      state.images.length > 0 ||
      state.selectedPost?.isConnected
    ) {
      return;
    }

    const openPost = Collector.findActivePostContainer();
    const openViewer = Collector.isPhotoViewerLocation(location.href) && Collector.readViewerState(document, window);

    if (openPost) {
      setSelectedPost(openPost);
      elements.useOpenButton.classList.remove("is-hidden");
      elements.useOpenButton.textContent = "Dùng bài đang mở";
      elements.useOpenButton.dataset.context = "post";
    } else if (openViewer) {
      setOpenViewerSelection();
      elements.useOpenButton.classList.remove("is-hidden");
      elements.useOpenButton.textContent = "Dùng album đang mở";
      elements.useOpenButton.dataset.context = "viewer";
    } else {
      elements.useOpenButton.classList.add("is-hidden");
    }
  }

  function handlePanelClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) {
      return;
    }

    const action = button.dataset.action;
    if (action === "close") {
      state.visible = false;
      elements.panel.classList.add("is-hidden");
    } else if (action === "pick") {
      startPicking();
    } else if (action === "cancel-pick") {
      stopPicking();
    } else if (action === "use-open") {
      autoDetectContext();
    } else if (action === "scan-all") {
      scanImages(true);
    } else if (action === "scan-choose") {
      scanImages(false);
    } else if (action === "cancel") {
      state.cancelRequested = true;
      setStatus("Đang dừng sau ảnh hiện tại…", "Đã yêu cầu dừng");
    } else if (action === "select-all") {
      state.selectedIndexes = new Set(state.images.map((_, index) => index));
      syncGallerySelection();
    } else if (action === "select-none") {
      state.selectedIndexes.clear();
      syncGallerySelection();
    } else if (action === "download-selected") {
      downloadSelected();
    }
  }

  function startPicking() {
    if (state.scanning || state.downloading) {
      return;
    }

    state.picking = true;
    elements.panel.classList.add("is-hidden");
    elements.pickerToast.classList.remove("is-hidden");
    document.documentElement.classList.add("fbis-picking-post");
    document.addEventListener("mouseover", handlePickerHover, true);
    document.addEventListener("mouseout", handlePickerOut, true);
    document.addEventListener("click", handlePickerClick, true);
  }

  function stopPicking() {
    state.picking = false;
    clearHoveredPost();
    document.documentElement.classList.remove("fbis-picking-post");
    document.removeEventListener("mouseover", handlePickerHover, true);
    document.removeEventListener("mouseout", handlePickerOut, true);
    document.removeEventListener("click", handlePickerClick, true);
    elements.pickerToast.classList.add("is-hidden");
    elements.panel.classList.toggle("is-hidden", !state.visible);
  }

  function handlePickerHover(event) {
    if (event.composedPath().includes(host)) {
      return;
    }
    const post = Collector.findPostContainerFromTarget(event.target);
    if (post === state.hoveredPost) {
      return;
    }
    clearHoveredPost();
    if (post) {
      post.classList.add("fbis-post-hover");
      state.hoveredPost = post;
    }
  }

  function handlePickerOut(event) {
    if (state.hoveredPost && !state.hoveredPost.contains(event.relatedTarget)) {
      clearHoveredPost();
    }
  }

  function handlePickerClick(event) {
    if (event.composedPath().includes(host)) {
      return;
    }
    const post = Collector.findPostContainerFromTarget(event.target);
    if (!post) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setSelectedPost(post);
    stopPicking();
  }

  function clearHoveredPost() {
    state.hoveredPost?.classList.remove("fbis-post-hover");
    state.hoveredPost = null;
  }

  function setSelectedPost(post) {
    const countInfo = Collector.estimateExpectedCount(post);
    state.selectedPost = post;
    state.selectedSummary = Collector.getPostSummary(post);
    state.expectedCount = countInfo.expected;
    state.albumId = Collector.extractAlbumId(Collector.getPostPhotoLinks(post)[0]?.href) || "unknown";
    resetResults();

    elements.selectionCard.classList.remove("is-empty");
    elements.selectionTitle.textContent = state.selectedSummary;
    elements.selectionMeta.textContent = countInfo.expected
      ? `Facebook hiển thị khoảng ${countInfo.expected} ảnh trong bài.`
      : "Đã phát hiện bài viết có ảnh.";
    elements.scanActions.classList.remove("is-hidden");
  }

  function setOpenViewerSelection() {
    state.selectedPost = null;
    state.selectedSummary = "Album ảnh đang mở";
    state.expectedCount = null;
    state.albumId = Collector.extractAlbumId(location.href) || "unknown";
    resetResults();

    elements.selectionCard.classList.remove("is-empty");
    elements.selectionTitle.textContent = state.selectedSummary;
    elements.selectionMeta.textContent = "Bắt đầu từ ảnh hiện tại và quét đến khi carousel lặp lại.";
    elements.scanActions.classList.remove("is-hidden");
  }

  function resetResults() {
    state.images = [];
    state.selectedIndexes.clear();
    elements.results.classList.add("is-hidden");
    elements.gallery.replaceChildren();
  }

  async function scanImages(downloadAllAfterScan) {
    if (state.scanning || state.downloading) {
      return;
    }

    if (state.selectedPost && !state.selectedPost.isConnected) {
      showInlineError("Bài viết đã thay đổi trên trang. Hãy chọn lại bài viết.");
      return;
    }

    const scanningOpenViewer = !state.selectedPost && Collector.isPhotoViewerLocation(location.href);
    if (!state.selectedPost && !scanningOpenViewer) {
      showInlineError("Hãy chọn một bài viết hoặc mở trình xem ảnh trước.");
      return;
    }

    state.scanning = true;
    state.cancelRequested = false;
    resetResults();
    setControlsDisabled(true);
    elements.progressCard.classList.remove("is-hidden");
    elements.progressTitle.textContent = "Đang quét ảnh…";
    elements.progressFill.style.width = "4%";
    setStatus("Facebook sẽ tự chuyển qua từng ảnh. Đừng đóng tab.", formatProgress(0));

    try {
      const options = {
        expectedCount: state.expectedCount,
        albumId: state.albumId,
        isCancelled: () => state.cancelRequested,
        onProgress: ({ found, expected }) => {
          const percent = expected ? Math.min(96, Math.max(4, (found / expected) * 100)) : Math.min(92, 8 + found * 2);
          elements.progressFill.style.width = `${percent}%`;
          setStatus("Đang lấy ảnh chất lượng lớn từ trình xem Facebook…", formatProgress(found, expected));
        }
      };

      const result = state.selectedPost
        ? await collector.collectFromPost(state.selectedPost, options)
        : await collector.collectOpenViewer(options);

      state.images = result.images;
      state.albumId = result.albumId;
      state.selectedIndexes = new Set(result.images.map((_, index) => index));
      elements.progressFill.style.width = result.complete ? "100%" : "96%";

      if (result.reason === "cancelled") {
        elements.progressTitle.textContent = "Đã dừng quét";
        setStatus(`Đã dừng. Giữ lại ${result.images.length} ảnh đã tìm thấy.`, `${result.images.length} ảnh`);
        showResults();
      } else if (!result.complete) {
        elements.progressTitle.textContent = "Quét chưa hoàn tất";
        setStatus(
          `Quét chưa chắc đã đủ. Đã tìm thấy ${result.images.length}${result.expectedCount ? `/${result.expectedCount}` : ""} ảnh; bạn có thể tải phần này hoặc quét lại.`,
          "Chưa hoàn tất"
        );
        showResults();
      } else {
        elements.progressTitle.textContent = "Quét hoàn tất";
        setStatus(`Đã tìm thấy ${result.images.length} ảnh không trùng.`, `${result.images.length} ảnh`);
        showResults();
        if (downloadAllAfterScan && result.images.length > 0) {
          await startDownload(result.images);
        }
      }
    } catch (error) {
      showInlineError(error instanceof Error ? error.message : "Không thể quét ảnh trong bài viết.");
    } finally {
      state.scanning = false;
      setControlsDisabled(false);
    }
  }

  function showResults() {
    elements.results.classList.remove("is-hidden");
    elements.gallery.replaceChildren();

    const fragment = document.createDocumentFragment();
    state.images.forEach((image, index) => {
      const label = document.createElement("label");
      label.className = "image-card is-selected";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.index = String(index);
      checkbox.setAttribute("aria-label", `Chọn ảnh ${index + 1}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedIndexes.add(index);
        } else {
          state.selectedIndexes.delete(index);
        }
        label.classList.toggle("is-selected", checkbox.checked);
        updateSelectedCount();
      });

      const preview = document.createElement("img");
      preview.src = image.url;
      preview.alt = `Ảnh ${index + 1}`;
      preview.loading = "lazy";
      preview.referrerPolicy = "no-referrer";

      const badge = document.createElement("span");
      badge.className = "image-index";
      badge.textContent = String(index + 1).padStart(2, "0");

      const dimensions = document.createElement("span");
      dimensions.className = "image-dimensions";
      dimensions.textContent = image.width && image.height ? `${image.width}×${image.height}` : "Ảnh Facebook";

      label.append(checkbox, preview, badge, dimensions);
      fragment.appendChild(label);
    });

    elements.gallery.appendChild(fragment);
    updateSelectedCount();
  }

  function syncGallerySelection() {
    for (const checkbox of elements.gallery.querySelectorAll('input[type="checkbox"]')) {
      const index = Number(checkbox.dataset.index);
      checkbox.checked = state.selectedIndexes.has(index);
      checkbox.closest(".image-card").classList.toggle("is-selected", checkbox.checked);
    }
    updateSelectedCount();
  }

  function updateSelectedCount() {
    const count = state.selectedIndexes.size;
    elements.selectedCount.textContent = `Đã chọn ${count}/${state.images.length} ảnh`;
    elements.downloadSelectedButton.textContent = count ? `Tải ${count} ảnh đã chọn` : "Chưa chọn ảnh";
    elements.downloadSelectedButton.disabled = count === 0 || state.downloading;
  }

  async function downloadSelected() {
    const images = state.images.filter((_, index) => state.selectedIndexes.has(index));
    if (images.length > 0) {
      await startDownload(images);
    }
  }

  async function startDownload(images) {
    if (state.downloading || images.length === 0) {
      return;
    }

    state.downloading = true;
    setControlsDisabled(true);
    elements.progressCard.classList.remove("is-hidden");
    elements.progressTitle.textContent = "Đang tạo ZIP…";
    elements.progressFill.style.width = "4%";
    setStatus("Đang tải ảnh và đóng gói hoàn toàn trong trình duyệt.", `0/${images.length}`);

    try {
      const metadata = state.selectedPost?.isConnected
        ? Collector.extractPostMetadata(state.selectedPost, location.href)
        : {
            postId: state.albumId || "unknown",
            author: "Facebook",
            timestamp: "",
            permalink: location.href,
            caption: ""
          };
      await createAndDownloadZip(images, metadata, (processed, total) => {
        const percent = Math.max(4, Math.min(96, (processed / total) * 96));
        elements.progressFill.style.width = `${percent}%`;
        setStatus("Đang kéo ảnh và đóng gói ZIP…", `${processed}/${total}`);
      });
      elements.progressFill.style.width = "100%";
      elements.progressTitle.textContent = "Đã bắt đầu tải ZIP";
      setStatus(
        contentSettings.fbis_include_post_info
          ? `Đã đóng gói ${images.length} ảnh cùng post_info.txt.`
          : `Đã đóng gói ${images.length} ảnh.`,
        `${images.length} ảnh`
      );
    } catch (error) {
      DiagnosticLogger?.error("content", `ZIP_FLOW_FAILED ${error instanceof Error ? error.message : "unknown"}`);
      showInlineError(error instanceof Error ? error.message : "Không thể bắt đầu tải ảnh.");
    } finally {
      state.downloading = false;
      setControlsDisabled(false);
      updateSelectedCount();
    }
  }

  async function createAndDownloadZip(mediaOrImages, metadata, onProgress = () => undefined) {
    const media = Array.isArray(mediaOrImages)
      ? { images: mediaOrImages, videos: [] }
      : {
          images: Array.isArray(mediaOrImages?.images) ? mediaOrImages.images : [],
          videos: Array.isArray(mediaOrImages?.videos) ? mediaOrImages.videos : [],
          comments: Array.isArray(mediaOrImages?.comments) ? mediaOrImages.comments : []
        };
    const images = media.images;
    const videos = media.videos;
    const comments = media.comments || [];
    const writer = createStreamingZipWriter();
    const largeVideos = [];
    let completed = 0;
    const commentMediaCount = comments.reduce((sum, comment) => sum + comment.media.length, 0);
    const total = images.length + videos.length + commentMediaCount;
    for (let start = 0; start < images.length; start += 5) {
      const batch = images.slice(start, start + 5);
      const mediaItems = await fetchMediaBatchFromBackground(batch.map((image) => image.url));
      for (let offset = 0; offset < mediaItems.length; offset += 1) {
        const index = start + offset;
        const media = mediaItems[offset];
        const extension = getImageExtension(images[index].url, media.contentType);
        writer.add(`${String(index + 1).padStart(3, "0")}.${extension}`, media.bytes);
        media.bytes = null;
        completed += 1;
        onProgress(completed, total);
      }
    }

    for (let index = 0; index < videos.length; index += 1) {
      const video = videos[index];
      const smallVideo = await fetchSmallVideoForZip(video.url);
      if (smallVideo.tooLarge) {
        largeVideos.push(video);
      } else {
        const suffix = videos.length > 1 ? `_${String(index + 1).padStart(2, "0")}` : "";
        writer.add(`video${suffix}.mp4`, smallVideo.bytes);
        smallVideo.bytes = null;
      }
      completed += 1;
      onProgress(completed, total);
    }

    for (const comment of comments) {
      const author = sanitizeZipPart(comment.author || "Facebook_User");
      const commentId = sanitizeZipPart(comment.commentId || "unknown");
      const commentImages = comment.media.filter((item) => item.type === "image");
      const commentVideos = comment.media.filter((item) => item.type === "video");

      for (let start = 0; start < commentImages.length; start += 5) {
        const batch = commentImages.slice(start, start + 5);
        const mediaItems = await fetchMediaBatchFromBackground(batch.map((item) => item.url));
        for (let offset = 0; offset < mediaItems.length; offset += 1) {
          const source = batch[offset];
          const fetched = mediaItems[offset];
          const extension = getImageExtension(source.url, fetched.contentType);
          const name = `${author}_${commentId}_${String(source.index || start + offset + 1).padStart(2, "0")}.${extension}`;
          writer.add(`comments_media/${name}`, fetched.bytes);
          fetched.bytes = null;
          completed += 1;
          onProgress(completed, total);
        }
      }

      for (const video of commentVideos) {
        const name = `${author}_${commentId}_${String(video.index || 1).padStart(2, "0")}.mp4`;
        const smallVideo = await fetchSmallVideoForZip(video.url);
        if (smallVideo.tooLarge) {
          largeVideos.push({ ...video, filename: `comments_media/${name}` });
        } else {
          writer.add(`comments_media/${name}`, smallVideo.bytes);
          smallVideo.bytes = null;
        }
        completed += 1;
        onProgress(completed, total);
      }
    }

    if (contentSettings.fbis_include_post_info) {
      writer.add(
        "post_info.txt",
        Zip.strToU8(formatPostInfo(metadata, images.length, videos, comments))
      );
    }
    const zipBlob = await writer.finish();
    const blobUrl = URL.createObjectURL(zipBlob);
    const filename = buildZipFilename(metadata, images.length, videos.length);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "FBIS_DOWNLOAD_ZIP",
        url: blobUrl,
        filename
      });
      if (!response?.ok) throw new Error(response?.error || "Chrome không bắt đầu được ZIP download.");
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    if (largeVideos.length > 0) {
      await downloadVideosDirect(largeVideos, metadata.postId);
    }
  }

  function createStreamingZipWriter() {
    const chunks = [];
    let resolveDone;
    let rejectDone;
    let finished = false;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    const zip = new Zip.Zip((error, data, final) => {
      if (finished) return;
      if (error) {
        finished = true;
        rejectDone(error);
        return;
      }
      if (data?.length) chunks.push(data);
      if (final) {
        finished = true;
        resolveDone(new Blob(chunks, { type: "application/zip" }));
      }
    });

    return {
      add(name, bytes) {
        const file = new Zip.ZipPassThrough(name);
        zip.add(file);
        file.push(bytes, true);
      },
      finish() {
        zip.end();
        return done;
      }
    };
  }

  function sanitizeZipPart(value) {
    return String(value || "unknown")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "unknown";
  }

  async function fetchMediaBatchFromBackground(urls) {
    const response = await chrome.runtime.sendMessage({
      type: "FBIS_FETCH_MEDIA_BATCH",
      urls
    });
    if (!response?.ok || !Array.isArray(response.items) || response.items.length !== urls.length) {
      throw new Error(response?.error || "Background không tải đủ dữ liệu ảnh.");
    }
    return response.items.map((item) => ({
      contentType: item.contentType || "application/octet-stream",
      bytes: base64ToUint8Array(item.base64)
    }));
  }

  async function fetchSmallVideoForZip(url) {
    const response = await chrome.runtime.sendMessage({
      type: "FBIS_FETCH_SMALL_VIDEO",
      url
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Background không kiểm tra được video.");
    }
    if (response.tooLarge) {
      return { tooLarge: true, size: response.size ?? null };
    }
    if (!response.base64) {
      throw new Error("Background không trả dữ liệu video.");
    }
    return {
      tooLarge: false,
      size: response.size ?? null,
      bytes: base64ToUint8Array(response.base64)
    };
  }

  function base64ToUint8Array(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function getImageExtension(url, contentType) {
    const mime = String(contentType || "").toLowerCase();
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("avif")) return "avif";
    try {
      const match = new URL(url).pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)$/);
      if (match) return match[1] === "jpeg" ? "jpg" : match[1];
    } catch {
      // Use jpg as the conservative fallback for Facebook media.
    }
    return "jpg";
  }

  function formatPostInfo(metadata, count, videos = [], comments = []) {
    const lines = [
      `Author: ${metadata.author || "Facebook"}`,
      `Post ID: ${metadata.postId || "unknown"}`,
      `Photos: ${count}`,
      `Videos: ${videos.length}`,
      `Comment media groups: ${comments.length}`,
      `Timestamp: ${metadata.timestamp || ""}`,
      `Permalink: ${metadata.permalink || location.href}`,
      ""
    ];
    if (videos.length > 0) {
      lines.push("Video URLs:");
      videos.forEach((video, index) => lines.push(`${index + 1}. ${video.url}`));
      lines.push("");
    }
    if (comments.length > 0) {
      lines.push("Comment Media:");
      for (const comment of comments) {
        lines.push(
          `- ${comment.author || "Facebook User"} | ${comment.commentId || "unknown"} | ${comment.media.length} media`
        );
        for (const item of comment.media) {
          lines.push(`  ${item.type}: ${item.url}`);
        }
      }
      lines.push("");
    }
    lines.push("Caption:", metadata.caption || "");
    return lines.join("\r\n");
  }

  function buildZipFilename(metadata, count, videoCount = 0) {
    const author = String(metadata.author || "Facebook")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "Facebook";
    const postId = String(metadata.postId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    const videoSuffix = videoCount ? `_${videoCount}videos` : "";
    return `FB_${author}_${postId}_${count}photos${videoSuffix}.zip`;
  }

  function updateDownloadProgress(progress) {
    if (!state.downloading) {
      return;
    }
    const percent = progress.total ? Math.max(4, (progress.processed / progress.total) * 100) : 4;
    elements.progressFill.style.width = `${percent}%`;
    setStatus(
      `Đã bắt đầu ${progress.started} lượt tải${progress.failed ? `; ${progress.failed} lỗi` : ""}.`,
      `${progress.processed}/${progress.total}`
    );
  }

  function setStatus(text, count) {
    elements.statusText.textContent = text;
    elements.progressCount.textContent = count || "";
  }

  function showInlineError(message) {
    elements.progressCard.classList.remove("is-hidden");
    elements.progressTitle.textContent = "Cần thử lại";
    elements.progressFill.style.width = "100%";
    elements.progressFill.classList.add("is-error");
    setStatus(message, "Lỗi");
    window.setTimeout(() => elements.progressFill.classList.remove("is-error"), 2500);
  }

  function formatProgress(found, expected = state.expectedCount) {
    return expected ? `${found}/${expected}` : `${found} ảnh`;
  }

  function setControlsDisabled(disabled) {
    for (const button of shadow.querySelectorAll("button")) {
      if (button.dataset.action === "close" || button.dataset.action === "cancel") {
        continue;
      }
      button.disabled = disabled;
    }
  }

  function getPanelStyles() {
    return `
      :host { color-scheme: dark; }
      *, *::before, *::after { box-sizing: border-box; }
      button, input { font: inherit; }
      .is-hidden { display: none !important; }
      .panel {
        width: min(390px, calc(100vw - 28px));
        max-height: calc(100vh - 28px);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px;
        background: #17191d;
        color: #f5f7fb;
        box-shadow: 0 18px 60px rgba(0,0,0,.48), 0 2px 8px rgba(0,0,0,.35);
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.45;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 15px 16px;
        border-bottom: 1px solid rgba(255,255,255,.09);
        background: #202329;
      }
      .brand-mark {
        display: grid;
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        place-items: center;
        border-radius: 11px;
        background: #0866ff;
        color: #fff;
        font-size: 23px;
        font-weight: 800;
        box-shadow: inset 0 -2px 0 rgba(0,0,0,.18);
      }
      .heading-wrap { min-width: 0; flex: 1; }
      h1 { margin: 0; font-size: 15px; line-height: 1.3; letter-spacing: -.01em; }
      .heading-wrap p { margin: 2px 0 0; color: #aeb5c2; font-size: 12px; }
      .icon-button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 50%;
        background: #343840;
        color: #dfe3ea;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .icon-button:hover { background: #434851; }
      .body { max-height: calc(100vh - 97px); overflow: auto; padding: 16px; scrollbar-width: thin; }
      .intro { display: flex; align-items: flex-start; gap: 10px; }
      .intro.compact { margin-bottom: 12px; }
      .intro strong { display: block; margin-top: 1px; }
      .step-number {
        display: grid;
        width: 24px;
        height: 24px;
        flex: 0 0 24px;
        place-items: center;
        border-radius: 50%;
        background: rgba(8,102,255,.18);
        color: #69a2ff;
        font-size: 12px;
        font-weight: 800;
      }
      .muted { margin: 2px 0 0; color: #aeb5c2; font-size: 12px; }
      .selection-card {
        display: flex;
        align-items: center;
        gap: 11px;
        margin-top: 12px;
        padding: 12px;
        border: 1px solid rgba(71,139,255,.45);
        border-radius: 12px;
        background: rgba(8,102,255,.09);
      }
      .selection-card.is-empty { border-color: rgba(255,255,255,.1); background: #202329; }
      .selection-icon {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        place-items: center;
        border-radius: 9px;
        background: #2b3038;
        color: #78aaff;
        font-size: 20px;
      }
      .selection-copy { min-width: 0; }
      .selection-copy strong, .selection-copy span { display: block; }
      .selection-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .selection-copy span { margin-top: 2px; color: #aeb5c2; font-size: 12px; }
      .button-row { display: flex; gap: 8px; margin-top: 10px; }
      .button {
        min-height: 39px;
        flex: 1;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 9px 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background .15s ease, border-color .15s ease, transform .15s ease;
      }
      .button:not(:disabled):active { transform: translateY(1px); }
      .button:disabled { cursor: not-allowed; opacity: .48; }
      .button.primary { background: #0866ff; color: white; }
      .button.primary:not(:disabled):hover { background: #1c74ff; }
      .button.secondary { border-color: rgba(255,255,255,.13); background: #2b2f36; color: #f2f4f8; }
      .button.secondary:not(:disabled):hover { background: #373c45; }
      .button.ghost { border-color: transparent; background: transparent; color: #75aaff; }
      .divider { height: 1px; margin: 16px 0; background: rgba(255,255,255,.09); }
      .progress-card {
        position: relative;
        margin-top: 14px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 12px;
        background: #202329;
      }
      .progress-heading, .results-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .progress-heading span { color: #75aaff; font-size: 12px; font-weight: 800; }
      .progress-track { height: 7px; margin-top: 10px; overflow: hidden; border-radius: 999px; background: #343841; }
      .progress-fill { width: 4%; height: 100%; border-radius: inherit; background: #0866ff; transition: width .2s ease; }
      .progress-fill.is-error { background: #e5484d; }
      .status-text { margin: 8px 0 0; color: #aeb5c2; font-size: 12px; }
      .text-button { border: 0; padding: 5px 0; background: transparent; color: #75aaff; font-size: 12px; font-weight: 700; cursor: pointer; }
      .text-button:hover { color: #9bc1ff; text-decoration: underline; }
      .mini-actions { display: flex; gap: 10px; }
      .gallery {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        max-height: 275px;
        margin: 11px 0;
        overflow: auto;
        border-radius: 10px;
        scrollbar-width: thin;
      }
      .image-card {
        position: relative;
        display: block;
        aspect-ratio: 1;
        overflow: hidden;
        border: 2px solid transparent;
        border-radius: 9px;
        background: #2b2f36;
        cursor: pointer;
      }
      .image-card.is-selected { border-color: #2e7cff; }
      .image-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .image-card input {
        position: absolute;
        z-index: 2;
        top: 6px;
        right: 6px;
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: #0866ff;
      }
      .image-index, .image-dimensions {
        position: absolute;
        z-index: 1;
        bottom: 5px;
        border-radius: 5px;
        background: rgba(12,14,18,.78);
        color: white;
        font-size: 10px;
        line-height: 1;
      }
      .image-index { left: 5px; padding: 4px; font-weight: 800; }
      .image-dimensions { right: 5px; max-width: 70%; padding: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .full-width { width: 100%; }
      .privacy-note { margin: 13px 0 0; color: #7f8794; font-size: 11px; text-align: center; }
      .picker-toast {
        max-width: calc(100vw - 28px);
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 999px;
        padding: 11px 16px;
        background: #17191d;
        color: #f5f7fb;
        box-shadow: 0 10px 35px rgba(0,0,0,.42);
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        cursor: pointer;
      }
      .picker-toast strong { color: #75aaff; }
      :focus-visible { outline: 3px solid rgba(117,170,255,.72); outline-offset: 2px; }
      @media (max-width: 520px) {
        .panel { width: calc(100vw - 20px); }
        .body { padding: 13px; }
        .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { transition: none !important; }
      }
    `;
  }
})();
