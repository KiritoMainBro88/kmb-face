"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CarouselCollector,
  collectCommentMedia,
  dispatchNextKeyboardEvent,
  estimateExpectedCount,
  extractAlbumId,
  extractPhotoId,
  extractVideoId,
  getBestImageUrl,
  getPostPhotoLinks,
  getPostVideoRefs,
  findBestViewerImage,
  isAllowedMediaUrl,
  isAllowedVideoUrl,
  isCollectionComplete,
  normalizeImageIdentity
} = require("../src/collector.js");

function createPhotoLink({ href, text = "", label = "" }) {
  return {
    href,
    textContent: text,
    getAttribute(name) {
      return name === "aria-label" ? label : null;
    }
  };
}

function createPost(links) {
  return {
    querySelectorAll(selector) {
      return selector.includes("photo") ? links : [];
    }
  };
}

test("Facebook +46 overlay on the fifth tile means 50 total images", () => {
  const links = Array.from({ length: 5 }, (_, index) =>
    createPhotoLink({
      href: `https://www.facebook.com/photo/?fbid=${100 + index}&set=pcb.999`,
      text: index === 4 ? "+46" : ""
    })
  );

  assert.deepEqual(estimateExpectedCount(createPost(links)), {
    expected: 50,
    renderedLinks: 5,
    additional: 46,
    overlayIndex: 4
  });
});

test("photo and post album ids are parsed from Facebook URLs", () => {
  const url = "https://www.facebook.com/photo/?fbid=123456&set=pcb.987654";
  assert.equal(extractPhotoId(url), "123456");
  assert.equal(extractAlbumId(url), "987654");
});

test("signed query changes do not create duplicate image identities", () => {
  const first = "https://scontent.example.fbcdn.net/v/a/photo.jpg?oh=one&oe=1";
  const second = "https://scontent.example.fbcdn.net/v/a/photo.jpg?oh=two&oe=2";
  assert.equal(normalizeImageIdentity(first), normalizeImageIdentity(second));
});

test("only HTTPS Facebook media hosts are allowed", () => {
  assert.equal(isAllowedMediaUrl("https://scontent.fsgn1-1.fna.fbcdn.net/a.jpg"), true);
  assert.equal(isAllowedMediaUrl("https://lookaside.fbsbx.com/a.png"), true);
  assert.equal(isAllowedMediaUrl("https://facebook.com/a.jpg"), true);
  assert.equal(isAllowedMediaUrl("https://fbcdn.net.evil.example/a.jpg"), false);
  assert.equal(isAllowedMediaUrl("https://fbcdn.net@evil.example/a.jpg"), false);
  assert.equal(isAllowedMediaUrl("javascript:alert(1)"), false);
});

test("Facebook video and Reel URLs are parsed without accepting blob or lookalike hosts", () => {
  assert.equal(extractVideoId("https://www.facebook.com/reel/123456789"), "123456789");
  assert.equal(extractVideoId("https://www.facebook.com/watch/?v=987654321"), "987654321");
  assert.equal(
    isAllowedVideoUrl("https://video.fsgn1-1.fna.fbcdn.net/o1/v/t2/video.mp4?oh=signed"),
    true
  );
  assert.equal(
    isAllowedVideoUrl("https://video.fsgn1-1.fna.fbcdn.net/o1/v/t2/stream?mime=video%2Fmp4"),
    true
  );
  assert.equal(isAllowedVideoUrl("blob:https://www.facebook.com/abc"), false);
  assert.equal(isAllowedVideoUrl("https://fbcdn.net.evil.example/video.mp4"), false);
});

test("post video refs recognize video nodes and Reel permalinks", () => {
  const video = {
    currentSrc: "blob:https://www.facebook.com/player",
    src: "",
    parentElement: null,
    ownerDocument: { defaultView: { location: { href: "https://www.facebook.com/" } } }
  };
  const reelLink = {
    href: "https://www.facebook.com/reel/24680",
    parentElement: null,
    getAttribute(name) {
      return name === "href" ? this.href : null;
    }
  };
  const container = {
    querySelectorAll(selector) {
      if (selector === "video") return [video];
      if (selector.includes('/reel/')) return [reelLink];
      return [];
    }
  };
  assert.deepEqual(
    getPostVideoRefs(container).map(({ videoId, permalink }) => ({ videoId, permalink })),
    [{ videoId: "24680", permalink: reelLink.href }]
  );
});

