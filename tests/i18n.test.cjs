"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const I18n = require("../src/i18n.js");

test("i18n translates parameters in Vietnamese and English", () => {
  I18n.setPreference("vi", "en-US");
  assert.equal(I18n.t("quick_download_zip", { count: 12 }), "⚡ Tải nhanh 12 ảnh (ZIP)");

  I18n.setPreference("en", "vi-VN");
  assert.equal(
    I18n.t("quick_download_mixed", { photos: 3, videos: 2 }),
    "⚡ Download 3 photos + 2 Videos"
  );
});

test("i18n falls back safely when a key is missing", () => {
  I18n.setPreference("vi", "vi-VN");
  assert.equal(I18n.t("missing_translation_key"), "missing_translation_key");
});

test("i18n auto language detects Vietnamese locales and defaults other locales to English", () => {
  assert.equal(I18n.detectLanguage("vi-VN"), "vi");
  assert.equal(I18n.detectLanguage("vi"), "vi");
  assert.equal(I18n.detectLanguage("en-US"), "en");
  assert.equal(I18n.detectLanguage("fr-FR"), "en");
  assert.equal(I18n.resolveLanguage("auto", "vi-VN"), "vi");
  assert.equal(I18n.resolveLanguage("auto", "ja-JP"), "en");
});

test("i18n normalizes unsupported preferences back to auto", () => {
  assert.equal(I18n.normalizeLanguagePreference("VI"), "vi");
  assert.equal(I18n.normalizeLanguagePreference("de"), "auto");
});
