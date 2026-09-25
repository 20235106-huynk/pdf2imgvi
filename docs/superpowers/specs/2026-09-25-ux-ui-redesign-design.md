# Thiết kế lại UX/UI Toàn diện cho Extension pdf2imgvi (Studio Workspace)

- **Ngày tạo:** 2026-09-25
- **Trạng thái:** Đã phê duyệt (Approved)
- **Tác giả:** Antigravity AI & Người dùng
- **Phạm vi:** Toàn bộ Extension (Header, Studio Workspace, Preview Viewport, Translation Control Hub, Popup Dashboard, Settings Page, Theme & i18n)

---

## 1. Mục tiêu & Bối cảnh

### 1.1. Bối cảnh
`pdf2imgvi` là Chrome Extension dùng để dịch tài liệu PDF sang Tiếng Việt bằng cách kết xuất từng trang PDF thành hình ảnh, gửi qua Google Gemini Batch API với prompt dịch chuyên dụng và tạo ra trang tài liệu tiếng Việt hoàn chỉnh giữ nguyên bố cục thị giác.

Trước khi thiết kế lại:
- Màn hình chính xếp chồng 1 cột cuộn dọc khiến người dùng phải cuộn lên xuống liên tục giữa trang PDF gốc và kết quả dịch.
- Chưa có chế độ so sánh đối chiếu song song giữa bản gốc và bản dịch tiếng Việt.
- Chưa có bộ chuyển đổi giao diện Sáng/Tối (Light/Dark mode).
- Giao diện hoàn toàn bằng tiếng Anh thô sơ, chưa hỗ trợ song ngữ Tiếng Việt.
- Popup của tiện ích chỉ có 1 nút bấm đơn giản, chưa tận dụng để làm bảng điều khiển nhanh (Quick Dashboard).
- Các nút bấm, bảng điều khiển chưa sử dụng icon Lucide, phong cách visual còn đơn giản.

### 1.2. Mục tiêu thiết kế lại
1. **Studio Workspace (2 cột Split-view):**
   - Cột trái: Document & Visual Viewport với thanh công cụ zoom, kéo thả file PDF (Drag & Drop), phân trang và 3 chế độ xem: `Trang gốc (PDF)`, `Bản dịch (Vietnamese)`, `So sánh song song (Side-by-Side)`.
   - Cột phải: Control & Job Hub với 3 thẻ chức năng rõ ràng (Cấu hình chọn trang & nút dịch CTA lớn; Theo dõi tiến trình trực tiếp & các lô Gemini; Lịch sử bản dịch, xuất file PDF, thử lại lỗi và xóa).
2. **Hệ thống Theme Sáng / Tối (Light & Dark Mode):**
   - Tương thích 100% với Tailwind CSS v4, chuyển đổi mượt mà bằng nút bấm Sun/Moon trên Header.
3. **Đa ngôn ngữ mượt mà (i18n VI / EN):**
   - Hỗ trợ chuyển đổi nhanh Tiếng Việt / Tiếng Anh ngay trên thanh Header hoặc cài đặt.
4. **Popup Quick Dashboard:**
   - Kích thước chuẩn w-96, hiển thị trạng thái kết nối Gemini API, tiến trình tác vụ đang chạy ngầm, danh sách tài liệu gần đây và nút mở Studio toàn màn hình.
5. **Trang Cài đặt hiện đại (Settings Page):**
   - Phân nhóm thẻ trực quan: Khóa API & Bảo mật (có nút ẩn/hiện key), Cấu hình mô hình AI (Model, Chất lượng ảnh 1K/2K/4K), Hiệu năng & Xử lý theo lô, Quản lý bộ nhớ lưu trữ.
6. **Bảo toàn 100% logic nghiệp vụ:**
   - Không làm thay đổi hay phá vỡ các service và storage hiện có (`translation-job`, `translation-recovery`, `gemini-batch`, `pdf-renderer`, `pdf-export`, Dexie indexedDB).

---

## 2. Hệ thống Thiết kế (Design System & Tokens)

