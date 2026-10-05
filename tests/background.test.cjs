"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.chrome = {
  action: { onClicked: { addListener() {} } },
  runtime: { onMessage: { addListener() {} } }
};

const {
  arrayBufferToBase64,
  buildDownloadFolder,
  getTrustedImageExtension,
  isFacebookPage,
  isHostOrSubdomain,
  validateImage,
  validateVideo
} = require("../src/background.js");

test("background media transport encodes binary bytes as base64", () => {
  const buffer = Uint8Array.from([0, 1, 2, 255]).buffer;
  assert.equal(arrayBufferToBase64(buffer), "AAEC/w==");
});

test("Facebook sender validation rejects lookalike domains", () => {
  assert.equal(isFacebookPage("https://www.facebook.com/groups/123"), true);
  assert.equal(isFacebookPage("https://m.facebook.com/photo/?fbid=1"), true);
  assert.equal(isFacebookPage("https://facebook.com.evil.example/photo"), false);
  assert.equal(isFacebookPage("http://www.facebook.com/photo"), false);
});

test("download validation accepts signed Facebook CDN images", () => {
  assert.deepEqual(
    validateImage(
      { url: "https://scontent.fsgn19-1.fna.fbcdn.net/v/t39/image.jpg?oh=signed" },
      0
    ),
    {
      url: "https://scontent.fsgn19-1.fna.fbcdn.net/v/t39/image.jpg?oh=signed",
      extension: "jpg"
    }
  );
});

test("download validation rejects dangerous schemes, credentials and suffix tricks", () => {
  const blocked = [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://fbcdn.net.evil.example/payload.exe",
    "https://fbcdn.net@evil.example/payload.jpg",
    "http://scontent.example.fbcdn.net/image.jpg"
  ];

  for (const url of blocked) {
    assert.throws(() => validateImage({ url }, 0));
  }
});

test("download filenames only use trusted extensions and safe folder ids", () => {
  assert.equal(getTrustedImageExtension("/photo.jpeg"), "jpg");
  assert.equal(getTrustedImageExtension("/photo.webp"), "webp");
  assert.equal(getTrustedImageExtension("/payload.exe"), "jpg");
  assert.equal(buildDownloadFolder("../../CON:<bad>"), "Facebook Images/post-CON-bad");
  assert.equal(isHostOrSubdomain("x.fbcdn.net", "fbcdn.net"), true);
  assert.equal(isHostOrSubdomain("fbcdn.net.evil.example", "fbcdn.net"), false);
});

test("video validation accepts signed Facebook CDN streams and rejects unsafe origins", () => {
  const signed = "https://video.fsgn19-1.fna.fbcdn.net/o1/v/t2/f2/m69/video.mp4?oh=signed";
  assert.deepEqual(validateVideo({ url: signed }, 0), { url: signed, extension: "mp4" });
  assert.throws(() => validateVideo({ url: "blob:https://www.facebook.com/abc" }, 0));
  assert.throws(() => validateVideo({ url: "https://fbcdn.net.evil.example/video.mp4" }, 0));
});
