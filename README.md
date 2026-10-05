# kmb-face

Language: **[ English ]** | [ Tiếng Việt ](README.vi.md)

[![License GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-v1.2.0-0a7cff.svg)
![Node tests](https://img.shields.io/github/actions/workflow/status/KiritoMainBro88/kmb-face/ci.yml?branch=main&label=Node%20tests)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34A853.svg)

`kmb-face` is a lightweight Chrome Manifest V3 extension written in vanilla JavaScript for saving media from Facebook content that is already visible in your browser. It supports photos, HD video/Reels, Stories, comment media, ZIP packaging, direct IDM/FDM handoff, Clean Feed filtering, custom filenames, and a bilingual Vietnamese/English interface.

## Install in 3 steps

1. Download the latest ZIP from [GitHub Releases](https://github.com/KiritoMainBro88/kmb-face/releases) and extract it to a folder.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

After replacing files with a newer version, click **Reload** in `chrome://extensions/` and refresh your Facebook tab.

## Highlights

- **Zero-Click Feed Awareness**: eligible Facebook posts are detected automatically and receive an on-post quick action. Downloads still require an explicit user click.
- **One-Click Media Actions**: download ZIPs, send links to IDM/FDM, copy HD links, or harvest loaded comment media directly from the post overlay.
- **Photo Carousel Scanner**: traverses Facebook photo viewers, handles `+N` posts, prefers larger renditions, and removes duplicate media identities.
- **Video & Reels**: prefers HD MP4 URLs exposed by Facebook metadata and keeps large videos outside ZIP memory when necessary.
- **Story Saver**: adds a Story download action, pauses playback while resolving/downloading when possible, then resumes playback safely.
- **Clean Feed**: hides Sponsored, Suggested for you, and short-form recommendation blocks. The feature is enabled by default and can be disabled from the popup.
- **Comment Media Harvester**: collects loaded photo/video media from comments and stores it under `comments_media/` inside the ZIP.
- **Custom Filename Template**: supports `{author}`, `{postId}`, `{index}`, and `{date}` for direct downloads and media stored inside ZIP files.
- **Bilingual UI**: choose **Auto**, **Tiếng Việt**, or **English**. Auto mode uses `navigator.language`, selecting Vietnamese for `vi-*` locales and English otherwise.
- **Auto-Update Checker**: polls the latest GitHub Release every 12 hours and displays a `NEW` badge plus an update banner when a newer semantic version exists.
- **Like Confirmation**: requires a second click within three seconds before a Like action proceeds, reducing accidental reactions.
- **Cosmetic Verified Badge**: adds a local client-side visual badge for the current user. It does not alter Facebook account verification.
- **Diagnostic Reporter**: stores the latest 50 sanitized diagnostic events and strips common Facebook/session credentials before Copy Logs or GitHub issue generation.
- **Anti-Checkpoint Mindset**: the extension avoids automated login flows, cookie permissions, and background account actions. It works with content already available in the active browser session and keeps user-triggered actions explicit.

## Language settings

Open the extension popup and choose:

- **Auto**: Vietnamese when `navigator.language` starts with `vi`; English for other locales.
- **Tiếng Việt**: always use Vietnamese.
- **English**: always use English.

The setting is stored as `fbis_language` in `chrome.storage.local`. Existing feed actions and Story controls update when the language changes.

## Quick usage

### Download media from a post

Open Facebook and find a post containing photos or video. Use the quick action displayed on the media area, or open its menu to choose ZIP, IDM/FDM Direct, Copy HD Links, or Comment Media harvesting.

### Download a Story

Open a `facebook.com/stories/...` URL and use the Story download button shown by the extension.

### Report a problem

Open the popup and use **Copy Logs** or **Report Issue (GitHub)**. Diagnostic output is sanitized before it is copied or inserted into an issue template.

## Permissions

- `downloads`: start ZIP/MP4 downloads or send media URLs through Chrome's download pipeline.
- `clipboardWrite`: copy HD links and diagnostic logs.
- `storage`: store popup settings, language preference, update state, and filename template.
- `alarms`: run the 12-hour update check.
- Host permissions for `facebook.com`, `fbcdn.net`, and `fbsbx.com`: run the content script and fetch supported Facebook media.
- Host permission for `api.github.com`: read the latest GitHub Release metadata.

The extension does not request `cookies` or `webRequest` permissions.

## Development

Requires Node.js 20+.

```powershell
# Syntax check
Get-ChildItem src,tests,lib -Recurse -File | Where-Object Extension -in '.js','.cjs' |
  ForEach-Object { node --check $_.FullName }

# Unit tests
node --test tests/*.test.cjs
```

GitHub Actions runs the test suite on Node.js 20.x and 22.x for pushes and pull requests targeting `main`.

## Releases

Pushing a `v*` tag triggers the release workflow, packages the extension as `kmb-face-<tag>.zip`, and creates a GitHub Release automatically.

## Disclaimer

This project is intended for research and personal use. You are responsible for complying with content ownership rights, Facebook's applicable terms, and local law when downloading or reusing media.

`kmb-face` has no standalone backend for collecting or storing user data. Diagnostic logs are maintained locally by the extension and are exported only when the user explicitly chooses to copy or report them.

## License

Released under the [GNU General Public License v3.0](LICENSE).
