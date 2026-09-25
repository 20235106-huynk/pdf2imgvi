# UX/UI Redesign (Studio Workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the pdf2imgvi extension into a modern, 2-column "Studio Workspace" with Side-by-Side comparison, Dark/Light mode, VI/EN bilingual support, sleek Lucide iconography, and an upgraded Popup Quick Dashboard.

**Architecture:** Implement a lightweight typed i18n dictionary and theme manager in `src/lib/`. Refactor `App.tsx` into a modern header with API status badges and quick switches. Transform `PdfPreview.tsx` into a responsive visual viewport supporting original PDF canvas, translated image, and side-by-side comparison with zoom and pagination. Upgrade `TranslationPanel.tsx` into a 3-card Command Hub (Page Range Presets, Live Batch Progress, Saved Jobs & Export). Modernize `SettingsPage.tsx` with structured cards and `Popup.tsx` into a w-96 Quick Dashboard.

**Tech Stack:** React 19, Tailwind CSS v4, Lucide React, Radix UI / Shadcn, PDF.js, Dexie IndexedDB, TypeScript, Vite, Node.js test runner.

**Spec:** [`docs/superpowers/specs/2026-09-25-ux-ui-redesign-design.md`](file:///home/admin/Desktop/Learn/pdf2imgvi/docs/superpowers/specs/2026-09-25-ux-ui-redesign-design.md)

## Global Constraints

- Preserve all existing database schemas, service contracts, and batch translation algorithms without breaking changes.
- Ensure light/dark mode contrast meets WCAG AA standards (4.5:1 text contrast).
- All clickable elements must have clear focus rings, visible hover states, and cursor-pointer.
- Avoid external runtime i18n or state dependencies; use lightweight standard TypeScript modules and React hooks.
- Keep all unit and integration tests passing (`npm test`).

## Review Focus

1. **Side-by-side image blob memory leak:** When changing pages or view modes rapidly in the visual viewport, object URLs for translated images must be revoked cleanly to prevent browser tab bloat.
2. **Missing API key UX:** When no Gemini API key is configured, the user must see an actionable banner with deep navigation to Settings, and translation launch must be safely disabled.
3. **Empty / non-translated page in Side-by-Side view:** If a user navigates to a page that was not translated yet, the translated viewport must show a clear placeholder without breaking the original page preview.
4. **Theme synchronization in Tailwind v4:** Switching dark mode must add/remove the `.dark` class on `document.documentElement` and persist to `localStorage`.
5. **Language persistence:** Toggling between Vietnamese (`vi`) and English (`en`) must update all visible text labels instantly and persist across tab reloads.

---

### Task 1: Fix Baseline Test & Create i18n & Theme Modules

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/lib/theme.ts`
- Modify: `tests/gemini-jsonl.test.mjs:25-33`
- Create: `tests/i18n.test.mjs`
- Create: `tests/theme.test.mjs`

**Interfaces:**
- Consumes: `localStorage` (browser) or fallback
- Produces:
  - `src/lib/i18n.ts`: `type Language = "vi" | "en"`, `function t(key: I18nKey, lang?: Language): string`, `function getLanguage(): Language`, `function setLanguage(lang: Language): void`, `function useI18n(): { lang: Language; setLang: (l: Language) => void; t: (k: I18nKey) => string }`
  - `src/lib/theme.ts`: `type Theme = "light" | "dark"`, `function getTheme(): Theme`, `function setTheme(t: Theme): void`, `function toggleTheme(): Theme`, `function initTheme(): void`

- [ ] **Step 1: Fix test in `tests/gemini-jsonl.test.mjs` for native aspect ratio**

In `tests/gemini-jsonl.test.mjs`, update line 29:
```javascript
  assert.deepEqual(rows[0].request.generation_config.imageConfig, { imageSize: "1K" })
```

- [ ] **Step 2: Run test suite to verify all baseline tests pass**

Run: `npm test`
Expected: 86 passed, 0 failed.

- [ ] **Step 3: Write tests for `src/lib/i18n.ts` and `src/lib/theme.ts`**

Create `tests/i18n.test.mjs`:
```javascript
import assert from "node:assert/strict"
import test from "node:test"
import { t, setLanguage, getLanguage } from "../src/lib/i18n.ts"

test("i18n provides Vietnamese and English translations", () => {
  setLanguage("vi")
  assert.equal(getLanguage(), "vi")
  assert.equal(t("appTitle"), "pdf2imgvi")
  assert.equal(t("choosePdf"), "Chọn tệp PDF")

  setLanguage("en")
  assert.equal(getLanguage(), "en")
  assert.equal(t("choosePdf"), "Choose PDF")
})
```

Create `tests/theme.test.mjs`:
```javascript
import assert from "node:assert/strict"
import test from "node:test"
import { getTheme, setTheme, toggleTheme } from "../src/lib/theme.ts"

test("theme helper toggles between light and dark", () => {
  setTheme("light")
  assert.equal(getTheme(), "light")
  const next = toggleTheme()
  assert.equal(next, "dark")
  assert.equal(getTheme(), "dark")
})
```

- [ ] **Step 4: Implement `src/lib/i18n.ts` and `src/lib/theme.ts`**

Create `src/lib/i18n.ts` with complete dictionary translations for Workspace, Viewer, Hub, Settings, and Popup.
Create `src/lib/theme.ts` with DOM class manipulation and `localStorage` caching.

- [ ] **Step 5: Run tests to verify i18n and theme tests pass**

Run: `node --test tests/i18n.test.mjs tests/theme.test.mjs`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.ts src/lib/theme.ts tests/i18n.test.mjs tests/theme.test.mjs tests/gemini-jsonl.test.mjs
git commit -m "feat(core): add i18n, theme helpers and fix baseline test"
```

---

### Task 2: Redesign Navigation Header in `src/workspace/App.tsx`

**Files:**
- Modify: `src/workspace/App.tsx`
- Modify: `src/workspace/main.tsx` (ensure theme initialization)

**Interfaces:**
- Consumes:
  - `src/lib/i18n.ts`: `useI18n()`
  - `src/lib/theme.ts`: `getTheme()`, `toggleTheme()`, `initTheme()`
  - `src/storage/api-key.storage.ts`: `getApiKey()`
  - `lucide-react`: `Sparkles`, `FileText`, `SlidersHorizontal`, `Sun`, `Moon`, `Languages`, `CheckCircle2`, `AlertTriangle`
- Produces: Modern top navigation bar with brand icon, API Key status indicator, segmented view switcher, language switch, and theme toggle.

- [ ] **Step 1: Implement Theme initialization in `src/workspace/main.tsx`**

Ensure `initTheme()` is called at the root mount before React renders to prevent flash of wrong theme.

- [ ] **Step 2: Update `src/workspace/App.tsx` with modern Header**

Add:
- App logo with gradient `Sparkles` icon and `pdf2imgvi` typography.
- Status badge querying `getApiKey()`: Green pill (`API Ready` / `API Sẵn sàng`) or amber pill (`Chưa có Key` / `No Key` with click-to-settings handler).
- Segmented navigation with icons for `Translator` and `Settings`.
- Language toggle button `[ VI | EN ]` using `useI18n()`.
- Theme toggle button with `Sun` and `Moon` icons.

- [ ] **Step 3: Run typecheck to verify App.tsx compile cleanly**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/workspace/App.tsx src/workspace/main.tsx
git commit -m "feat(ui): modernize workspace header with status, theme, and language toggles"
```

---

### Task 3: Redesign Document & Visual Viewport in `src/workspace/PdfPreview.tsx`

**Files:**
- Modify: `src/workspace/PdfPreview.tsx`

**Interfaces:**
- Consumes:
  - `src/lib/i18n.ts`: `useI18n()`
  - `src/storage/results.storage.ts`: `getPageImage()`
  - `lucide-react`: `UploadCloud`, `FileUp`, `X`, `ZoomIn`, `ZoomOut`, `Maximize2`, `ChevronLeft`, `ChevronRight`, `SplitSquareVertical`, `FileText`, `Sparkles`, `Layers`
- Produces:
  - Empty state drag-and-drop dropzone.
  - Sticky viewport toolbar with document metadata, zoom controls, and 3-mode view switcher (`Original`, `Translated`, `Side-by-Side`).
  - Interactive stage supporting single canvas, translated image, or side-by-side view with synchronized page navigation and memory cleanup.

- [ ] **Step 1: Add Dropzone and Drag-and-Drop state to `PdfPreview.tsx`**

Handle `onDragOver`, `onDragLeave`, `onDrop` events on the file drop area, styled with dashed borders, hover highlights, and `UploadCloud` icon.

- [ ] **Step 2: Add 3-Mode View Switcher and Zoom Controls**

State: `viewMode: "original" | "translated" | "sideBySide"`
State: `zoomScale: number` (0.5 to 2.5, default 1.0)
Toolbar buttons: `[ Original ]` `[ Translated ]` `[ Side-by-Side ]`, Zoom In, Zoom Out, Reset.

- [ ] **Step 3: Implement Translated Image Loading for Current Page**

When `viewMode === "translated"` or `"sideBySide"`, query the latest completed translation job from Dexie for `pageNumber` using `getPageImage(jobId, pageNumber)`. Create object URL and revoke when switching pages.
If no translation exists for this page yet, render an informative placeholder card: *"Chưa có bản dịch cho trang này. Hãy chọn trang và bấm Bắt đầu dịch."*

- [ ] **Step 4: Implement Bottom Navigation Bar**

Add Previous/Next buttons with chevron icons, quick page jump input `Trang [ X ] / N`, and total selected status.

- [ ] **Step 5: Run typecheck and existing tests**

Run: `npm run typecheck && npm test`
Expected: Clean pass.

- [ ] **Step 6: Commit**

```bash
git add src/workspace/PdfPreview.tsx
git commit -m "feat(ui): redesign document viewport with drag-drop, side-by-side comparison, and zoom"
```

---

### Task 4: Redesign Control & Job Hub in `src/workspace/TranslationPanel.tsx`

**Files:**
- Modify: `src/workspace/TranslationPanel.tsx`

**Interfaces:**
- Consumes:
  - `src/lib/i18n.ts`: `useI18n()`
  - `lucide-react`: `Sparkles`, `Play`, `CheckCircle2`, `AlertCircle`, `Loader2`, `RotateCw`, `Download`, `Trash2`, `Eye`, `StopCircle`, `XCircle`
- Produces:
  - Card 1: Page range input with smart preset chips (`All`, `Current`, `1-5`), selection summary, and large `Start Translation` CTA button.
  - Card 2: Live Translation Progress card with gradient progress bar, stats counters, batch status pills, and cancel/stop polling buttons.
  - Card 3: Saved jobs library with compact cards, 1-click Download PDF, partial export confirm modal, Retry Failed Pages, and page regeneration.

- [ ] **Step 1: Restructure Card 1: Page Range & Start Controls**

Add preset chips: `[ Tất cả ]`, `[ Trang hiện tại ]`, `[ 5 trang đầu ]` that populate the page range string.
Format the Start button into a large, prominent primary CTA with `Sparkles` icon and animated spinner when starting.

- [ ] **Step 2: Restructure Card 2: Live Progress & Batch Monitoring**

Display a sleek gradient progress bar (`w-full h-3 rounded-full bg-secondary overflow-hidden`).
Display clean metric tags: `Hoàn thành (Xanh)`, `Đang dịch (Vàng)`, `Lỗi (Đỏ)`.
List active batches with pills. Include `Huỷ bỏ` and `Dừng kiểm tra ngầm` with appropriate icons.

- [ ] **Step 3: Restructure Card 3: Saved Jobs, Export, and Regeneration**

Display saved jobs in individual cards with metadata badges.
Style action buttons (`Download PDF`, `Retry`, `View`, `Delete`) with Lucide icons.
Maintain the partial confirm dialog and PDF file picker for retries.
When viewing saved pages, display interactive page status badges with regeneration trigger.

- [ ] **Step 4: Run test suite to verify no regressions in TranslationPanel functionality**

Run: `npm test`
Expected: All tests pass (including mock translation job and retry tests).

- [ ] **Step 5: Commit**

```bash
git add src/workspace/TranslationPanel.tsx
git commit -m "feat(ui): redesign translation panel into a 3-card control hub"
```

---

### Task 5: Redesign Settings Page in `src/settings/SettingsPage.tsx`

**Files:**
- Modify: `src/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes:
  - `src/lib/i18n.ts`: `useI18n()`
  - `lucide-react`: `Key`, `Eye`, `EyeOff`, `Cpu`, `Zap`, `Database`, `Save`, `Check`, `ExternalLink`, `Trash2`
- Produces:
  - 4 structured setting cards (API Key & Security, AI Models & Quality, Batch Performance, Storage & Cache).
  - Password visibility toggle for API key.
  - Visual model options with descriptions and recommended badges.
  - Sticky save bar with animated feedback.

- [ ] **Step 1: Refactor Settings layout into 4 cards**

Group settings into:
1. `Card 1: Khóa API & Bảo mật`: API key input with eye toggle button, storage mode selector (session vs local), link to Google AI Studio.
2. `Card 2: Mô hình AI & Chất lượng`: Gemini model selector with badge descriptions, quality selector (1K/2K/4K), source/target language options.
3. `Card 3: Hiệu năng & Xử lý theo lô`: Batch size and polling interval inputs with helper descriptions.
4. `Card 4: Quản lý bộ nhớ tạm`: Stats on saved documents/pages and Clear Cache button with confirmation.

- [ ] **Step 2: Add Sticky Save Bar & Feedback**

Bottom sticky card with `Save Settings` button, loading spinner, and dismissible success toast/alert.

- [ ] **Step 3: Run typecheck and test suite**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/settings/SettingsPage.tsx
git commit -m "feat(ui): redesign settings page with structured cards and key visibility"
```

---

### Task 6: Redesign Popup into Quick Dashboard in `src/popup/Popup.tsx`

**Files:**
- Modify: `src/popup/Popup.tsx`
- Modify: `popup.html` (ensure dimensions and font)

**Interfaces:**
- Consumes:
  - `src/lib/i18n.ts`: `useI18n()`
  - `src/lib/theme.ts`: `initTheme()`, `toggleTheme()`, `getTheme()`
  - `src/storage/api-key.storage.ts`: `getApiKey()`
  - `src/storage/results.storage.ts`: `listJobs()`
  - `lucide-react`: `Sparkles`, `ExternalLink`, `SlidersHorizontal`, `Sun`, `Moon`, `FileText`, `CheckCircle2`, `AlertTriangle`, `Download`
- Produces: Modern `w-96` (~380px) Quick Dashboard with connection status, recent documents, active job tracker, and hero CTA.

- [ ] **Step 1: Update `popup.html` and root container**

Configure minimum width to 380px (`w-96`) and clean background.

- [ ] **Step 2: Implement Quick Dashboard in `src/popup/Popup.tsx`**

Add:
- Header with logo, theme toggle, and settings direct-open button.
- Status badge for Gemini API Key.
- Hero CTA button `[ Mở Studio Dịch thuật ]` to send `OPEN_WORKSPACE`.
- Recent documents list (up to 2 recent jobs) with direct PDF download button.

- [ ] **Step 3: Run typecheck and test suite**

Run: `npm run typecheck && npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/popup/Popup.tsx popup.html
git commit -m "feat(ui): upgrade popup into a modern quick dashboard"
```

---

### Task 7: Full System Verification & Build Validation

**Files:**
- All modified files
- Verification commands

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 100% tests passing.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run Vite build**

Run: `npm run build`
Expected: Build succeeds with output in `dist/`.

- [ ] **Step 4: Verify extension packaging and manifest assets**

Check `dist/popup.html`, `dist/workspace.html`, `dist/manifest.json`.

- [ ] **Step 5: Final Git Status check and commit**

Verify working directory is clean.
