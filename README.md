# kmb-face

[![License GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-v1.0.0-0a7cff.svg)
![Node tests](https://img.shields.io/github/actions/workflow/status/KiritoMainBro88/kmb-face/ci.yml?branch=main&label=Node%20tests)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34A853.svg)

`kmb-face` là Chrome Extension Manifest V3 viết bằng Vanilla JavaScript để tải media từ nội dung Facebook mà người dùng đang xem. Extension hỗ trợ ảnh, video/Reels, Story, media trong bình luận, ZIP và chế độ gửi link trực tiếp cho IDM/FDM.

## Cài đặt trong 3 bước

1. Tải file ZIP mới nhất tại [GitHub Releases](https://github.com/KiritoMainBro88/kmb-face/releases) rồi giải nén ra một thư mục.
2. Mở `chrome://extensions/`, bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ tới thư mục vừa giải nén có `manifest.json`.

Sau khi cập nhật extension thủ công, bấm **Reload** trong `chrome://extensions/` và refresh tab Facebook.

## Tính năng chính

- **1-Click Feed Download**: gắn quick action trực tiếp lên post, hỗ trợ ZIP, IDM/FDM Direct và Copy link HD.
- **Photo carousel scanner**: lấy ảnh lớn trong viewer, xử lý post có `+N`, loại trùng theo media identity.
- **Video & Reels**: ưu tiên URL MP4 HD từ metadata Facebook; video lớn được tải riêng để tránh tăng RAM khi đóng ZIP.
- **Story Saver**: nút `⚡ Tải Story (HD)` trên viewer Story, có pause guard trong lúc resolve/download rồi phát tiếp khi phù hợp.
- **Comment Media Harvester**: gom ảnh/video đã tải trong vùng bình luận vào `comments_media/` trong ZIP.
- **Like Confirmation**: cơ chế two-step click trong 3 giây để hạn chế bấm nhầm Like.
- **Fake Badge / Cosmetic Verified Badge**: tích xanh trang trí client-side chỉ hiển thị trong trình duyệt của bạn.
- **Settings Popup**: bật/tắt Like Confirmation, Cosmetic Badge, `post_info.txt`, và chọn ZIP hoặc IDM Direct làm chế độ mặc định.
- **Diagnostic Reporter**: ring logger 50 sự kiện gần nhất, tự khử `fb_dtsg`, `c_user`, session ID và cookie/authorization trước khi copy hoặc mở GitHub Issue.

## Cách dùng nhanh

### Tải media từ bài viết

Mở Facebook và tìm post có ảnh/video. Quick action xuất hiện trên media của post. Click nút chính để dùng chế độ mặc định hoặc mở menu phụ để chọn ZIP, IDM/FDM Direct, Copy link HD hoặc quét media bình luận.

### Tải Story

Mở đường dẫn `facebook.com/stories/...`, sau đó click **⚡ Tải Story (HD)** ở viewer.

### Báo lỗi

Mở popup extension:

- **📋 Copy Logs**: copy environment + tối đa 50 diagnostic events đã sanitize.
- **🐛 Báo lỗi (GitHub)**: mở trang tạo Issue với log và thông tin môi trường được điền sẵn.

Reporter không tự đính kèm cookie hoặc credential Facebook.

## Quyền extension

- `downloads`: tải ZIP/MP4 hoặc gửi media URL qua Chrome download pipeline.
- `clipboardWrite`: Copy link HD và Copy Logs.
- `storage`: lưu các tùy chọn trong popup bằng `chrome.storage.local`.
- `host_permissions` cho `facebook.com`, `fbcdn.net`, `fbsbx.com`: chạy content script và fetch media từ các host Facebook cần thiết.

Extension không yêu cầu quyền `cookies` hoặc `webRequest`.

## Phát triển

Yêu cầu Node.js 20+.

```powershell
# Syntax check
Get-ChildItem src,tests,lib -Recurse -File | Where-Object Extension -in '.js','.cjs' |
  ForEach-Object { node --check $_.FullName }

# Unit tests
node --test tests/*.test.cjs
```

GitHub Actions chạy test trên Node.js 20.x và 22.x cho mọi push/pull request vào `main`.

## Release

Push tag dạng `v*` sẽ chạy workflow release, đóng gói đúng các file extension cần thiết thành `kmb-face-<tag>.zip` và tạo GitHub Release tự động.

## Disclaimer

Dự án phục vụ mục đích nghiên cứu và sử dụng cá nhân. Người dùng chịu trách nhiệm tuân thủ quyền sở hữu nội dung, điều khoản của nền tảng và pháp luật áp dụng khi tải hoặc sử dụng media.

`kmb-face` không có backend riêng để thu thập hoặc lưu trữ dữ liệu người dùng. Diagnostic logger hoạt động trong bộ nhớ của extension và chỉ tạo báo cáo khi người dùng chủ động bấm Copy Logs hoặc Báo lỗi.

## License

Phát hành theo [GNU General Public License v3.0](LICENSE).
