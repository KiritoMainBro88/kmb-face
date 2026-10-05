(function initializeFacebookPayloadBridge() {
  "use strict";
  if (window.__FBIS_PAYLOAD_BRIDGE__) return;
  window.__FBIS_PAYLOAD_BRIDGE__ = true;

  const Constants = window.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const { IPC_ACTIONS, MEDIA_HOSTS, MESSAGE_SOURCES } = Constants;

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || message?.source !== MESSAGE_SOURCES.CONTENT) return;
    if (!message.requestId) return;

    if (message.type === IPC_ACTIONS.RESOLVE_STORY) {
      try {
        const story = collectStoryMedia(message.storyId);
        window.postMessage({
          source: MESSAGE_SOURCES.MAIN,
          type: IPC_ACTIONS.RESOLVE_STORY_RESULT,
          requestId: message.requestId,
          ok: Boolean(story),
          story,
          error: story ? "" : "Không tìm thấy media Story trong payload hiện có."
        }, "*");
      } catch (error) {
        window.postMessage({
          source: MESSAGE_SOURCES.MAIN,
          type: IPC_ACTIONS.RESOLVE_STORY_RESULT,
          requestId: message.requestId,
          ok: false,
          story: null,
          error: error instanceof Error ? error.message : "Story resolver failed."
        }, "*");
      }
      return;
    }

    if (message.type !== IPC_ACTIONS.RESOLVE_POST) return;

    try {
      const media = collectFromSerializedPayload(message.postId);
      window.postMessage({
        source: MESSAGE_SOURCES.MAIN,
        type: IPC_ACTIONS.RESOLVE_POST_RESULT,
        requestId: message.requestId,
        ok: media.images.length > 0 || media.videos.length > 0,
        images: media.images,
        videos: media.videos,
        error: media.images.length > 0 || media.videos.length > 0
          ? ""
          : "Không tìm thấy media trong Relay payload hiện có."
      }, "*");
    } catch (error) {
      window.postMessage({
        source: MESSAGE_SOURCES.MAIN,
        type: IPC_ACTIONS.RESOLVE_POST_RESULT,
        requestId: message.requestId,
        ok: false,
        images: [],
        videos: [],
        error: error instanceof Error ? error.message : "Relay payload resolver failed."
      }, "*");
    }
  });

  function collectStoryMedia(storyId) {
    const needle = String(storyId || "").trim();
    if (!needle) return null;

    const videos = [];
    const images = [];
    for (const script of document.scripts) {
      const text = script.textContent || "";
      if (!text.includes(needle) || !/(?:fbcdn\.net|fbsbx\.com)/i.test(text)) continue;
      videos.push(...extractVideoUrls(text));
      images.push(...extractStoryImageUrls(text));
    }

    const bestVideo = dedupeVideos(videos)[0];
    if (bestVideo) {
      return { type: "video", ...bestVideo };
    }
    const bestImage = dedupe(images.filter((image) => !isLikelyVideoUrl(image.url)))[0];
    return bestImage ? { type: "image", url: bestImage.url } : null;
  }

  function extractStoryImageUrls(text) {
    const found = [];
    const patterns = [
      /"image"\s*:\s*\{[^{}]{0,1200}?"uri"\s*:\s*"((?:\\.|[^"\\])+)"/g,
      /"image_uri"\s*:\s*"((?:\\.|[^"\\])+)"/g
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        try {
          const url = JSON.parse(`"${match[1]}"`);
          if (isAllowedMediaUrl(url)) found.push({ url });
        } catch {
          // Ignore malformed serialized fragments.
        }
      }
    }
    return found;
  }

  function collectFromSerializedPayload(postId) {
    const needle = String(postId || "");
    if (!needle || needle === "unknown") return { images: [], videos: [] };

    const images = [];
    const videos = [];
    for (const script of document.scripts) {
      const text = script.textContent || "";
      if (!text.includes(needle) || !/(?:fbcdn\.net|fbsbx\.com)/i.test(text)) continue;
      const scriptVideos = extractVideoUrls(text);
      const explicitVideoUrls = new Set(scriptVideos.map((video) => video.url));
      images.push(...extractUrls(text).filter((image) => !explicitVideoUrls.has(image.url)));
      videos.push(...scriptVideos);
    }
    return {
      images: dedupe(images.filter((image) => !isLikelyVideoUrl(image.url))),
      videos: dedupeVideos(videos)
    };
  }

  function extractUrls(text) {
    const found = [];
    const patterns = [
      /"uri"\s*:\s*"((?:\\.|[^"\\])+)"/g,
      /"url"\s*:\s*"((?:\\.|[^"\\])+)"/g
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        try {
          const url = JSON.parse(`"${match[1]}"`);
          if (isAllowedMediaUrl(url)) found.push({ url });
        } catch {
          // Ignore malformed serialized fragments.
        }
      }
    }
    return found;
  }

  function extractVideoUrls(text) {
    const priorities = [
      { field: "playable_url_quality_hd", quality: "hd", score: 300 },
      { field: "browser_native_hd_url", quality: "hd", score: 250 },
      { field: "playable_url", quality: "sd", score: 100 }
    ];
    const found = [];

    for (const { field, quality, score } of priorities) {
      const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)"`, "g");
      for (const match of text.matchAll(pattern)) {
        try {
          const url = JSON.parse(`"${match[1]}"`);
          if (isAllowedMediaUrl(url)) found.push({ url, quality, source: field, score });
        } catch {
          // Ignore malformed serialized fragments.
        }
      }
    }

    for (const image of extractUrls(text)) {
      if (isLikelyVideoUrl(image.url)) {
        found.push({ url: image.url, quality: "unknown", source: "mp4-fallback", score: 10 });
      }
    }
    return found;
  }

  function dedupeVideos(videos) {
    const byIdentity = new Map();
    for (const video of videos) {
      try {
        const parsed = new URL(video.url);
        const key = `${parsed.hostname}${parsed.pathname}`;
        const previous = byIdentity.get(key);
        if (!previous || Number(video.score || 0) > Number(previous.score || 0)) {
          byIdentity.set(key, video);
        }
      } catch {
        // Ignore malformed URLs.
      }
    }
    return Array.from(byIdentity.values()).map(({ score, ...video }) => video);
  }

  function isLikelyVideoUrl(url) {
    try {
      const parsed = new URL(url);
      const decoded = decodeURIComponent(`${parsed.pathname}?${parsed.searchParams.toString()}`).toLowerCase();
      return /\.mp4(?:$|[?&#])/.test(parsed.pathname.toLowerCase()) ||
        /video(?:\/|%2f)?mp4|video_mp4|mime(?:_type)?=video/.test(decoded);
    } catch {
      return false;
    }
  }

  function dedupe(images) {
    const seen = new Set();
    return images.filter((image) => {
      try {
        const parsed = new URL(image.url);
        const key = `${parsed.hostname}${parsed.pathname}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      } catch {
        return false;
      }
    });
  }

  function isAllowedMediaUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && MEDIA_HOSTS.some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
    } catch {
      return false;
    }
  }
})();
