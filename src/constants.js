(function initializeConstants(/** @type {any} */ globalScope) {
  "use strict";

  const TIMINGS = Object.freeze({
    POLL_INTERVAL_MS: 25,
    COLLECTOR_POLL_INTERVAL_MS: 120,
    IMAGE_STABLE_TIMEOUT_MS: 800,
    OBSERVER_DEBOUNCE_MS: 150,
    LIKE_CONFIRM_WINDOW_MS: 3000,
    UPDATE_CHECK_INTERVAL_HOURS: 12,
    BRIDGE_TIMEOUT_MS: 2500,
    UI_ERROR_FEEDBACK_MS: 2500,
    STORY_BRIDGE_TIMEOUT_MS: 3000,
    UI_FEEDBACK_MS: 1800,
    FEATURE_SCAN_DEBOUNCE_MS: 180,
    FEATURE_LOCATION_POLL_MS: 750,
    DOWNLOAD_COMPLETION_TIMEOUT_MS: 300000,
    DOWNLOAD_STAGGER_MS: 80,
    VIEWER_OPEN_TIMEOUT_MS: 12000,
    VIEWER_CHANGE_TIMEOUT_MS: 6500,
    KEYBOARD_RETRY_TIMEOUT_MS: 900,
    NEXT_CONTROL_TIMEOUT_MS: 1800,
    IMAGE_DECODE_TIMEOUT_MS: 1200
  });

  const LIMITS = Object.freeze({
    MAX_SAFETY_IMAGES: 500,
    MAX_CONCURRENT_FETCH: 5,
    MAX_INLINE_VIDEO_SIZE_BYTES: 15 * 1024 * 1024,
    MAX_LOG_EVENTS: 50,
    MAX_DOWNLOADS_PER_BATCH: 500,
    MAX_VIDEOS_PER_BATCH: 50,
    MAX_URL_LENGTH: 8192,
    MAX_FILENAME_TEMPLATE_LENGTH: 180,
    MAX_FILENAME_STEM_LENGTH: 160,
    MAX_FILE_PART_LENGTH: 80,
    MAX_DIAGNOSTIC_CODE_LENGTH: 500,
    MAX_DIAGNOSTIC_MODULE_LENGTH: 48,
    MAX_CAPTION_LENGTH: 20000,
    MAX_ALT_TEXT_LENGTH: 500,
    MIN_VIEWER_WIDTH: 160,
    MIN_VIEWER_HEIGHT: 120,
    MIN_POST_MEDIA_WIDTH: 150,
    MIN_POST_MEDIA_HEIGHT: 100,
    MIN_COMMENT_MEDIA_SIZE: 100
  });

  const IPC_ACTIONS = Object.freeze({
    TOGGLE_PANEL: "FBIS_TOGGLE_PANEL",
    LOG_EVENT: "FBIS_LOG_EVENT",
    GET_DIAGNOSTIC_LOGS: "FBIS_GET_DIAGNOSTIC_LOGS",
    FETCH_SMALL_VIDEO: "FBIS_FETCH_SMALL_VIDEO",
    DOWNLOAD_VIDEOS: "FBIS_DOWNLOAD_VIDEOS",
    FETCH_MEDIA_BATCH: "FBIS_FETCH_MEDIA_BATCH",
    DOWNLOAD_ZIP: "FBIS_DOWNLOAD_ZIP",
    DOWNLOAD_IMAGES: "FBIS_DOWNLOAD_IMAGES",
    DOWNLOAD_PROGRESS: "FBIS_DOWNLOAD_PROGRESS",
    RESOLVE_STORY: "FBIS_RESOLVE_STORY",
    RESOLVE_STORY_RESULT: "FBIS_RESOLVE_STORY_RESULT",
    RESOLVE_POST: "FBIS_RESOLVE_POST",
    RESOLVE_POST_RESULT: "FBIS_RESOLVE_POST_RESULT",
    CHECK_UPDATE: "FBIS_CHECK_UPDATE",
    COPY_LOGS: "FBIS_COPY_LOGS"
  });

  const MESSAGE_SOURCES = Object.freeze({
    CONTENT: "FBIS_CONTENT",
    MAIN: "FBIS_MAIN"
  });

  const STORAGE_KEYS = Object.freeze({
    LIKE_CONFIRM: "fbis_enable_like_confirm",
    COSMETIC_BADGE: "fbis_enable_cosmetic_badge",
    INCLUDE_POST_INFO: "fbis_include_post_info",
    DEFAULT_DOWNLOAD_MODE: "fbis_default_download_mode",
    CLEAN_FEED: "fbis_clean_feed",
    FILENAME_TEMPLATE: "fbis_filename_template",
    LANGUAGE: "fbis_language",
    HAS_UPDATE: "hasUpdate",
    LATEST_VERSION: "latestVersion",
    RELEASE_URL: "releaseUrl"
  });

  const SELECTORS = Object.freeze({
    POST: Object.freeze({
      ARTICLE: 'div[role="article"]',
      QUICK_ACTION: '[data-fbis-quick-action="1"]',
      PHOTO_LINKS: 'a[href*="/photo/"], a[href*="photo.php"]',
      VIDEO_LINKS: 'a[href*="/reel/"], a[href*="/videos/"], a[href*="watch/?v="], a[href*="video.php"]',
      AUTHOR: 'h2 a, h3 a, h4 a, a[href*="/user/"]',
      TIMESTAMP: 'time[datetime], abbr[data-utime]',
      ANY_LINK: 'a[href]'
    }),
    VIEWER: Object.freeze({
      SCOPE: '[role="main"], main',
      SCOPE_OR_DIALOG: '[role="main"], main, [role="dialog"]',
      MEDIA_IMAGE: 'img[data-visualcompletion="media-vc-image"]',
      IMAGE_CANDIDATES: 'img[data-visualcompletion="media-vc-image"], [role="main"] img, img',
      STORY_CONTAINER: '[role="main"] [role="dialog"], [role="main"], main'
    }),
    MODAL: Object.freeze({
      DIALOG: '[role="dialog"]'
    }),
    COMMENT: Object.freeze({
      ARTICLE: 'div[role="article"]',
      AUTHOR: 'h3 a, h4 a, strong a, a[role="link"]',
      LINK: 'a[href]'
    }),
    CONTROLS: Object.freeze({
      LABELLED: '[aria-label]',
      CLICKABLE: 'button, [role="button"]',
      CLICKABLE_OR_LINK: 'button, [role="button"], a',
      LINK: 'a[href]'
    }),
    MEDIA: Object.freeze({
      IMAGE: "img",
      VIDEO: "video",
      IMAGE_OR_VIDEO: "video, img"
    }),
    PROFILE: Object.freeze({
      CURRENT_USER_CANDIDATES: Object.freeze([
        'nav a[aria-label][href*="/profile.php"]',
        'nav a[aria-label][href*="/me/"]',
        'header a[aria-label][href*="/profile.php"]'
      ]),
      NAV_LINKS: 'nav a[aria-label][href]',
      BADGE_NAME_CANDIDATES: 'h1,h2,h3,h4,strong,a[role="link"],span[dir="auto"]'
    }),
    CAPTION: Object.freeze([
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      'div[dir="auto"]'
    ])
  });

  const MEDIA_HOSTS = Object.freeze(["fbcdn.net", "facebook.com", "fbsbx.com"]);

  const UPDATE = Object.freeze({
    ALARM_NAME: "fbis_check_update",
    API_URL: "https://api.github.com/repos/KiritoMainBro88/kmb-face/releases/latest",
    BADGE_TEXT: "NEW",
    BADGE_COLOR: "#E41E3F"
  });

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

  const api = Object.freeze({
    IPC_ACTIONS,
    LIMITS,
    MEDIA_HOSTS,
    MESSAGE_SOURCES,
    SELECTORS,
    STORAGE_KEYS,
    TIMINGS,
    UPDATE
  });

  globalScope.FBISConstants = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
