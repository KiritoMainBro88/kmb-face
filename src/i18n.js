(function initializeI18n(/** @type {any} */ globalScope) {
  "use strict";

  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const STORAGE_KEYS = Constants?.STORAGE_KEYS || { LANGUAGE: "fbis_language" };
  const DEFAULT_LANGUAGE = "auto";
  const SUPPORTED_LANGUAGES = new Set(["auto", "vi", "en"]);
  const DICTIONARIES = Object.freeze({
    vi: Object.freeze({
      quick_download_zip: "⚡ Tải nhanh {count} ảnh (ZIP)",
      quick_download_video: "⚡ Tải Video HD (MP4)",
      quick_download_mixed: "⚡ Tải {photos} ảnh + {videos} Video",
      quick_download_manager: "⚡ IDM Direct {count} media",
      download_story: "⚡ Tải Story (HD)",
      harvest_comments: "💬 Quét Media Bình luận (ZIP)",
      copy_hd_links: "📋 Copy link HD",
      direct_idm_fdm: "🚀 Tải qua IDM / FDM",
      download_zip: "Tải ZIP",
      status_scanning: "Đang quét...",
      status_zipping: "Đang nén ZIP...",
      toast_copied: "Đã sao chép link HD vào Clipboard!",
      toast_like_confirm: "Bấm lần nữa để xác nhận Thích",
      toast_story_paused: "Đang tạm dừng Story để tải...",
      popup_title: "Cài đặt kmb-face",
      popup_subtitle: "Phiên bản {version}",
      setting_clean_feed: "Clean Feed (Ẩn bài Tài trợ & Gợi ý)",
      setting_like_confirm: "Xác nhận trước khi Like",
      setting_verified_badge: "Tích xanh trang trí (Client-side)",
      setting_include_info: "Lưu kèm post_info.txt",
      setting_default_mode: "Chế độ tải mặc định",
      setting_naming_template: "Mẫu tên file tải về",
      setting_language: "Ngôn ngữ",
      language_auto: "Tự động / Auto",
      language_vi: "Tiếng Việt",
      language_en: "English",
      btn_copy_logs: "📋 Copy Logs",
      btn_report_issue: "🐛 Báo lỗi (GitHub)",
      banner_update: "🎉 Đã có bản mới ({version}) [Tải ngay]",
      banner_update_label: "🎉 Đã có bản mới ({version})",
      btn_update: "Tải ngay",
      saved: "Đã lưu",
      copied_logs: "Đã copy log",
      copy_logs_failed: "Không copy được log",
      opened_github: "Đã mở GitHub",
      open_github_failed: "Không mở được GitHub",
      panel_subtitle: "Tải trọn bộ ảnh trong một bài viết",
      close_panel: "Đóng bảng tải ảnh",
      choose_post: "Chọn bài viết",
      choose_post_hint: "Có thể chọn bài trên feed hoặc dùng bài/modal đang mở.",
      no_post_selected: "Chưa chọn bài viết",
      no_post_selected_hint: "Mở bài có nhiều ảnh rồi chọn bên dưới.",
      choose_post_on_page: "Chọn bài trên trang",
      use_open_post: "Dùng bài đang mở",
      use_open_album: "Dùng album đang mở",
      scan_and_download: "Quét và tải ảnh",
      scan_hint: "Facebook sẽ tự chuyển lần lượt qua carousel.",
      download_all: "Tải tất cả",
      choose_photos: "Chọn ảnh",
      scanning_photos: "Đang quét ảnh…",
      keep_tab_open: "Giữ tab này mở trong lúc quét.",
      stop_scan: "Dừng quét",
      found_photos: "Ảnh đã tìm thấy",
      selected_photos: "Đã chọn {count}/{total} ảnh",
      select_all: "Tất cả",
      select_none: "Bỏ chọn",
      download_selected: "Tải ảnh đã chọn",
      download_selected_count: "Tải {count} ảnh đã chọn",
      no_photo_selected: "Chưa chọn ảnh",
      privacy_note: "Ảnh chỉ được xử lý trong trình duyệt của bạn.",
      picker_prompt: "Nhấp vào bài viết cần tải ảnh · Hủy",
      download_mode: "Chọn chế độ tải",
      no_comment_media: "Không tìm thấy media trong bình luận đã tải trên trang.",
      harvesting_comments: "Đang gom {count} media bình luận...",
      harvested_comments: "Đã gom {count} media bình luận",
      no_hd_video: "Không tìm thấy URL Video HD.",
      sending_hd_video: "Đang gửi Video HD sang Chrome...",
      started_hd_video: "Đã bắt đầu tải Video HD",
      sent_videos: "Đã gửi {count} video",
      sending_manager: "Đang gửi {count} link sang IDM / FDM...",
      sent_links: "Đã gửi {count} link",
      copied_links: "Đã copy {count} link HD",
      zipping_progress: "Đang nén ZIP ({done}/{total})...",
      processed_mixed: "Đã xử lý {photos} ảnh + {videos} video",
      downloaded_zip: "Đã tải ZIP {count} ảnh",
      quick_download_failed: "Tải nhanh thất bại",
      manager_image_failed: "Chrome không gửi được link ảnh sang trình quản lý tải.",
      video_download_failed: "Chrome không bắt đầu được video download.",
      no_links_to_copy: "Không có link HD để copy.",
      clipboard_rejected: "Trình duyệt từ chối copy link.",
      resolving_links: "Đang kéo link...",
      no_direct_hd_video: "Không tìm thấy URL Video HD trực tiếp.",
      quick_scanning_carousel: "Đang quét nhanh carousel...",
      quick_scanning_photos: "Đang quét nhanh {found}{total} ảnh...",
      no_media_to_download: "Không tìm thấy media để tải.",
      stopping_after_current: "Đang dừng sau ảnh hiện tại…",
      stop_requested: "Đã yêu cầu dừng",
      approximate_photos: "Facebook hiển thị khoảng {count} ảnh trong bài.",
      detected_photo_post: "Đã phát hiện bài viết có ảnh.",
      open_photo_album: "Album ảnh đang mở",
      open_album_hint: "Bắt đầu từ ảnh hiện tại và quét đến khi carousel lặp lại.",
      post_changed: "Bài viết đã thay đổi trên trang. Hãy chọn lại bài viết.",
      choose_post_or_viewer: "Hãy chọn một bài viết hoặc mở trình xem ảnh trước.",
      scanning_instruction: "Facebook sẽ tự chuyển qua từng ảnh. Đừng đóng tab.",
      fetching_large_photos: "Đang lấy ảnh chất lượng lớn từ trình xem Facebook…",
      scan_stopped: "Đã dừng quét",
      scan_stopped_detail: "Đã dừng. Giữ lại {count} ảnh đã tìm thấy.",
      scan_incomplete: "Quét chưa hoàn tất",
      scan_incomplete_detail: "Quét chưa chắc đã đủ. Đã tìm thấy {found}{expected} ảnh; bạn có thể tải phần này hoặc quét lại.",
      incomplete: "Chưa hoàn tất",
      scan_complete: "Quét hoàn tất",
      scan_complete_detail: "Đã tìm thấy {count} ảnh không trùng.",
      scan_failed: "Không thể quét ảnh trong bài viết.",
      select_photo: "Chọn ảnh {index}",
      photo_alt: "Ảnh {index}",
      facebook_photo: "Ảnh Facebook",
      creating_zip: "Đang tạo ZIP…",
      packaging_browser: "Đang tải ảnh và đóng gói hoàn toàn trong trình duyệt.",
      packaging_zip: "Đang kéo ảnh và đóng gói ZIP…",
      zip_started: "Đã bắt đầu tải ZIP",
      packaged_with_info: "Đã đóng gói {count} ảnh cùng post_info.txt.",
      packaged_photos: "Đã đóng gói {count} ảnh.",
      image_count: "{count} ảnh",
      zip_download_failed: "Không thể bắt đầu tải ảnh.",
      chrome_zip_failed: "Chrome không bắt đầu được ZIP download.",
      background_media_incomplete: "Background không tải đủ dữ liệu ảnh.",
      background_video_check_failed: "Background không kiểm tra được video.",
      background_video_missing_data: "Background không trả dữ liệu video.",
      retry_needed: "Cần thử lại",
      error: "Lỗi",
      download_progress: "Đã bắt đầu {started} lượt tải{failed}.",
      download_failures: "; {count} lỗi",
      story_loading: "Đang lấy Story HD…",
      story_not_found: "Không tìm thấy media Story HD.",
      story_video_failed: "Không bắt đầu được tải Story video.",
      story_image_failed: "Không bắt đầu được tải Story ảnh.",
      story_sent: "✓ Đã gửi Story HD",
      story_failed: "Tải Story thất bại"
    }),
    en: Object.freeze({
      quick_download_zip: "⚡ Quick Download {count} photos (ZIP)",
      quick_download_video: "⚡ Download HD Video (MP4)",
      quick_download_mixed: "⚡ Download {photos} photos + {videos} Videos",
      quick_download_manager: "⚡ IDM Direct {count} media",
      download_story: "⚡ Download Story (HD)",
      harvest_comments: "💬 Harvest Comments Media (ZIP)",
      copy_hd_links: "📋 Copy HD Links",
      direct_idm_fdm: "🚀 Download via IDM / FDM",
      download_zip: "Download ZIP",
      status_scanning: "Scanning...",
      status_zipping: "Compressing ZIP...",
      toast_copied: "HD links copied to clipboard!",
      toast_like_confirm: "Click again to confirm Like",
      toast_story_paused: "Pausing Story to download...",
      popup_title: "kmb-face Settings",
      popup_subtitle: "Version {version}",
      setting_clean_feed: "Clean Feed (Hide Sponsored & Suggested)",
      setting_like_confirm: "Confirm before Like",
      setting_verified_badge: "Cosmetic Verified Badge",
      setting_include_info: "Include post_info.txt",
      setting_default_mode: "Default download mode",
      setting_naming_template: "Custom filename template",
      setting_language: "Language",
      language_auto: "Auto",
      language_vi: "Tiếng Việt",
      language_en: "English",
      btn_copy_logs: "📋 Copy Logs",
      btn_report_issue: "🐛 Report Issue (GitHub)",
      banner_update: "🎉 New version available ({version}) [Update]",
      banner_update_label: "🎉 New version available ({version})",
      btn_update: "Update",
      saved: "Saved",
      copied_logs: "Logs copied",
      copy_logs_failed: "Could not copy logs",
      opened_github: "Opened GitHub",
      open_github_failed: "Could not open GitHub",
      panel_subtitle: "Download all photos from a Facebook post",
      close_panel: "Close image downloader",
      choose_post: "Choose a post",
      choose_post_hint: "Pick a post from the feed or use the currently open post/modal.",
      no_post_selected: "No post selected",
      no_post_selected_hint: "Open a post with photos, then choose it below.",
      choose_post_on_page: "Choose post on page",
      use_open_post: "Use open post",
      use_open_album: "Use open album",
      scan_and_download: "Scan and download photos",
      scan_hint: "Facebook will move through the carousel automatically.",
      download_all: "Download all",
      choose_photos: "Choose photos",
      scanning_photos: "Scanning photos…",
      keep_tab_open: "Keep this tab open while scanning.",
      stop_scan: "Stop scan",
      found_photos: "Photos found",
      selected_photos: "Selected {count}/{total} photos",
      select_all: "All",
      select_none: "None",
      download_selected: "Download selected photos",
      download_selected_count: "Download {count} selected photos",
      no_photo_selected: "No photos selected",
      privacy_note: "Photos are processed only in your browser.",
      picker_prompt: "Click the post you want to download · Cancel",
      download_mode: "Choose download mode",
      no_comment_media: "No loaded comment media was found on this page.",
      harvesting_comments: "Collecting {count} comment media...",
      harvested_comments: "Collected {count} comment media",
      no_hd_video: "No HD video URL found.",
      sending_hd_video: "Sending HD video to Chrome...",
      started_hd_video: "Started HD video download",
      sent_videos: "Sent {count} videos",
      sending_manager: "Sending {count} links to IDM / FDM...",
      sent_links: "Sent {count} links",
      copied_links: "Copied {count} HD links",
      zipping_progress: "Compressing ZIP ({done}/{total})...",
      processed_mixed: "Processed {photos} photos + {videos} videos",
      downloaded_zip: "Downloaded ZIP with {count} photos",
      quick_download_failed: "Quick download failed",
      manager_image_failed: "Chrome could not send image links to the download manager.",
      video_download_failed: "Chrome could not start the video download.",
      no_links_to_copy: "No HD links to copy.",
      clipboard_rejected: "The browser rejected the clipboard copy.",
      resolving_links: "Resolving links...",
      no_direct_hd_video: "No direct HD video URL found.",
      quick_scanning_carousel: "Quick scanning carousel...",
      quick_scanning_photos: "Quick scanning {found}{total} photos...",
      no_media_to_download: "No media found to download.",
      stopping_after_current: "Stopping after the current photo…",
      stop_requested: "Stop requested",
      approximate_photos: "Facebook shows about {count} photos in this post.",
      detected_photo_post: "Detected a post with photos.",
      open_photo_album: "Open photo album",
      open_album_hint: "Start from the current photo and scan until the carousel loops.",
      post_changed: "The post changed on the page. Please select it again.",
      choose_post_or_viewer: "Select a post or open the photo viewer first.",
      scanning_instruction: "Facebook will move through each photo automatically. Keep this tab open.",
      fetching_large_photos: "Fetching full-size photos from the Facebook viewer…",
      scan_stopped: "Scan stopped",
      scan_stopped_detail: "Stopped. Kept {count} photos found so far.",
      scan_incomplete: "Scan incomplete",
      scan_incomplete_detail: "The scan may be incomplete. Found {found}{expected} photos; you can download these or scan again.",
      incomplete: "Incomplete",
      scan_complete: "Scan complete",
      scan_complete_detail: "Found {count} unique photos.",
      scan_failed: "Could not scan photos in this post.",
      select_photo: "Select photo {index}",
      photo_alt: "Photo {index}",
      facebook_photo: "Facebook photo",
      creating_zip: "Creating ZIP…",
      packaging_browser: "Downloading and packaging photos entirely in your browser.",
      packaging_zip: "Fetching photos and packaging ZIP…",
      zip_started: "ZIP download started",
      packaged_with_info: "Packaged {count} photos with post_info.txt.",
      packaged_photos: "Packaged {count} photos.",
      image_count: "{count} photos",
      zip_download_failed: "Could not start the photo download.",
      chrome_zip_failed: "Chrome could not start the ZIP download.",
      background_media_incomplete: "Background did not return all requested image data.",
      background_video_check_failed: "Background could not inspect the video.",
      background_video_missing_data: "Background did not return video data.",
      retry_needed: "Try again",
      error: "Error",
      download_progress: "Started {started} downloads{failed}.",
      download_failures: "; {count} failed",
      story_loading: "Fetching HD Story…",
      story_not_found: "No HD Story media found.",
      story_video_failed: "Could not start the Story video download.",
      story_image_failed: "Could not start the Story image download.",
      story_sent: "✓ HD Story sent",
      story_failed: "Story download failed"
    })
  });

  /** @type {'auto'|'vi'|'en'} */
  let preference = DEFAULT_LANGUAGE;
  /** @type {'vi'|'en'} */
  let currentLanguage = detectLanguage(globalScope.navigator?.language);

  /** @param {*} value @returns {'auto'|'vi'|'en'} */
  function normalizeLanguagePreference(value) {
    const normalized = String(value || DEFAULT_LANGUAGE).toLowerCase();
    return /** @type {'auto'|'vi'|'en'} */ (
      SUPPORTED_LANGUAGES.has(normalized) ? normalized : DEFAULT_LANGUAGE
    );
  }

  /** @param {*} locale @returns {'vi'|'en'} */
  function detectLanguage(locale) {
    return /^vi(?:-|_|$)/i.test(String(locale || "")) ? "vi" : "en";
  }

  /**
   * @param {*} [value=preference]
   * @param {*} [locale=globalScope.navigator?.language]
   * @returns {'vi'|'en'}
   */
  function resolveLanguage(value = preference, locale = globalScope.navigator?.language) {
    const normalized = normalizeLanguagePreference(value);
    return normalized === "auto" ? detectLanguage(locale) : normalized;
  }

  /**
   * @param {*} value
   * @param {*} [locale=globalScope.navigator?.language]
   * @returns {'vi'|'en'}
   */
  function setPreference(value, locale = globalScope.navigator?.language) {
    preference = normalizeLanguagePreference(value);
    currentLanguage = resolveLanguage(preference, locale);
    return currentLanguage;
  }

  /**
   * @param {*} template
   * @param {Record<string, *>} [params={}]
   * @returns {string}
   */
  function interpolate(template, params = {}) {
    return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    );
  }

  /**
   * @param {string} key
   * @param {Record<string, *>} [params={}]
   * @returns {string}
   */
  function t(key, params = {}) {
    const primary = DICTIONARIES[currentLanguage] || DICTIONARIES.en;
    const template = primary[key] ?? DICTIONARIES.en[key] ?? DICTIONARIES.vi[key] ?? key;
    return interpolate(template, params);
  }

  /** @returns {Promise<'vi'|'en'>} */
  async function initialize() {
    if (!globalScope.chrome?.storage?.local) {
      setPreference(preference);
      return currentLanguage;
    }
    try {
      const stored = await globalScope.chrome.storage.local.get({
        [STORAGE_KEYS.LANGUAGE]: DEFAULT_LANGUAGE
      });
      setPreference(stored[STORAGE_KEYS.LANGUAGE]);
    } catch {
      setPreference(DEFAULT_LANGUAGE);
    }
    return currentLanguage;
  }

  /** @returns {'vi'|'en'} */
  function getLanguage() {
    return currentLanguage;
  }

  /** @returns {'auto'|'vi'|'en'} */
  function getPreference() {
    return preference;
  }

  const api = {
    DEFAULT_LANGUAGE,
    DICTIONARIES,
    detectLanguage,
    getLanguage,
    getPreference,
    initialize,
    interpolate,
    normalizeLanguagePreference,
    resolveLanguage,
    setPreference,
    t
  };

  globalScope.FBISI18n = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