Theo khuyến nghị từ kỹ năng `ui-ux-pro-max` (Minimalism & Swiss Style / Modern SaaS):

- **Font chữ:** `Geist Variable` (@fontsource-variable/geist) với typography scale chuẩn mực, các số liệu sử dụng font tabular (`tabular-nums`).
- **Icon:** Vector Lucide React đồng nhất về stroke (1.5px - 2px) và kích thước (16px, 18px, 20px, 24px).
- **Bảng màu:**
  - *Primary Accent:* `#2563EB` (Light) / `#3B82F6` (Dark) cho các nút CTA chính và tab đang hoạt động.
  - *Background:* `#F8FAFC` (Light) / `#09090B` (Dark).
  - *Card Surface:* `#FFFFFF` (Light) / `#18181B` (Dark) với viền `#E2E8F0` / `#27272A`.
  - *Success (Hoàn thành):* `#10B981` (Emerald).
  - *Warning (Đang xử lý / Cần Key):* `#F59E0B` (Amber).
  - *Destructive (Lỗi / Thất bại):* `#EF4444` (Rose/Red).

---

## 3. Kiến trúc Component & Giao diện chi tiết

### 3.1. Header & Điều hướng (`src/workspace/App.tsx`)
- Logo thương hiệu `pdf2imgvi` với icon Sparkles + FileText.
- Badge trạng thái kết nối API:
  - 🟢 Xanh: "API Sẵn sàng" (API Key Configured).
  - 🟡 Hổ phách: "Chưa có API Key" (Nhấp để chuyển sang Cài đặt).
- Segmented Navigation: `[ Studio Dịch thuật ]` (icon FileText) và `[ Cài đặt ]` (icon SlidersHorizontal).
- Right Controls:
  - Nút chuyển ngôn ngữ: `[ VI | EN ]` (icon Languages).
  - Nút chuyển theme: `[ Sun / Moon ]`.

### 3.2. Cột trái: Document & Visual Viewport (`src/workspace/PdfPreview.tsx`)
- **Vùng thả tệp (Dropzone):** Khi chưa có tài liệu, hiển thị khung viền nét đứt hỗ trợ Drag & Drop file `.pdf`, thông báo dung lượng và nút "Chọn tệp PDF".
- **Thanh công cụ đỉnh (Sticky Viewport Toolbar):**
  - Tên file cắt gọn thông minh (`file-name.pdf`), huy hiệu kích thước và số trang.
  - Nút "Đổi tệp / Đóng".
  - **Bộ chuyển đổi 3 chế độ xem (Segmented Mode Switcher):**
    1. `Trang gốc (PDF)`: Canvas render trực tiếp từ PDF.js.
    2. `Bản dịch (Vietnamese)`: Ảnh kết quả đã dịch từ Gemini AI (lấy từ IndexedDB).
    3. `So sánh song song (Side-by-Side)`: Hai khung song song (Trang gốc bên trái, Bản dịch tiếng Việt bên phải) để người dùng đối chiếu.
  - Bộ điều khiển thu phóng: `[-]` `[ Zoom % ]` `[+]` `[Vừa khung]`.
- **Khung Canvas / Image Stage:**
  - Hiệu ứng đổ bóng trang giấy nổi bật, nền canvas tương phản, loading skeleton khi trang đang render.
- **Thanh phân trang đáy:**
  - Nút Previous / Next trang.
  - Ô nhảy trang nhanh: `Trang [ input: X ] / N`.

### 3.3. Cột phải: Control & Job Hub (`src/workspace/TranslationPanel.tsx`)
- **Thẻ 1: Cấu hình dải trang & Bắt đầu dịch:**
  - Ô nhập trang thông minh (`1-5, 8, 10-12`) kèm thông báo validate.
  - Các chip chọn nhanh: `[Tất cả]` `[Trang hiện tại]` `[5 trang đầu]`.
  - Huy hiệu tóm tắt số trang đã chọn.
  - Nút CTA lớn `[ ✨ Bắt đầu dịch sang Tiếng Việt ]`.
  - Banner cảnh báo nếu thiếu API Key có nút dẫn thẳng vào Cài đặt.