test("comment media harvester keeps real media and drops stickers or tiny icons", () => {
  const goodImage = {
    currentSrc: "https://scontent.example.fbcdn.net/comment-photo.jpg",
    src: "",
    naturalWidth: 1200,
    naturalHeight: 900,
    getAttribute() { return null; },
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 320, height: 240, right: 320, bottom: 240 };
    }
  };
  const sticker = {
    currentSrc: "https://scontent.example.fbcdn.net/stickers/smile.png",
    src: "",
    naturalWidth: 80,
    naturalHeight: 80,
    getAttribute() { return null; },
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 80, height: 80, right: 80, bottom: 80 };
    }
  };
  const commentLink = {
    href: "https://www.facebook.com/post?comment_id=555",
    getAttribute(name) { return name === "href" ? this.href : null; }
  };
  const author = { textContent: "Alice" };
  const comment = {
    getAttribute() { return null; },
    querySelector(selector) {
      return selector.includes("h3 a") ? author : null;
    },
    querySelectorAll(selector) {
      if (selector === "img") return [goodImage, sticker];
      if (selector === "a[href]") return [commentLink];
      return [];
    }
  };
  const post = {
    querySelectorAll(selector) {
      if (selector === 'div[role="article"]') return [comment];
      if (selector === "[aria-label]") return [];
      return [];
    }
  };

  assert.deepEqual(collectCommentMedia(post), [{
    author: "Alice",
    commentId: "555",
    media: [{
      type: "image",
      url: goodImage.currentSrc,
      index: 1,
      width: 1200,
      height: 900
    }]
  }]);
});

test("currentSrc is preferred because it is the image currently exposed by Facebook", () => {
  const image = {
    currentSrc: "https://scontent.example.fbcdn.net/full.jpg",
    src: "https://scontent.example.fbcdn.net/thumb.jpg",
    naturalWidth: 1800,
    getAttribute() {
      return "https://scontent.example.fbcdn.net/640.jpg 640w, https://scontent.example.fbcdn.net/1800.jpg 1800w";
    }
  };
  assert.equal(getBestImageUrl(image), image.currentSrc);
});

test("a higher-resolution srcset candidate wins over a small current rendition", () => {
  const image = {
    currentSrc: "https://scontent.example.fbcdn.net/640.jpg",
    src: "https://scontent.example.fbcdn.net/thumb.jpg",
    naturalWidth: 640,
    getAttribute() {
      return "https://scontent.example.fbcdn.net/640.jpg 640w, https://scontent.example.fbcdn.net/1800.jpg 1800w";
    }
  };
  assert.equal(getBestImageUrl(image), "https://scontent.example.fbcdn.net/1800.jpg");
});

test("cycle and natural end are treated as adaptive completion", () => {
  assert.equal(isCollectionComplete("cycle", 6, 50), true);
  assert.equal(isCollectionComplete("cycle", 50, 50), true);
  assert.equal(isCollectionComplete("expected", 50, 50), true);
  assert.equal(isCollectionComplete("end", 49, 50), true);
  assert.equal(isCollectionComplete("end", 1, null), true);
  assert.equal(isCollectionComplete("transition-timeout", 50, 50), false);
});

test("post photo links stay in one pcb set and ignore comment albums", () => {
  const mainPostLinks = Array.from({ length: 3 }, (_, index) =>
    createPhotoLink({
      href: `https://www.facebook.com/photo/?fbid=${100 + index}&set=pcb.999`,
      text: index === 2 ? "+4" : ""
    })
  );
  const commentLinks = Array.from({ length: 5 }, (_, index) =>
    createPhotoLink({
      href: `https://www.facebook.com/photo/?fbid=${200 + index}&set=pcb.888`
    })
  );

  assert.deepEqual(getPostPhotoLinks(createPost([...mainPostLinks, ...commentLinks])), mainPostLinks);
});

test("post photo links exclude nested comment article albums", () => {
  const mainLinks = Array.from({ length: 2 }, (_, index) =>
    createPhotoLink({ href: `https://www.facebook.com/photo/?fbid=${100 + index}&set=pcb.999` })
  );
  const commentLinks = Array.from({ length: 3 }, (_, index) =>
    createPhotoLink({
      href: `https://www.facebook.com/photo/?fbid=${200 + index}&set=pcb.888`,
      text: index === 2 ? "+8" : ""
    })
  );
  const nestedArticle = {
    parentElement: null,
    tagName: "DIV",
    getAttribute(name) {
      return name === "role" ? "article" : null;
    }
  };
  for (const link of commentLinks) link.parentElement = nestedArticle;
  const post = createPost([...mainLinks, ...commentLinks]);
  nestedArticle.parentElement = post;

  assert.deepEqual(getPostPhotoLinks(post), mainLinks);
});

