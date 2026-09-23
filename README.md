# pdf2imgvi

Tiện ích mở rộng cho Chrome giúp dịch nội dung PDF sang tiếng Việt bằng Gemini và xuất kết quả thành PDF mới. Ứng dụng xử lý theo từng trang: bạn có thể chọn phạm vi cần dịch, xem kết quả, đánh dấu trang chưa đạt và chỉ tạo lại những trang đó.

## Tính năng

- Xem trước PDF và chọn trang bằng số hoặc phạm vi, chẳng hạn `1-3, 5, 8-10`.
- Dịch trang bằng Gemini Batch API; theo dõi tiến độ và tiếp tục kiểm tra các batch đang xử lý sau khi mở lại workspace.
- Lưu job và ảnh kết quả trong trình duyệt để xem lại mà không phải chạy dịch lần nữa.
- Bấm **×** cạnh một trang đã hoàn thành để đánh dấu cần tạo lại. **Retry Failed Pages** sẽ gửi lại trang đó cùng các trang bị lỗi.
- Tải PDF chứa các trang dịch thành công, theo đúng thứ tự trang gốc. Nếu còn trang lỗi, ứng dụng sẽ yêu cầu xác nhận trước khi xuất phần đã hoàn thành.

PDF xuất ra được ghép từ ảnh kết quả của Gemini; văn bản trong PDF mới không phải lớp chữ có thể chọn hoặc tìm kiếm.

## Cài đặt

Yêu cầu: Chrome, Node.js hỗ trợ chạy các test TypeScript của dự án (khuyến nghị Node.js 22 trở lên), npm và một Gemini API key có quyền sử dụng model ảnh/Batch API đã chọn.

```bash
npm ci
npm run build
```

Sau đó mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới thư mục `dist/` của dự án. Sau mỗi lần build lại, bấm **Reload** trên tiện ích để nhận bản mới.

## Sử dụng

1. Mở tiện ích và bấm **Open Translator**.
2. Vào **Settings**, nhập Gemini API key, chọn model và chất lượng ảnh đầu ra, rồi bấm **Save Changes**.
3. Quay lại **Translator**, bấm **Choose PDF** và chỉnh **Pages to translate** nếu chỉ muốn dịch một số trang.
4. Bấm **Start Translation**. Khi có kết quả, chọn **View** trong **Saved translations** để xem từng trang.
5. Nếu một trang đã hoàn thành nhưng kết quả chưa đạt, bấm **×** cạnh trang đó. Bấm **Retry Failed Pages** khi đã đánh dấu xong; nếu PDF gốc không còn mở, chọn lại tệp theo yêu cầu của ứng dụng.
6. Bấm **Download PDF** để lưu các trang đã dịch thành công.

**Retry Failed Pages** dùng lại model, ngôn ngữ và chất lượng đã lưu với job. Việc tạo lại cần gửi ảnh trang gốc đến Gemini lần nữa và có thể phát sinh chi phí API.

## Dữ liệu và quyền truy cập

- PDF gốc được mở trong trình duyệt; các trang đã chọn được render thành ảnh rồi tải trực tiếp lên Gemini để xử lý. Ứng dụng không tải toàn bộ tệp PDF lên máy chủ riêng.
- Job và ảnh dịch được lưu trong IndexedDB của trình duyệt. Có thể xóa chúng bằng **Settings → Clear Translation Cache** hoặc xóa từng job trong **Saved translations**.
- API key được lưu bằng `chrome.storage.local` hoặc `chrome.storage.session` theo lựa chọn trong Settings. Chế độ session không giữ key qua các phiên trình duyệt.
- Tiện ích yêu cầu quyền `storage`, `downloads` và quyền truy cập `generativelanguage.googleapis.com` để làm việc với Gemini.

## Phát triển

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` kiểm tra TypeScript rồi tạo tiện ích trong `dist/`. `npm run dev` khởi động Vite để phát triển giao diện; các thao tác dùng Chrome Extension API cần được kiểm tra trong tiện ích đã nạp vào Chrome.

Mã nguồn chính nằm trong `src/workspace/` (giao diện dịch), `src/services/` (render PDF, Gemini, khôi phục và xuất PDF), `src/storage/` (lưu trữ cục bộ) và `src/settings/` (cài đặt). Các kiểm tra tự động nằm trong `tests/`.

## Giới hạn hiện tại

- PDF có mật khẩu chưa được hỗ trợ.
- Chất lượng bố cục và chữ trong ảnh đầu ra phụ thuộc vào Gemini; nên xem lại từng trang trước khi tải PDF.
- Khi thử lại một job đã lưu, ứng dụng cần PDF gốc và kiểm tra tên tệp, kích thước cùng số trang trước khi gửi lại.

## Giấy phép

Dự án được phát hành theo giấy phép [MIT](LICENSE). Các bộ giải mã PDF đi kèm có giấy phép riêng trong `public/wasm/`.
