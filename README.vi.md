# kmb-face

Language: [ English ](README.md) | **[ Tiếng Việt ]**

[![License GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-v1.3.0-0a7cff.svg)
![Node tests](https://img.shields.io/github/actions/workflow/status/KiritoMainBro88/kmb-face/ci.yml?branch=main&label=Node%20tests)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34A853.svg)

`kmb-face` là Chrome Extension Manifest V3 viết bằng Vanilla JavaScript để tải media từ nội dung Facebook đang hiển thị trong trình duyệt. Extension hỗ trợ ảnh, video HD/Reels, Story, media bình luận, ZIP, IDM/FDM Direct, Clean Feed, mẫu tên file tùy biến và giao diện song ngữ Việt/Anh.

## Cài đặt trong 3 bước

1. Tải file ZIP mới nhất tại [GitHub Releases](https://github.com/KiritoMainBro88/kmb-face/releases), sau đó giải nén ra một thư mục.
2. Mở `chrome://extensions/` và bật **Developer mode**.
3. Chọn **Load unpacked** rồi trỏ tới thư mục vừa giải nén có `manifest.json`.

Sau khi thay file bằng phiên bản mới, bấm **Reload** trong `chrome://extensions/` và refresh tab Facebook.

## Tính năng chính

- **Zero-Click Feed Awareness**: tự nhận diện các bài viết đủ điều kiện và gắn quick action trực tiếp lên media. Việc tải vẫn chỉ bắt đầu khi người dùng chủ động bấm.
- **One-Click Media Actions**: tải ZIP, gửi link sang IDM/FDM, copy link HD hoặc quét media bình luận ngay từ overlay trên bài viết.
- **Photo Carousel Scanner**: quét viewer ảnh Facebook, xử lý post có `+N`, ưu tiên ảnh độ phân giải cao và loại trùng theo media identity.
- **Video & Reels**: ưu tiên URL MP4 HD lấy từ metadata Facebook; video lớn được tải riêng khi cần để hạn chế tăng RAM trong quá trình đóng ZIP.
- **Story Saver**: thêm nút tải Story, tạm dừng playback khi resolve/download nếu có thể và khôi phục phát sau đó.
- **Clean Feed**: ẩn các khối `Sponsored` / `Được tài trợ`, `Suggested for you` / `Gợi ý cho bạn` và nội dung đề xuất video ngắn. Mặc định bật, có thể tắt trong popup.
- **Comment Media Harvester**: gom ảnh/video đã tải trong vùng bình luận vào thư mục `comments_media/` trong ZIP.
- **Custom Filename Template**: hỗ trợ `{author}`, `{postId}`, `{index}`, `{date}` cho media tải trực tiếp và file media trong ZIP.
- **Giao diện song ngữ**: chọn **Tự động / Auto**, **Tiếng Việt** hoặc **English**. Auto dùng `navigator.language`; locale `vi-*` chọn tiếng Việt, các locale khác mặc định English.
- **Auto-Update Checker**: kiểm tra GitHub Releases mỗi 12 giờ; khi có semantic version mới hơn sẽ hiện badge `NEW` và banner cập nhật trong popup.
- **Kiến trúc sạch v1.3**: tập trung timing, limit, IPC action, storage key và selector Facebook; UI quick action được tách riêng sau `UIManager`.
- **Zero-Build Type Safety**: JavaScript vẫn được Chrome chạy trực tiếp, đồng thời JSDoc + TypeScript `checkJs` kiểm tra kiểu tĩnh trong CI.
- **Like Confirmation**: yêu cầu bấm lần thứ hai trong vòng 3 giây trước khi thao tác Like được thực hiện, giúp hạn chế bấm nhầm.
- **Cosmetic Verified Badge**: tích xanh trang trí client-side cho người dùng hiện tại; không thay đổi trạng thái xác minh tài khoản Facebook.
- **Diagnostic Reporter**: giữ tối đa 50 sự kiện chẩn đoán gần nhất và loại bỏ các trường credential/session phổ biến trước khi Copy Logs hoặc mở GitHub Issue.
- **Anti-Checkpoint Mindset**: không tự động hóa đăng nhập, không yêu cầu quyền cookie và không tự thực hiện hành động tài khoản nền. Extension làm việc với nội dung đã có trong phiên trình duyệt và giữ các thao tác nhạy cảm dưới quyền chủ động của người dùng.

## Cài đặt ngôn ngữ

Mở popup extension và chọn:

- **Tự động / Auto**: dùng tiếng Việt nếu `navigator.language` bắt đầu bằng `vi`, còn lại dùng English.
- **Tiếng Việt**: luôn hiển thị giao diện tiếng Việt.
- **English**: luôn hiển thị giao diện tiếng Anh.

Thiết lập được lưu dưới key `fbis_language` trong `chrome.storage.local`. Các quick action đang có trên feed và nút Story sẽ cập nhật khi ngôn ngữ thay đổi.

## Cách dùng nhanh

### Tải media từ bài viết

Mở Facebook và tìm bài có ảnh/video. Dùng quick action hiển thị trên media hoặc mở menu phụ để chọn ZIP, IDM/FDM Direct, Copy HD Links hay quét media bình luận.

### Tải Story

Mở đường dẫn `facebook.com/stories/...` rồi dùng nút tải Story do extension hiển thị.

### Báo lỗi

Mở popup và dùng **Copy Logs** hoặc **Báo lỗi (GitHub)**. Diagnostic output sẽ được sanitize trước khi copy hoặc đưa vào nội dung Issue.

## Quyền extension

- `downloads`: tải ZIP/MP4 hoặc gửi media URL qua Chrome download pipeline.
- `clipboardWrite`: copy link HD và diagnostic logs.
- `storage`: lưu cài đặt popup, lựa chọn ngôn ngữ, trạng thái update và mẫu tên file.
- `alarms`: chạy kiểm tra cập nhật mỗi 12 giờ.
- Host permissions cho `facebook.com`, `fbcdn.net`, `fbsbx.com`: chạy content script và fetch media Facebook được hỗ trợ.
- Host permission cho `api.github.com`: đọc metadata của GitHub Release mới nhất.

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

Push tag dạng `v*` sẽ kích hoạt workflow release, đóng gói extension thành `kmb-face-<tag>.zip` và tự tạo GitHub Release.

## Disclaimer

Dự án phục vụ mục đích nghiên cứu và sử dụng cá nhân. Người dùng chịu trách nhiệm tuân thủ quyền sở hữu nội dung, điều khoản áp dụng của Facebook và pháp luật địa phương khi tải hoặc tái sử dụng media.

`kmb-face` không có backend riêng để thu thập hoặc lưu trữ dữ liệu người dùng. Diagnostic logger hoạt động cục bộ trong extension và chỉ được xuất khi người dùng chủ động chọn Copy Logs hoặc Báo lỗi.

## License

Phát hành theo [GNU General Public License v3.0](LICENSE).