test("viewer opening tolerates a null DOM gap between thumbnail and full image", async () => {
  let imageQueries = 0;
  const image = {
    alt: "Full image",
    complete: true,
    currentSrc: "https://scontent.example.fbcdn.net/full-2.jpg",
    naturalHeight: 1125,
    naturalWidth: 1800,
    src: "",
    getAttribute(name) {
      return name === "data-visualcompletion" ? "media-vc-image" : null;
    },
    getBoundingClientRect() {
      return { x: 0, y: 100, width: 900, height: 560, right: 900, bottom: 660 };
    }
  };
  const document = {
    querySelectorAll(selector) {
      if (selector === '[role="main"], main') {
        return [];
      }
      imageQueries += 1;
      return imageQueries < 3 ? [] : [image];
    }
  };
  const window = {
    innerHeight: 800,
    innerWidth: 1280,
    location: { href: "https://www.facebook.com/photo/?fbid=2&set=pcb.9" },
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    }
  };
  const collector = new CarouselCollector({ document, window, pollInterval: 1, openTimeout: 100 });

  const result = await collector.waitForViewerToOpen(null, {
    url: "https://scontent.example.fbcdn.net/thumb.jpg",
    width: 590,
    height: 350
  });

  assert.equal(result.photoId, "2");
  assert.equal(result.width, 1800);
});

test("collector waits briefly when Facebook mounts the Next control late", async () => {
  let labelQueries = 0;
  const next = {
    hasAttribute() {
      return false;
    },
    getAttribute(name) {
      if (name === "aria-label") return "Ảnh tiếp theo";
      if (name === "role") return "button";
      return null;
    },
    getBoundingClientRect() {
      return { x: 850, y: 50, width: 32, height: 700, right: 882, bottom: 750 };
    },
    closest() {
      return this;
    }
  };
  const scope = {
    querySelectorAll(selector) {
      if (selector === "[aria-label]") {
        labelQueries += 1;
        return labelQueries < 3 ? [] : [next];
      }
      return [];
    }
  };
  const viewerImage = { closest: () => scope };
  const window = {
    innerHeight: 800,
    innerWidth: 1280,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    }
  };
  const collector = new CarouselCollector({ document: {}, window, pollInterval: 1 });

  assert.equal(await collector.waitForNextControl(viewerImage, null, 100), next);
});

test("ArrowRight keyboard fallback dispatches a bubbling keydown", () => {
  let dispatched = null;
  class FakeKeyboardEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  const document = {
    dispatchEvent(event) {
      dispatched = event;
      return true;
    }
  };
  const window = { KeyboardEvent: FakeKeyboardEvent };

  assert.equal(dispatchNextKeyboardEvent(document, window), true);
  assert.equal(dispatched.type, "keydown");
  assert.equal(dispatched.key, "ArrowRight");
  assert.equal(dispatched.code, "ArrowRight");
  assert.equal(dispatched.keyCode, 39);
  assert.equal(dispatched.which, 39);
  assert.equal(dispatched.bubbles, true);
});

test("viewer image scoring prefers the media closest to the viewport center", () => {
  function createCandidate(name, x) {
    return {
      alt: name,
      complete: true,
      currentSrc: `https://scontent.example.fbcdn.net/${name}.jpg`,
      naturalHeight: 600,
      naturalWidth: 1000,
      src: "",
      getAttribute(attribute) {
        return attribute === "data-visualcompletion" ? "media-vc-image" : null;
      },
      getBoundingClientRect() {
        return { x, y: 100, width: 500, height: 300, right: x + 500, bottom: 400 };
      }
    };
  }

  const farImage = createCandidate("far", 0);
  const centeredImage = createCandidate("centered", 390);
  const document = {
    querySelectorAll(selector) {
      return selector === '[role="main"], main' ? [] : [farImage, centeredImage];
    }
  };
  const window = {
    innerHeight: 800,
    innerWidth: 1280,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    }
  };

  assert.equal(findBestViewerImage(document, window), centeredImage);
});

test("collector safety limit defaults to 500 and remains configurable", () => {
  assert.equal(new CarouselCollector({ document: {}, window: {} }).safetyLimit, 500);
  assert.equal(new CarouselCollector({ document: {}, window: {}, safetyLimit: 777 }).safetyLimit, 777);
});
