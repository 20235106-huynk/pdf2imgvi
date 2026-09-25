import { useEffect, useState } from "react"

export type Language = "vi" | "en"

const STORAGE_KEY = "pdf2imgvi_lang"

const translations = {
  vi: {
    appTitle: "pdf2imgvi",
    appSubtitle: "Dịch tài liệu PDF sang Tiếng Việt",
    apiReady: "API Sẵn sàng",
    noApiKey: "Chưa cấu hình API Key",
    studio: "Studio Dịch thuật",
    settings: "Cài đặt",
    lightMode: "Giao diện Sáng",
    darkMode: "Giao diện Tối",
    language: "Ngôn ngữ",

    // Viewer
    dropzoneTitle: "Kéo thả tệp PDF vào đây, hoặc nhấp để chọn",
    dropzoneHint: "Hỗ trợ mọi tài liệu PDF. Giữ nguyên bố cục trang và chuyển ngữ sang tiếng Việt.",
    choosePdf: "Chọn tệp PDF",
    changePdf: "Đổi tệp PDF",
    removePdf: "Gỡ bỏ PDF",
    pageCount: "Trang {current} / {total}",
    viewOriginal: "Trang gốc (PDF)",
    viewTranslated: "Bản dịch (VI)",
    viewSideBySide: "So sánh song song",
    originalDoc: "Tài liệu gốc",
    translatedDoc: "Bản dịch Tiếng Việt",
    noTranslationYet: "Trang này chưa có bản dịch.",
    clickToTranslate: "Hãy chọn trang và bấm Bắt đầu dịch để xử lý.",
    zoomIn: "Phóng to",
    zoomOut: "Thu nhỏ",
    resetZoom: "Mặc định",
    prevPage: "Trang trước",
    nextPage: "Trang sau",
    jumpToPage: "Đến trang",
    loadingPdf: "Đang tải PDF…",
    renderingPage: "Đang kết xuất trang…",
    pdfError: "Không thể mở tệp PDF này. Vui lòng chọn tệp khác.",
    passwordProtected: "Tệp PDF có mật khẩu, chưa thể xem trước.",

    // Hub & Translation
    pagesToTranslate: "Dải trang cần dịch",
    pageSelectionHelp: "Dùng khoảng hoặc số trang, ví dụ: 1-3, 5, 8-10",
    presetAll: "Tất cả các trang",
    presetCurrent: "Trang hiện tại",
    presetFirst5: "5 trang đầu",
    pagesSelected: "{count} trang đã chọn",
    startTranslation: "Bắt đầu dịch sang Tiếng Việt",
    starting: "Đang khởi tạo…",
    cancelTranslation: "Huỷ bỏ tác vụ",
    cancelling: "Đang huỷ…",
    stopPolling: "Dừng kiểm tra ngầm",
    inProgress: "Đang dịch tài liệu",
    liveProgress: "Tiến trình trực tiếp",
    completed: "Hoàn thành",
    processing: "Đang xử lý",
    failed: "Thất bại",
    cancelled: "Đã huỷ",
    batches: "Lô Gemini",
    savedTranslations: "Thư viện bản dịch",
    downloadPdf: "Tải về PDF",
    preparingPdf: "Đang tạo file PDF…",
    resume: "Tiếp tục theo dõi",
    resuming: "Đang tiếp tục…",
    retryFailed: "Thử lại trang lỗi",
    retrying: "Đang thử lại…",
    view: "Xem lại",
    delete: "Xoá",
    markRegenerate: "Tạo lại trang này",
    apiKeyRequiredPrompt: "Cần có Gemini API Key để dịch, khôi phục hoặc thử lại.",
    openSettings: "Mở Cài đặt",
    selectOriginalPdfPrompt: "Vui lòng chọn tệp PDF gốc ({fileName}, {totalPages} trang) để thử lại các trang lỗi.",
    partialExportTitle: "Một số trang bị lỗi dịch",
    partialExportPrompt: "{completedCount} trang hoàn tất, {failedCount} trang thất bại. Bạn có muốn xuất {completedCount} trang thành công không?",
    exportAnyway: "Xuất {count} trang",
    cancel: "Huỷ",

    // Settings
    settingsTitle: "Cài đặt",
    settingsDesc: "Cấu hình mô hình Gemini AI, chất lượng hình ảnh và tùy chọn xử lý lô.",
    apiKeySection: "Khóa API & Bảo mật",
    apiKeyLabel: "Khóa Google Gemini API",
    apiKeyHelp: "Lấy khóa API miễn phí tại Google AI Studio.",
    storageMode: "Chế độ lưu trữ khóa",
    localStorage: "Cục bộ (Lưu trên trình duyệt)",
    sessionStorage: "Phiên làm việc (Xóa khi đóng trình duyệt)",
    aiModelSection: "Mô hình AI & Chất lượng hiển thị",
    modelLabel: "Mô hình Gemini",
    qualityLabel: "Độ phân giải bản dịch",
    sourceLang: "Ngôn ngữ nguồn",
    targetLang: "Ngôn ngữ đích",
    performanceSection: "Hiệu năng & Xử lý theo lô",
    batchSize: "Kích thước mỗi lô",
    batchSizeHelp: "Số lượng trang gửi trong mỗi lô (1-20). Lô lớn tiết kiệm thời gian chờ.",
    pollingInterval: "Chu kỳ kiểm tra kết quả",
    pollingHelp: "Tần suất kiểm tra máy chủ Gemini xem lô đã hoàn thành chưa.",
    storageSection: "Quản lý bộ nhớ lưu trữ",
    clearCache: "Xóa toàn bộ bộ nhớ tạm",
    clearCacheHelp: "Xóa toàn bộ các bản dịch và hình ảnh đã lưu trong cơ sở dữ liệu IndexedDB.",
    clearCacheConfirm: "Bạn có chắc chắn muốn xóa toàn bộ bản dịch đã lưu? Thao tác này không thể hoàn tác.",
    cacheCleared: "Đã xóa toàn bộ bộ nhớ tạm thành công.",
    saveSettings: "Lưu cài đặt",
    saving: "Đang lưu…",
    saved: "Đã lưu cài đặt thành công",
    saveError: "Không thể lưu cài đặt. Vui lòng thử lại.",

    // Popup
    quickDashboard: "Bảng điều khiển nhanh",
    openStudio: "Mở Studio Dịch thuật",
    openStudioDesc: "Không gian làm việc toàn màn hình với đối chiếu song song và xuất PDF",
    recentDocs: "Tài liệu gần đây",
    noRecentDocs: "Chưa có bản dịch nào gần đây",
  },
  en: {
    appTitle: "pdf2imgvi",
    appSubtitle: "Translate PDFs to Vietnamese",
    apiReady: "API Ready",
    noApiKey: "Missing API Key",
    studio: "Translation Studio",
    settings: "Settings",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    language: "Language",

    // Viewer
    dropzoneTitle: "Drag & drop your PDF file here, or click to browse",
    dropzoneHint: "Supports all standard PDF documents. Preserves layout with AI image translation.",
    choosePdf: "Choose PDF",
    changePdf: "Change PDF",
    removePdf: "Remove PDF",
    pageCount: "Page {current} of {total}",
    viewOriginal: "Original (PDF)",
    viewTranslated: "Translated (VI)",
    viewSideBySide: "Side-by-Side",
    originalDoc: "Original Document",
    translatedDoc: "Vietnamese Translation",
    noTranslationYet: "This page hasn't been translated yet.",
    clickToTranslate: "Select pages and click Start Translation to translate.",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetZoom: "Reset",
    prevPage: "Previous",
    nextPage: "Next",
    jumpToPage: "Go to",
    loadingPdf: "Loading PDF…",
    renderingPage: "Rendering page…",
    pdfError: "Could not open this PDF. Choose another file.",
    passwordProtected: "This PDF requires a password and cannot be previewed yet.",

    // Hub & Translation
    pagesToTranslate: "Pages to translate",
    pageSelectionHelp: "Use ranges or individual pages, e.g. 1-3, 5, 8-10.",
    presetAll: "All Pages",
    presetCurrent: "Current Page",
    presetFirst5: "First 5 Pages",
    pagesSelected: "{count} page(s) selected",
    startTranslation: "Start Translation",
    starting: "Starting…",
    cancelTranslation: "Cancel Translation",
    cancelling: "Cancelling…",
    stopPolling: "Stop Polling",
    inProgress: "Translation in progress",
    liveProgress: "Live Progress",
    completed: "Completed",
    processing: "Processing",
    failed: "Failed",
    cancelled: "Cancelled",
    batches: "Batches",
    savedTranslations: "Saved translations",
    downloadPdf: "Download PDF",
    preparingPdf: "Preparing PDF…",
    resume: "Resume",
    resuming: "Resuming…",
    retryFailed: "Retry Failed Pages",
    retrying: "Retrying…",
    view: "View",
    delete: "Delete",
    markRegenerate: "Regenerate this page",
    apiKeyRequiredPrompt: "Gemini API key is required to translate, resume, or retry.",
    openSettings: "Open Settings",
    selectOriginalPdfPrompt: "Please select the original PDF ({fileName}, {totalPages} pages) to retry failed pages.",
    partialExportTitle: "Some pages failed to translate",
    partialExportPrompt: "{completedCount} pages completed, {failedCount} pages failed. Export the {completedCount} successful pages anyway?",
    exportAnyway: "Export {count} pages",
    cancel: "Cancel",

    // Settings
    settingsTitle: "Settings",
    settingsDesc: "Configure your Gemini AI model, image quality, and batch preferences.",
    apiKeySection: "API Key & Security",
    apiKeyLabel: "Gemini API Key",
    apiKeyHelp: "Get a free API key at Google AI Studio.",
    storageMode: "API Key Storage Mode",
    localStorage: "Local (saved on this browser)",
    sessionStorage: "Session only (cleared when browser closes)",
    aiModelSection: "AI Models & Output Quality",
    modelLabel: "Gemini Model",
    qualityLabel: "Output Image Resolution",
    sourceLang: "Source Language",
    targetLang: "Target Language",
    performanceSection: "Performance & Batching",
    batchSize: "Batch Size",
    batchSizeHelp: "Number of pages sent in one batch (1-20). Larger batches save queue time.",
    pollingInterval: "Polling Interval",
    pollingHelp: "How often to check Gemini for batch completion.",
    storageSection: "Storage & Cache",
    clearCache: "Clear Cache",
    clearCacheHelp: "Delete all cached translations and rendered page images in IndexedDB.",
    clearCacheConfirm: "Are you sure you want to delete all saved translations? This cannot be undone.",
    cacheCleared: "All cached translations cleared.",
    saveSettings: "Save Settings",
    saving: "Saving…",
    saved: "Settings saved successfully",
    saveError: "Could not save settings. Please try again.",

    // Popup
    quickDashboard: "Quick Dashboard",
    openStudio: "Open Translation Studio",
    openStudioDesc: "Full-screen workspace with side-by-side comparison and PDF export",
    recentDocs: "Recent Documents",
    noRecentDocs: "No recent translations yet",
  },
} as const

export type I18nKey = keyof typeof translations.vi

let currentLang: Language = (typeof localStorage !== "undefined" && (localStorage.getItem(STORAGE_KEY) as Language)) || "vi"

const listeners = new Set<(lang: Language) => void>()

export function getLanguage(): Language {
  return currentLang
}

export function setLanguage(lang: Language): void {
  currentLang = lang
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang)
  }
  for (const listener of listeners) {
    listener(lang)
  }
}

export function toggleLanguage(): Language {
  const next = currentLang === "vi" ? "en" : "vi"
  setLanguage(next)
  return next
}

export function t(key: I18nKey, params?: Record<string, string | number>, lang?: Language): string {
  const activeLang = lang ?? currentLang
  const text = (translations[activeLang] as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key
  if (!params) return text
  return Object.entries(params).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), text)
}

export function useI18n() {
  const [lang, setLangState] = useState<Language>(getLanguage)

  useEffect(() => {
    const handler = (newLang: Language) => setLangState(newLang)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return {
    lang,
    setLanguage,
    toggleLanguage,
    t: (key: I18nKey, params?: Record<string, string | number>) => t(key, params, lang),
  }
}
