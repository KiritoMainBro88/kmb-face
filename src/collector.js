(function initializeCollector(/** @type {any} */ globalScope) {
  "use strict";

  if (globalScope.FacebookAlbumCollector) {
    return;
  }

  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const { LIMITS, MEDIA_HOSTS, SELECTORS, TIMINGS } = Constants;

  /**
   * @typedef {Object} MediaItem
   * @property {string} url
   * @property {'image'|'video'} type
   * @property {string} filename
   * @property {number=} size
   */

  /**
   * @typedef {Object} PostMetadata
   * @property {string} id
   * @property {string} author
   * @property {string} timestamp
   * @property {string} text
   */

  /**
   * @typedef {Object} CollectorResult
   * @property {MediaItem[]} items
   * @property {PostMetadata} metadata
   * @property {boolean} isComplete
   */
  const NEXT_LABEL_PATTERN = /(?:next(?:\s+photo)?|ảnh\s+tiếp(?:\s+theo)?|tiếp\s+theo|suivante?|prochaine?|weiter|siguiente|avanti|seguente|следующ|下一|次へ|다음)/i;
  const PREVIOUS_LABEL_PATTERN = /(?:previous|prev|ảnh\s+trước|trước|précéd|zurück|anterior|indietro|предыдущ|上一|前へ|이전)/i;
  const CLOSE_LABEL_PATTERN = /(?:close|đóng|quay\s+lại|fermer|schließen|cerrar|chiudi|закрыть|关闭|閉じる|닫기)/i;
  const DISALLOWED_GEOMETRY_LABEL_PATTERN = /(?:like|comment|share|menu|reaction|zoom|fullscreen|thích|bình\s+luận|chia\s+sẻ|phóng|toàn\s+màn|đóng)/i;
  const MEDIA_URL_HOSTS = MEDIA_HOSTS;

  class CarouselCollector {
    /** @param {Object} [options={}] */
    constructor(options = {}) {
      this.document = options.document || globalScope.document;
      this.window = options.window || globalScope.window;
      this.pollInterval = options.pollInterval || TIMINGS.COLLECTOR_POLL_INTERVAL_MS;
      this.openTimeout = options.openTimeout || TIMINGS.VIEWER_OPEN_TIMEOUT_MS;
      this.changeTimeout = options.changeTimeout || TIMINGS.VIEWER_CHANGE_TIMEOUT_MS;
      this.keyboardRetryTimeout = options.keyboardRetryTimeout || TIMINGS.KEYBOARD_RETRY_TIMEOUT_MS;
      this.keyboardRetryLimit = toPositiveInteger(options.keyboardRetryLimit) || 3;
      this.safetyLimit = toPositiveInteger(options.safetyLimit) || LIMITS.MAX_SAFETY_IMAGES;
    }

    /** @param {*} postContainer @param {Object} [options={}] @returns {Promise<Object>} */
    async collectFromPost(postContainer, options = {}) {
      if (!postContainer?.isConnected) {
        throw new Error("Bài viết đã thay đổi trên trang. Hãy chọn lại bài viết.");
      }

      const countInfo = estimateExpectedCount(postContainer);
      const firstPhotoLink = getPostPhotoLinks(postContainer)[0];
      if (!firstPhotoLink) {
        throw new Error("Không tìm thấy ảnh trong bài viết đã chọn.");
      }

      const stateBeforeOpen = readViewerState(this.document, this.window);
      firstPhotoLink.click();
      const openedState = await this.waitForViewerToOpen(options.isCancelled, stateBeforeOpen);
      if (!openedState) {
        throw new Error("Facebook không mở được trình xem ảnh. Hãy mở một ảnh rồi thử lại.");
      }

      return this.collectOpenViewer({
        ...options,
        expectedCount: countInfo.expected,
        countInfo,
        albumId: extractAlbumId(firstPhotoLink.href) || extractAlbumId(this.window.location.href)
      });
    }

    /** @param {Object} [options={}] @returns {Promise<Object>} */
    async collectOpenViewer(options = {}) {
      let current = await this.waitForReadyViewerState(null, this.openTimeout, options.isCancelled);
      if (!current) {
        throw new Error("Không tìm thấy ảnh lớn đang mở trên Facebook.");
      }

      const images = [];
      const seen = new Set();
      const expectedCount = toPositiveInteger(options.expectedCount);
      const maxSteps = expectedCount
        ? Math.min(this.safetyLimit, Math.max(expectedCount + 10, 20))
        : this.safetyLimit;
      const initialSetId = current.setId;
      let reason = "safety-limit";

      for (let step = 0; step < maxSteps; step += 1) {
        if (options.isCancelled?.()) {
          reason = "cancelled";
          break;
        }

        if (seen.has(current.identity)) {
          reason = "cycle";
          break;
        }

        seen.add(current.identity);
        images.push(toResultImage(current, images.length));
        options.onProgress?.({
          found: images.length,
          expected: expectedCount,
          current: images[images.length - 1]
        });

        if (expectedCount && images.length >= expectedCount) {
          reason = "expected";
          break;
        }

        const nextState = await this.advanceViewer(current, options.isCancelled);

        if (!nextState) {
          reason = "end";
          break;
        }

        if (initialSetId && nextState.setId && nextState.setId !== initialSetId) {
          reason = "album-changed";
          break;
        }

        current = nextState;
      }

      const complete = isCollectionComplete(reason, images.length, expectedCount);
      return {
        images,
        expectedCount,
        countInfo: options.countInfo || null,
        albumId: options.albumId || extractAlbumId(this.window.location.href) || "unknown",
        complete,
        reason
      };
    }

    /** @param {Function=} isCancelled @param {*=} stateBeforeOpen @returns {Promise<*>} */
    async waitForViewerToOpen(isCancelled, stateBeforeOpen = null) {
      const deadline = Date.now() + this.openTimeout;
      while (Date.now() < deadline) {
        if (isCancelled?.()) {
          return null;
        }

        const state = readViewerState(this.document, this.window);
        const viewerChanged =
          Boolean(state) &&
          (!stateBeforeOpen ||
            state.url !== stateBeforeOpen.url ||
            state.width > stateBeforeOpen.width ||
            state.height > stateBeforeOpen.height);
        if (state && viewerChanged && isPhotoViewerLocation(this.window.location.href)) {
          return state;
        }
        await delay(this.pollInterval);
      }
      return null;
    }

    /** @param {*} viewerImage @param {Function=} isCancelled @param {number=} timeout @returns {Promise<*>} */
    async waitForNextControl(
      viewerImage,
      isCancelled,
      timeout = TIMINGS.NEXT_CONTROL_TIMEOUT_MS
    ) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (isCancelled?.()) {
          return null;
        }
        const control = findNextControl(this.document, this.window, viewerImage);
        if (control) {
          return control;
        }
        await delay(this.pollInterval);
      }
      return null;
    }

    /** @param {*} current @param {Function=} isCancelled @returns {Promise<*>} */
    async advanceViewer(current, isCancelled) {
      const labelledControl = findNextControl(this.document, this.window, current.element, {
        allowGeometry: false
      });

      if (labelledControl && !isDisabledControl(labelledControl)) {
        labelledControl.click();
        const nextState = await this.waitForReadyViewerState(
          current,
          this.changeTimeout,
          isCancelled
        );
        if (nextState) {
          return nextState;
        }
      }

      for (let attempt = 0; attempt < this.keyboardRetryLimit; attempt += 1) {
        if (isCancelled?.()) {
          return null;
        }
        if (!dispatchNextKeyboardEvent(this.document, this.window)) {
          break;
        }
        const nextState = await this.waitForReadyViewerState(
          current,
          this.keyboardRetryTimeout,
          isCancelled
        );
        if (nextState) {
          return nextState;
        }
      }

      const geometryControl = findGeometryNextControl(this.document, this.window, current.element);
      if (
        geometryControl &&
        geometryControl !== labelledControl &&
        !isDisabledControl(geometryControl)
      ) {
        geometryControl.click();
        return this.waitForReadyViewerState(current, this.changeTimeout, isCancelled);
      }

      return null;
    }

    /** @param {*} previous @param {number} timeout @param {Function=} isCancelled @returns {Promise<*>} */
    async waitForReadyViewerState(previous, timeout, isCancelled) {
      const deadline = Date.now() + timeout;
      let candidate = null;
      let stableChecks = 0;

      while (Date.now() < deadline) {
        if (isCancelled?.()) {
          return null;
        }

        const state = readViewerState(this.document, this.window, previous);
        const changed =
          state &&
          (!previous ||
            (state.sourceIdentity !== previous.sourceIdentity &&
              (!previous.photoId || !state.photoId || state.photoId !== previous.photoId)));

        if (changed && state.element.complete && state.element.naturalWidth > 0) {
          if (
            candidate &&
            candidate.sourceIdentity === state.sourceIdentity &&
            candidate.photoId === state.photoId
          ) {
            stableChecks += 1;
          } else {
            candidate = state;
            stableChecks = 1;
          }

          if (stableChecks >= 2) {
            if (typeof state.element.decode === "function") {
              await Promise.race([
                state.element.decode().catch(() => undefined),
                delay(TIMINGS.IMAGE_DECODE_TIMEOUT_MS)
              ]);
            }
            const confirmed = readViewerState(this.document, this.window, previous);
            if (
              confirmed &&
              confirmed.sourceIdentity === state.sourceIdentity &&
              confirmed.photoId === state.photoId
            ) {
              return confirmed;
            }
          }
        } else {
          candidate = null;
          stableChecks = 0;
        }

        await delay(this.pollInterval);
      }

      return null;
    }
  }

  /** @param {*} doc @param {*} win @param {*=} previous @returns {*|null} */
  function readViewerState(doc, win, previous = null) {
    const element = findBestViewerImage(doc, win, previous?.sourceIdentity);
    if (!element) {
      return null;
    }

    const url = getBestImageUrl(element);
    if (!url || !isAllowedMediaUrl(url)) {
      return null;
    }

    const photoId = extractPhotoId(win.location.href);
    const setId = extractSetId(win.location.href);
    const sourceIdentity = normalizeImageIdentity(url);
    return {
      element,
      url,
      photoId,
      setId,
      sourceIdentity,
      identity: photoId ? `fbid:${photoId}` : sourceIdentity,
      width: element.naturalWidth || 0,
      height: element.naturalHeight || 0,
      alt: String(element.alt || "").slice(0, LIMITS.MAX_ALT_TEXT_LENGTH)
    };
  }

  /** @param {*} doc @param {*} win @param {string=} _previousSourceIdentity @returns {*|null} */
  function findBestViewerImage(doc, win, _previousSourceIdentity = "") {
    const viewerScope = findActiveViewerScope(doc, win);
    const candidates = Array.from(
      (viewerScope || doc).querySelectorAll(
        SELECTORS.VIEWER.IMAGE_CANDIDATES
      )
    );
    const uniqueCandidates = Array.from(new Set(candidates));
    let best = null;
    let bestScore = -Infinity;

    for (const image of uniqueCandidates) {
      const rect = safeRect(image);
      if (
        !isVisibleElement(image, rect, win) ||
        rect.width < LIMITS.MIN_VIEWER_WIDTH ||
        rect.height < LIMITS.MIN_VIEWER_HEIGHT
      ) {
        continue;
      }

      const url = getBestImageUrl(image);
      if (!url || !isAllowedMediaUrl(url)) {
        continue;
      }

      const naturalArea = Math.max(0, image.naturalWidth * image.naturalHeight);
      const displayedArea = rect.width * rect.height;
      const centerDistance = Math.abs(rect.x + rect.width / 2 - win.innerWidth / 2);
      const isMediaImage = image.getAttribute("data-visualcompletion") === "media-vc-image";
      const score =
        displayedArea +
        Math.min(naturalArea * 0.08, 600000) +
        (isMediaImage ? 1000000 : 0) -
        centerDistance * 20;

      if (score > bestScore) {
        best = image;
        bestScore = score;
      }
    }

    return best;
  }

  /** @param {*} doc @param {*} win @param {*} viewerImage @param {Object} [options={}] @returns {*|null} */
  function findNextControl(doc, win, viewerImage, options = {}) {
    const viewerScope =
      viewerImage?.closest?.(SELECTORS.VIEWER.SCOPE_OR_DIALOG) ||
      findActiveViewerScope(doc, win) ||
      doc;
    const labelledCandidates = Array.from(viewerScope.querySelectorAll(SELECTORS.CONTROLS.LABELLED))
      .map((element) => {
        const label = String(element.getAttribute("aria-label") || "").trim();
        const clickable = element.closest(SELECTORS.CONTROLS.CLICKABLE) || element;
        return { element: clickable, label };
      })
      .filter(({ element, label }) => {
        const rect = safeRect(element);
        return (
          NEXT_LABEL_PATTERN.test(label) &&
          !PREVIOUS_LABEL_PATTERN.test(label) &&
          isVisibleElement(element, rect, win)
        );
      });

    if (labelledCandidates.length > 0) {
      labelledCandidates.sort((a, b) => {
        const aRect = safeRect(a.element);
        const bRect = safeRect(b.element);
        return bRect.width * bRect.height - aRect.width * aRect.height;
      });
      return labelledCandidates[0].element;
    }

    if (options.allowGeometry === false) {
      return null;
    }

    return findGeometryNextControl(doc, win, viewerImage, viewerScope);
  }

  /** @param {*} doc @param {*} win @param {*} viewerImage @param {*=} knownViewerScope @returns {*|null} */
  function findGeometryNextControl(doc, win, viewerImage, knownViewerScope = null) {
    const viewerScope =
      knownViewerScope ||
      viewerImage?.closest?.(SELECTORS.VIEWER.SCOPE_OR_DIALOG) ||
      findActiveViewerScope(doc, win) ||
      doc;

    if (!viewerImage) {
      return null;
    }

    const imageRect = safeRect(viewerImage);
    const imageCenterY = imageRect.y + imageRect.height / 2;
    let best = null;
    let bestScore = -Infinity;

    for (const control of viewerScope.querySelectorAll(SELECTORS.CONTROLS.CLICKABLE)) {
      const rect = safeRect(control);
      const label = String(control.getAttribute("aria-label") || "");
      if (
        !isVisibleElement(control, rect, win) ||
        isDisabledControl(control) ||
        DISALLOWED_GEOMETRY_LABEL_PATTERN.test(label) ||
        rect.x + rect.width / 2 <= imageRect.x + imageRect.width / 2 ||
        Math.abs(rect.y + rect.height / 2 - imageCenterY) > Math.max(260, imageRect.height * 0.45)
      ) {
        continue;
      }

      const distanceFromRightEdge = Math.abs(rect.x - imageRect.right);
      const verticalDistance = Math.abs(rect.y + rect.height / 2 - imageCenterY);
      const score = 10000 - distanceFromRightEdge * 12 - verticalDistance * 4;
      if (score > bestScore) {
        best = control;
        bestScore = score;
      }
    }

    return best;
  }

  /** @param {*} doc @param {*} win @returns {boolean} */
  function dispatchNextKeyboardEvent(doc, win) {
    const KeyboardEventCtor = win?.KeyboardEvent || globalScope.KeyboardEvent;
    if (typeof doc?.dispatchEvent !== "function" || typeof KeyboardEventCtor !== "function") {
      return false;
    }

    doc.dispatchEvent(
      new KeyboardEventCtor("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        keyCode: 39,
        which: 39,
        bubbles: true
      })
    );
    return true;
  }

  /** @param {*} doc @param {*} win @returns {*|null} */
  function findActiveViewerScope(doc, win) {
    let best = null;
    let bestScore = -Infinity;

    for (const scope of doc.querySelectorAll(SELECTORS.VIEWER.SCOPE)) {
      const scopeRect = safeRect(scope);
      if (!isVisibleElement(scope, scopeRect, win)) {
        continue;
      }

      const mediaImages = Array.from(
        scope.querySelectorAll(SELECTORS.VIEWER.MEDIA_IMAGE)
      ).filter((image) => {
        const rect = safeRect(image);
        return (
          isVisibleElement(image, rect, win) &&
          rect.width >= LIMITS.MIN_VIEWER_WIDTH &&
          rect.height >= LIMITS.MIN_VIEWER_HEIGHT
        );
      });
      if (mediaImages.length === 0) {
        continue;
      }

      const largestMediaArea = Math.max(
        ...mediaImages.map((image) => {
          const rect = safeRect(image);
          return rect.width * rect.height;
        })
      );
      const hasCarouselControl = Array.from(scope.querySelectorAll(SELECTORS.CONTROLS.LABELLED)).some((element) => {
        const label = String(element.getAttribute("aria-label") || "");
        return NEXT_LABEL_PATTERN.test(label) || PREVIOUS_LABEL_PATTERN.test(label);
      });
      const score =
        largestMediaArea +
        (hasCarouselControl ? 5000000 : 0) -
        scopeRect.width * scopeRect.height * 0.001;

      if (score > bestScore) {
        best = scope;
        bestScore = score;
      }
    }

    return best;
  }

  /** @param {*} [doc=globalScope.document] @param {*} [win=globalScope.window] @returns {*|null} */
  function findActivePostContainer(doc = globalScope.document, win = globalScope.window) {
    return (
      Array.from(doc.querySelectorAll(SELECTORS.MODAL.DIALOG))
        .filter(
          (dialog) =>
            isVisibleElement(dialog, safeRect(dialog), win) && hasPostMedia(dialog)
        )
        .sort((a, b) => {
          const aRect = safeRect(a);
          const bRect = safeRect(b);
          return aRect.width * aRect.height - bRect.width * bRect.height;
        })[0] || null
    );
  }

  /** @param {*} target @returns {*|null} */
  function findPostContainerFromTarget(target) {
    if (!(target instanceof globalScope.Element)) {
      return null;
    }

    for (let current = target; current; current = current.parentElement) {
      if (
        (current.getAttribute("role") === "article" || current.getAttribute("role") === "dialog") &&
        hasPostMedia(current)
      ) {
        return current;
      }
    }
    return null;
  }

  function hasPostMedia(container) {
    if (getPostPhotoLinks(container).length > 0 || getPostVideoRefs(container).length > 0) {
      return true;
    }
    return Array.from(container.querySelectorAll(SELECTORS.MEDIA.IMAGE)).some((image) => {
      const rect = safeRect(image);
      return (
        rect.width >= LIMITS.MIN_POST_MEDIA_WIDTH &&
        rect.height >= LIMITS.MIN_POST_MEDIA_HEIGHT &&
        isAllowedMediaUrl(image.currentSrc || image.src)
      );
    });
  }

  /** @param {*} container @returns {Array<Object>} */
  function getPostVideoRefs(container) {
    if (!container?.querySelectorAll) {
      return [];
    }

    const results = [];
    const seen = new Set();
    const push = (item) => {
      const key = item.videoId || item.url || item.permalink || item.element;
      if (!key || seen.has(key)) return;
      seen.add(key);
      results.push(item);
    };

    for (const video of container.querySelectorAll(SELECTORS.MEDIA.VIDEO)) {
      if (isInExcludedPostSubtree(video, container)) continue;
      const directUrl = [video.currentSrc, video.src]
        .find((url) => isAllowedVideoUrl(url)) || "";
      push({
        element: video,
        url: directUrl,
        videoId: extractVideoId(locationHrefForElement(video)),
        permalink: ""
      });
    }

    for (const link of container.querySelectorAll(SELECTORS.POST.VIDEO_LINKS)) {
      if (isInExcludedPostSubtree(link, container)) continue;
      const href = link.href || link.getAttribute("href") || "";
      push({
        element: link,
        url: "",
        videoId: extractVideoId(href),
        permalink: href
      });
    }

    const concrete = results.filter((video) => video.videoId || video.url || video.permalink);
    return concrete.length > 0 ? concrete : results.slice(0, 1);
  }

  /** @param {*} postContainer @returns {Array<Object>} */
  function collectCommentMedia(postContainer) {
    if (!postContainer?.querySelectorAll) {
      return [];
    }

    const candidates = new Set();
    for (const article of postContainer.querySelectorAll(SELECTORS.COMMENT.ARTICLE)) {
      if (article !== postContainer) candidates.add(article);
    }
    for (const labelled of postContainer.querySelectorAll(SELECTORS.CONTROLS.LABELLED)) {
      const label = String(labelled.getAttribute?.("aria-label") || "");
      if (/(?:bình\s*luận|binh\s*luan|comments?)/i.test(label)) candidates.add(labelled);
    }

    const results = [];
    for (const comment of candidates) {
      const media = [];
      let mediaIndex = 0;

      for (const image of comment.querySelectorAll?.(SELECTORS.MEDIA.IMAGE) || []) {
        const url = getBestImageUrl(image);
        const rect = safeRect(image);
        if (
          !url ||
          rect.width < LIMITS.MIN_COMMENT_MEDIA_SIZE ||
          rect.height < LIMITS.MIN_COMMENT_MEDIA_SIZE ||
          /(?:\/stickers?\/|sticker_|emoji|emote)/i.test(url)
        ) {
          continue;
        }
        mediaIndex += 1;
        media.push({
          type: "image",
          url,
          index: mediaIndex,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0
        });
      }

      for (const video of getPostVideoRefs(comment)) {
        if (!video.url || !isAllowedVideoUrl(video.url)) continue;
        mediaIndex += 1;
        media.push({
          type: "video",
          url: video.url,
          index: mediaIndex,
          videoId: video.videoId || null
        });
      }

      if (media.length === 0) continue;
      results.push({
        author: getCommentAuthor(comment),
        commentId: extractCommentId(comment),
        media
      });
    }

    return results;
  }

  /** @param {*} comment @returns {string} */
  function getCommentAuthor(comment) {
    const authorNode = comment?.querySelector?.(SELECTORS.COMMENT.AUTHOR);
    return cleanCaptionText(authorNode?.textContent || "Facebook User")
      .slice(0, LIMITS.MAX_FILE_PART_LENGTH) || "Facebook User";
  }

  /** @param {*} comment @returns {string} */
  function extractCommentId(comment) {
    for (const anchor of comment?.querySelectorAll?.(SELECTORS.COMMENT.LINK) || []) {
      const href = anchor.href || anchor.getAttribute?.("href") || "";
      try {
        const parsed = new URL(href, "https://www.facebook.com/");
        const id =
          parsed.searchParams.get("comment_id") ||
          parsed.searchParams.get("reply_comment_id") ||
          parsed.pathname.match(/\/comments\/(\d+)/i)?.[1];
        if (id) return id;
      } catch {
        // Ignore malformed comment links.
      }
    }
    return String(comment?.getAttribute?.("data-commentid") || "unknown")
      .slice(0, LIMITS.MAX_FILE_PART_LENGTH) || "unknown";
  }

  function locationHrefForElement(element) {
    return element?.ownerDocument?.defaultView?.location?.href || globalScope.location?.href || "";
  }

  /** @param {*} url @returns {string|null} */
  function extractVideoId(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      return (
        parsed.searchParams.get("v") ||
        parsed.searchParams.get("video_id") ||
        parsed.pathname.match(/\/(?:reel|videos)\/(\d+)/i)?.[1] ||
        null
      );
    } catch {
      return null;
    }
  }

  /** @param {*} url @returns {boolean} */
  function isAllowedVideoUrl(url) {
    if (typeof url !== "string" || !url || url.startsWith("blob:")) {
      return false;
    }
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !MEDIA_URL_HOSTS.some(
          (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        )
      ) {
        return false;
      }
      const decoded = decodeURIComponent(`${parsed.pathname}?${parsed.searchParams.toString()}`).toLowerCase();
      return /\.mp4(?:$|[?&#])/.test(parsed.pathname.toLowerCase()) || /video(?:\/|%2f)?mp4|video_mp4|mime(?:_type)?=video/.test(decoded);
    } catch {
      return false;
    }
  }

  /** @param {*} container @returns {Array<*>} */
  function getPostPhotoLinks(container) {
    if (!container?.querySelectorAll) {
      return [];
    }

    const seen = new Set();
    const fallbackLinks = [];
    const postSetGroups = new Map();
    for (const link of container.querySelectorAll(SELECTORS.POST.PHOTO_LINKS)) {
      if (isInExcludedPostSubtree(link, container)) {
        continue;
      }
      const href = link.href || link.getAttribute("href") || "";
      const photoId = extractPhotoId(href);
      if (!photoId || seen.has(photoId)) {
        continue;
      }
      seen.add(photoId);
      fallbackLinks.push(link);

      try {
        const set = new URL(href, "https://www.facebook.com/").searchParams.get("set") || "";
        if (/^pcb\.\d+$/i.test(set)) {
          const group = postSetGroups.get(set) || [];
          group.push(link);
          postSetGroups.set(set, group);
        }
      } catch {
        // Keep the link in the fallback group.
      }
    }

    if (postSetGroups.size === 0) {
      return fallbackLinks;
    }

    const groups = Array.from(postSetGroups.values());
    return groups.find((group) => group.some((link) => extractOverlayCount(link))) || groups[0];
  }

  /** @param {*} element @param {*} container @returns {boolean} */
  function isInExcludedPostSubtree(element, container) {
    for (let current = element?.parentElement; current && current !== container; current = current.parentElement) {
      const role = String(current.getAttribute?.("role") || "").toLowerCase();
      const ariaLabel = String(current.getAttribute?.("aria-label") || "");
      const tagName = String(current.tagName || "").toLowerCase();

      if (
        role === "article" ||
        tagName === "form" ||
        /(?:bình\s*luận|binh\s*luan|comments?)/i.test(ariaLabel)
      ) {
        return true;
      }
    }
    return false;
  }

  /** @param {*} container @returns {{expected:number|null, renderedLinks:number, additional:number, overlayIndex:number|null}} */
  function estimateExpectedCount(container) {
    const links = getPostPhotoLinks(container);
    for (let index = 0; index < links.length; index += 1) {
      const additional = extractOverlayCount(links[index]);
      if (additional) {
        return {
          expected: index + additional,
          renderedLinks: links.length,
          additional,
          overlayIndex: index
        };
      }
    }

    return {
      expected: links.length || null,
      renderedLinks: links.length,
      additional: 0,
      overlayIndex: null
    };
  }

  /** @param {*} link @returns {number|null} */
  function extractOverlayCount(link) {
    const text = String(link.textContent || "").replace(/\s+/g, " ").trim();
    const directMatch = text.match(/^\+\s*(\d{1,3})$/);
    if (directMatch) {
      return toPositiveInteger(directMatch[1]);
    }

    const label = String(link.getAttribute("aria-label") || "");
    const labelledMatch = label.match(/(?:còn|thêm|more)\s*\+?\s*(\d{1,3})\s*(?:mục|items?|photos?|ảnh)?/i);
    return labelledMatch ? toPositiveInteger(labelledMatch[1]) : null;
  }

  /** @param {*} container @returns {string} */
  function getPostSummary(container) {
    const label = String(container?.getAttribute?.("aria-label") || "").trim();
    const labelledAuthor = label.match(/bài\s+viết\s+của\s+(.+)/i)?.[1];
    if (labelledAuthor) {
      return `Bài viết của ${labelledAuthor.slice(0, LIMITS.MAX_FILE_PART_LENGTH)}`;
    }

    const authorLink = container?.querySelector?.(SELECTORS.POST.AUTHOR);
    const author = String(authorLink?.textContent || "").replace(/\s+/g, " ").trim();
    return author
      ? `Bài viết của ${author.slice(0, LIMITS.MAX_FILE_PART_LENGTH)}`
      : "Bài viết Facebook đã chọn";
  }

  /** @param {*} url @returns {string|null} */
  function extractPostId(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      const set = parsed.searchParams.get("set") || "";
      const pcbId = set.match(/(?:^|\.)pcb\.(\d+)/i)?.[1];
      return (
        pcbId ||
        parsed.searchParams.get("story_fbid") ||
        parsed.searchParams.get("post_id") ||
        parsed.pathname.match(/\/(?:posts|permalink)\/(\d+)/i)?.[1] ||
        null
      );
    } catch {
      return null;
    }
  }

  /** @param {*} value @returns {string} */
  function cleanCaptionText(value) {
    return String(value || "")
      .replace(/(?:Xem thêm|See more)/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.MAX_CAPTION_LENGTH);
  }

  /** @param {*} container @param {string=} pageUrl @returns {Object} */
  function extractPostMetadata(container, pageUrl = globalScope.location?.href || "") {
    const photoLinks = getPostPhotoLinks(container);
    const firstPhotoUrl = photoLinks[0]?.href || photoLinks[0]?.getAttribute?.("href") || "";
    const videoRefs = getPostVideoRefs(container);
    const firstVideoUrl = videoRefs.find((video) => video.permalink)?.permalink || "";
    const summary = getPostSummary(container);
    const author = summary.replace(/^Bài viết của\s+/i, "").trim() || "Facebook";
    const safeAnchors = Array.from(container?.querySelectorAll?.(SELECTORS.POST.ANY_LINK) || []).filter(
      (anchor) => !isInExcludedPostSubtree(anchor, container)
    );
    const permalinkAnchor = safeAnchors.find((anchor) => {
      const href = anchor.href || anchor.getAttribute?.("href") || "";
      return /(?:\/posts\/|\/permalink\/|story_fbid=|set=pcb\.)/i.test(href);
    });
    const permalink = permalinkAnchor?.href || firstPhotoUrl || firstVideoUrl || pageUrl || "";
    const postId =
      extractPostId(permalink) ||
      extractPostId(firstPhotoUrl) ||
      videoRefs.find((video) => video.videoId)?.videoId ||
      extractAlbumId(firstPhotoUrl) ||
      extractPostId(pageUrl) ||
      "unknown";
    const timestampNode = Array.from(
      container?.querySelectorAll?.(SELECTORS.POST.TIMESTAMP) || []
    ).find((node) => !isInExcludedPostSubtree(node, container));
    const timestamp =
      timestampNode?.getAttribute?.("datetime") ||
      timestampNode?.getAttribute?.("data-utime") ||
      permalinkAnchor?.getAttribute?.("aria-label") ||
      "";

    let caption = "";
    for (const selector of SELECTORS.CAPTION) {
      const candidates = Array.from(container?.querySelectorAll?.(selector) || [])
        .filter((node) => !isInExcludedPostSubtree(node, container))
        .map((node) => cleanCaptionText(node.textContent || ""))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      if (candidates.length > 0) {
        caption = candidates[0];
        break;
      }
    }

    return { postId, author, timestamp, permalink, caption };
  }

  /** @param {*} image @returns {string} */
  function getBestImageUrl(image) {
    const candidates = [];
    if (image.currentSrc) {
      candidates.push({ url: image.currentSrc, score: Number(image.naturalWidth) || 1000 });
    }
    if (image.src) {
      candidates.push({ url: image.src, score: 1 });
    }

    const srcset = String(image.getAttribute?.("srcset") || "");
    for (const part of srcset.split(",")) {
      const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/);
      if (!match) {
        continue;
      }
      const descriptor = Number(match[2] || 1);
      const score = match[3] === "x" ? descriptor * 100000 : descriptor;
      candidates.push({ url: match[1], score });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.find(({ url }) => isAllowedMediaUrl(url))?.url || "";
  }

  /** @param {*} url @returns {string} */
  function normalizeImageIdentity(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
    } catch {
      return String(url || "").split("?")[0];
    }
  }

  /** @param {*} url @returns {string|null} */
  function extractPhotoId(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      return parsed.searchParams.get("fbid") || parsed.searchParams.get("photo_id") || null;
    } catch {
      return null;
    }
  }

  /** @param {*} url @returns {string|null} */
  function extractAlbumId(url) {
    try {
      const parsed = new URL(url, "https://www.facebook.com/");
      const set = parsed.searchParams.get("set") || "";
      const postSet = set.match(/(?:^|\.)pcb\.(\d+)/i)?.[1];
      return postSet || extractPhotoId(parsed.href);
    } catch {
      return null;
    }
  }

  /** @param {*} url @returns {string|null} */
  function extractSetId(url) {
    try {
      return new URL(url, "https://www.facebook.com/").searchParams.get("set") || null;
    } catch {
      return null;
    }
  }

  /** @param {*} url @returns {boolean} */
  function isPhotoViewerLocation(url) {
    try {
      const parsed = new URL(url);
      return /\/(?:photo|photo\.php)\/?$/i.test(parsed.pathname) && Boolean(extractPhotoId(parsed.href));
    } catch {
      return false;
    }
  }

  /** @param {*} url @returns {boolean} */
  function isAllowedMediaUrl(url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        MEDIA_URL_HOSTS.some(
          (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        )
      );
    } catch {
      return false;
    }
  }

  function isDisabledControl(element) {
    return (
      element.hasAttribute?.("disabled") ||
      element.getAttribute?.("aria-disabled") === "true" ||
      element.getAttribute?.("data-disabled") === "true"
    );
  }

  function isVisibleElement(element, rect, win) {
    if (!element || !rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = win.getComputedStyle?.(element);
    return !style || (style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05);
  }

  function safeRect(element) {
    try {
      return element.getBoundingClientRect();
    } catch {
      return { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
    }
  }

  function toPositiveInteger(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function toResultImage(state, index) {
    return {
      index,
      url: state.url,
      photoId: state.photoId,
      width: state.width,
      height: state.height,
      alt: state.alt
    };
  }

  /** @param {string} reason @param {number} foundCount @param {number|null} expectedCount @returns {boolean} */
  function isCollectionComplete(reason, foundCount, expectedCount) {
    if (reason === "expected") {
      return Boolean(expectedCount) && foundCount >= expectedCount;
    }
    if (reason === "cycle") {
      return foundCount > 0;
    }
    if (reason === "end") {
      return foundCount > 0;
    }
    return false;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  const api = {
    CarouselCollector,
    cleanCaptionText,
    collectCommentMedia,
    dispatchNextKeyboardEvent,
    estimateExpectedCount,
    extractAlbumId,
    extractCommentId,
    extractPostId,
    extractVideoId,
    extractPostMetadata,
    extractOverlayCount,
    extractPhotoId,
    extractSetId,
    findActivePostContainer,
    findBestViewerImage,
    findActiveViewerScope,
    findGeometryNextControl,
    findNextControl,
    findPostContainerFromTarget,
    getBestImageUrl,
    getCommentAuthor,
    getPostPhotoLinks,
    getPostVideoRefs,
    getPostSummary,
    isAllowedMediaUrl,
    isAllowedVideoUrl,
    isCollectionComplete,
    isInExcludedPostSubtree,
    isPhotoViewerLocation,
    normalizeImageIdentity,
    readViewerState
  };

  globalScope.FacebookAlbumCollector = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
