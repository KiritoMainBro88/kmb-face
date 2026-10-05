"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Logger = require("../src/logger.js");

test("diagnostic logger keeps only the newest 50 events", () => {
  Logger.clear();
  for (let index = 0; index < 60; index += 1) Logger.info("test", `EVENT_${index}`);
  const entries = Logger.getEntries();
  assert.equal(entries.length, 50);
  assert.equal(entries[0].code, "EVENT_10");
  assert.equal(entries.at(-1).code, "EVENT_59");
});

test("diagnostic logger redacts Facebook and session credentials", () => {
  const sanitized = Logger.sanitizeText(
    "fb_dtsg=secret123&c_user=998877 session_id:abc-xyz Cookie: c_user=1; xs=secret"
  );
  assert.equal(sanitized.includes("secret123"), false);
  assert.equal(sanitized.includes("998877"), false);
  assert.equal(sanitized.includes("abc-xyz"), false);
  assert.match(sanitized, /\[REDACTED\]/);
});
