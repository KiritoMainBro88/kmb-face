"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractStoryId,
  isCosmeticBadgeEnabled,
  isLikeConfirmationEnabled,
  isLikeLabel,
  isPauseLabel,
  isPlayLabel,
  isSponsoredOrSuggestedPost,
  isSponsoredRedirectHref,
  isStoryLocation,
  normalizeFeatureSettings,
  normalizeName
} = require("../src/features.js");

test("Story helpers recognize Facebook story routes and current story id", () => {
  assert.equal(isStoryLocation("https://www.facebook.com/stories/100/200"), true);
  assert.equal(isStoryLocation("https://www.facebook.com/reel/200"), false);
  assert.equal(extractStoryId("https://www.facebook.com/stories/user/998877"), "998877");
  assert.equal(
    extractStoryId("https://www.facebook.com/stories/user/?story_fbid=112233"),
    "112233"
  );
});

test("Like confirmation matches Like actions but not Unlike actions", () => {
  assert.equal(isLikeLabel("Thích"), true);
  assert.equal(isLikeLabel("Like this comment"), true);
  assert.equal(isLikeLabel("Bỏ thích"), false);
  assert.equal(isLikeLabel("Unlike"), false);
});

test("Like confirmation flag is enabled by default and can be disabled", () => {
  assert.equal(isLikeConfirmationEnabled({}), true);
  assert.equal(isLikeConfirmationEnabled({ fbis_enable_like_confirm: true }), true);
  assert.equal(isLikeConfirmationEnabled({ fbis_enable_like_confirm: false }), false);
});

test("feature settings normalize storage values and cosmetic badge toggle", () => {
  assert.deepEqual(normalizeFeatureSettings({}), {
    fbis_enable_like_confirm: true,
    fbis_enable_cosmetic_badge: true,
    fbis_clean_feed: true,
    fbis_language: "auto"
  });
  assert.equal(isCosmeticBadgeEnabled({ fbis_enable_cosmetic_badge: false }), false);
});

test("Clean Feed recognizes sponsored and suggested feed items", () => {
  const article = (textContent, hrefs = []) => ({
    textContent,
    querySelectorAll(selector) {
      if (selector !== "a[href]") return [];
      return hrefs.map((href) => ({ getAttribute: () => href, href }));
    }
  });

  assert.equal(isSponsoredOrSuggestedPost(article("Bài viết · Được tài trợ")), true);
  assert.equal(isSponsoredOrSuggestedPost(article("Suggested for you")), true);
  assert.equal(isSponsoredOrSuggestedPost(article("Reels và video ngắn")), true);
  assert.equal(
    isSponsoredOrSuggestedPost(article("Bài viết bình thường", ["https://www.facebook.com/ads/about/"])),
    true
  );
  assert.equal(isSponsoredOrSuggestedPost(article("Bài viết bình thường")), false);
  assert.equal(isSponsoredRedirectHref("https://www.facebook.com/photo/?fbid=1"), false);
});

test("Story pause guard recognizes Vietnamese and English playback labels", () => {
  assert.equal(isPauseLabel("Tạm dừng"), true);
  assert.equal(isPauseLabel("Pause story"), true);
  assert.equal(isPlayLabel("Phát"), true);
  assert.equal(isPlayLabel("Resume story"), true);
  assert.equal(isPauseLabel("Tiếp tục"), false);
});

test("cosmetic badge name matching normalizes whitespace", () => {
  assert.equal(normalizeName("  Hoa   Pro  "), "Hoa Pro");
});
