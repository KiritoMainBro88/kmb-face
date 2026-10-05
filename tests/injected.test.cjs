"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("MAIN resolver prefers HD playable video and keeps it out of image results", () => {
  let listener = null;
  let result = null;
  const fakeWindow = {
    __FBIS_PAYLOAD_BRIDGE__: false,
    addEventListener(type, callback) {
      if (type === "message") listener = callback;
    },
    postMessage(message) {
      result = message;
    }
  };
  const hd = "https://video.fsgn1-1.fna.fbcdn.net/o1/v/t2/video.mp4?quality=hd";
  const sd = "https://video.fsgn1-1.fna.fbcdn.net/o1/v/t2/video.mp4?quality=sd";
  const image = "https://scontent.fsgn1-1.fna.fbcdn.net/v/t39/photo.jpg?oh=signed";
  global.window = fakeWindow;
  global.document = {
    scripts: [{
      textContent: JSON.stringify({
        post_id: "12345",
        playable_url_quality_hd: hd,
        playable_url: sd,
        image: { uri: image }
      })
    }]
  };

  const modulePath = require.resolve("../src/injected.js");
  delete require.cache[modulePath];
  require(modulePath);
  listener({
    source: fakeWindow,
    data: { source: "FBIS_CONTENT", type: "FBIS_RESOLVE_POST", requestId: "req-1", postId: "12345" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].url, hd);
  assert.equal(result.videos[0].quality, "hd");
  assert.deepEqual(result.images, [{ url: image }]);

  delete global.window;
  delete global.document;
  delete require.cache[modulePath];
});

test("Story resolver prefers HD video for the current story payload", () => {
  let listener = null;
  let result = null;
  const fakeWindow = {
    __FBIS_PAYLOAD_BRIDGE__: false,
    addEventListener(type, callback) {
      if (type === "message") listener = callback;
    },
    postMessage(message) {
      result = message;
    }
  };
  const hd = "https://video.fsgn1-1.fna.fbcdn.net/o1/v/t2/story.mp4?quality=hd";
  const image = "https://scontent.fsgn1-1.fna.fbcdn.net/v/t39/story.jpg?oh=signed";
  global.window = fakeWindow;
  global.document = {
    scripts: [{
      textContent: JSON.stringify({
        story_id: "77777",
        playable_url_quality_hd: hd,
        image: { uri: image }
      })
    }]
  };

  const modulePath = require.resolve("../src/injected.js");
  delete require.cache[modulePath];
  require(modulePath);
  listener({
    source: fakeWindow,
    data: { source: "FBIS_CONTENT", type: "FBIS_RESOLVE_STORY", requestId: "story-1", storyId: "77777" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.story.type, "video");
  assert.equal(result.story.url, hd);

  delete global.window;
  delete global.document;
  delete require.cache[modulePath];
});
