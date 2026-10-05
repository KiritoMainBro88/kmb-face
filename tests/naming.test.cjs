"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_FILENAME_TEMPLATE,
  normalizeFilenameTemplate,
  parseFilenameTemplate
} = require("../src/naming.js");

test("filename template parser expands supported variables and pads index", () => {
  const value = parseFilenameTemplate("{author}_{postId}_{index}_{date}", {
    author: "Kiri:to / Main*Bro",
    postId: "post:123/456",
    index: 7,
    date: new Date(2026, 9, 5)
  });
  assert.equal(value, "Kiri_to_Main_Bro_post_123_456_007_20261005");
});

test("filename template parser sanitizes traversal and empty templates", () => {
  assert.equal(normalizeFilenameTemplate("   "), DEFAULT_FILENAME_TEMPLATE);
  assert.equal(
    parseFilenameTemplate("../../{author}/{postId}/{index}", {
      author: "Alice",
      postId: "99",
      index: 1,
      date: new Date(2026, 9, 5)
    }),
    "Alice_99_001"
  );
});
