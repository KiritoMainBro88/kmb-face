"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SETTINGS,
  buildDiagnosticsMarkdown,
  buildIssueUrl,
  normalizeSettings
} = require("../src/popup.js");

test("popup defaults enable UX helpers and ZIP mode", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test("popup settings preserve disabled toggles and IDM Direct mode", () => {
  assert.deepEqual(
    normalizeSettings({
      fbis_enable_like_confirm: false,
      fbis_enable_cosmetic_badge: false,
      fbis_include_post_info: false,
      fbis_default_download_mode: "manager"
    }),
    {
      fbis_enable_like_confirm: false,
      fbis_enable_cosmetic_badge: false,
      fbis_include_post_info: false,
      fbis_default_download_mode: "manager"
    }
  );
});

test("popup falls back to ZIP for unknown download mode", () => {
  assert.equal(normalizeSettings({ fbis_default_download_mode: "other" }).fbis_default_download_mode, "zip");
});

test("bug reporter builds encoded GitHub issue URL", () => {
  const body = buildDiagnosticsMarkdown({
    version: "1.0.0",
    userAgent: "Test Browser",
    logs: [{ time: "2026-10-05T00:00:00.000Z", module: "test", level: "ERROR", code: "E_TEST" }]
  });
  const url = buildIssueUrl(body);
  assert.match(url, /^https:\/\/github\.com\/KiritoMainBro88\/kmb-face\/issues\/new\?/);
  assert.match(decodeURIComponent(url), /\[Bug\] Lỗi phát sinh/);
  assert.match(decodeURIComponent(url), /Extension: v1\.0\.0/);
});