- **Thẻ 2: Tiến trình trực tiếp (Live Progress):**
  - Thanh progress bar gradient kèm phần trăm.
  - Huy hiệu trạng thái: Đã xong, Đang xử lý, Lỗi, Tổng số trang.
  - Chi tiết từng lô Gemini (Pending, Running, Succeeded, Failed).
  - Nút `Huỷ bỏ` và `Dừng kiểm tra ngầm (Stop Polling)`.
- **Thẻ 3: Lịch sử bản dịch & Xuất PDF (History & Export):**
  - Danh sách các job đã lưu trong Dexie.
  - Các nút tác vụ nhanh: `Tải về PDF`, `Thử lại trang lỗi`, `Xem lại trang`, `Xoá`.
  - Hộp thoại xác nhận xuất PDF bán phần (Partial Export Confirm) khi có trang lỗi.
  - Khả năng đánh dấu tạo lại từng trang riêng lẻ (Mark for regeneration).

### 3.4. Popup Dashboard (`src/popup/Popup.tsx`)
- Khung giao diện chuẩn w-96 (~380px) cao cấp.
- Header với logo, nút đổi theme, nút đổi ngôn ngữ, nút mở cài đặt.
- Card trạng thái kết nối Gemini API.
- Card hiển thị tác vụ đang xử lý ngầm (nếu có tài liệu đang dịch dở).
- Nút bấm Hero CTA: `[ 🚀 Mở Studio Dịch thuật ]` để mở workspace tab.
- Danh sách 2 tài liệu gần nhất kèm nút tải PDF trực tiếp.

### 3.5. Trang Cài đặt (`src/settings/SettingsPage.tsx`)
- Bố cục thẻ rõ ràng:
  1. *Khóa API & Bảo mật:* Input mật mã có nút ẩn/hiện, lựa chọn Session/Local storage, link lấy key từ Google AI Studio.
  2. *Mô hình AI & Chất lượng:* Lựa chọn Model (Flash Image, Pro Image, Flash Lite), chất lượng ảnh (1K, 2K, 4K), ngôn ngữ nguồn/đích.
  3. *Hiệu năng:* Kích thước lô (Batch Size 1-20), chu kỳ thăm dò (Polling Interval 5-60s).
  4. *Quản lý dữ liệu:* Thống kê dung lượng đã lưu, nút xóa cache có xác nhận.
- Nút Lưu cài đặt có trạng thái phản hồi rõ ràng.

### 3.6. Module i18n siêu nhẹ (`src/lib/i18n.ts`)
- Từ điển từ khóa định kiểu (typed key-value dictionary) hỗ trợ tiếng Việt (`vi`) và tiếng Anh (`en`).
- Hook `useI18n()` cung cấp hàm dịch `t(key)` và hàm `toggleLanguage()`.
- Lưu trữ lựa chọn vào `localStorage`.

---

## 4. Kế hoạch Kiểm thử & Đảm bảo chất lượng

1. **Bộ test tự động:**
   - Đảm bảo toàn bộ 86 bài kiểm thử Node.js hiện có chạy thành công (`npm test`).
   - Cập nhật kỳ vọng kiểm thử trong `tests/gemini-jsonl.test.mjs` để phù hợp với định dạng `imageConfig` mới nhất.
2. **Kiểm tra TypeScript & Đóng gói:**
   - Chạy `npm run typecheck` (`tsc -b`) - không có lỗi type.
   - Chạy `npm run build` (`vite build`) - đóng gói thành công.
3. **Kiểm tra giao diện thực tế:**
   - Hoạt động trơn tru trên cả Light & Dark mode.
   - Chuyển đổi ngôn ngữ VI / EN mượt mà trên toàn bộ các chuỗi văn bản.
   - Kiểm tra kéo thả file PDF, thu phóng, phân trang, và đối chiếu 3 chế độ xem.
