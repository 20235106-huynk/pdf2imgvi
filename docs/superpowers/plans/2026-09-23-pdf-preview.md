# PDF Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make **Choose PDF** open a local PDF and preview one page at a time in the workspace.

**Architecture:** A `PdfPreview` React component owns the selected file's object URL, PDF.js loading task, current document/page, and canvas render task. PDF.js's worker is bundled locally by Vite. A pure scale helper limits canvas memory; the Translator view stays mounted while Settings is visible so the preview survives in-tab navigation.

**Tech Stack:** React 19, TypeScript strict, Vite 8, `pdfjs-dist` 6, Node 24 built-in test runner, Chrome Extension Manifest V3.

**Spec:** `docs/superpowers/specs/2026-09-23-pdf-preview-design.md`

## Global Constraints

- Keep `manifest.json` permissions at exactly `storage` and `downloads`; add no host permissions, dependencies, or external worker URL.
- The PDF and page state are in memory only; no IndexedDB, Dexie, background processing, notifications, translation, or export.
- Use the native file input with `accept=".pdf,application/pdf"`; only successful PDF.js parsing validates the file.
- Preserve existing uncommitted changes to `.gitignore` and `src/types/settings.ts`; do not stage them.
- The workspace keeps the current Settings view and popup behavior unchanged.

## File Map

- `src/workspace/preview-scale.ts`: pure calculation of CSS and canvas render scale with an 8-million-pixel bitmap ceiling.
- `tests/preview-scale.test.mjs`: focused scale/memory tests.
- `src/workspace/PdfPreview.tsx`: file selection, PDF.js lifecycle, one-page canvas render, navigation, and errors.
- `src/workspace/App.tsx`: mount the preview in the Translator view and retain it while Settings is shown.
- `tests/build.test.mjs`: ensure the worker and preview copy ship in `dist`; remove the stale assertion for a specific model label, which is unrelated to build integrity.

## Review Focus

These user-visible cases must be checked in Task 2's manual verification, except the last case, which Task 1 tests automatically:

1. Canceling the file picker must leave an already loaded PDF and page unchanged.
2. Selecting the same PDF again must start a fresh load, not be ignored by the input.
3. An invalid or password-protected PDF must show an error and keep **Choose PDF** usable.
4. Rapid page/file changes must never let an obsolete render replace the latest page.
5. An unusually tall page or high device-pixel ratio must stay under the canvas pixel ceiling.

---

### Task 1: Bound preview canvas size

**Files:**
- Create: `src/workspace/preview-scale.ts`
- Test: `tests/preview-scale.test.mjs`

**Interfaces:**
- Consumes: page dimensions from `PDFPageProxy.getViewport({ scale: 1 })` and `window.devicePixelRatio`.
- Produces: `getPreviewScales(width: number, height: number, devicePixelRatio: number): { cssScale: number; renderScale: number }`; Task 2 uses both scales.

- [ ] **Step 1: Write the failing test** in `tests/preview-scale.test.mjs`:

```js
import assert from "node:assert/strict"
import test from "node:test"

import { getPreviewScales, MAX_PREVIEW_PIXELS } from "../src/workspace/preview-scale.ts"

test("ordinary pages stay readable without exceeding the bitmap cap", () => {
  const { cssScale, renderScale } = getPreviewScales(612, 792, 2)
  assert.ok(612 * cssScale <= 900)
  assert.ok(renderScale >= cssScale)
  assert.ok(612 * 792 * renderScale ** 2 <= MAX_PREVIEW_PIXELS)
})

test("very tall pages and extreme device ratios stay bounded", () => {
  const { cssScale, renderScale } = getPreviewScales(612, 10000, 5)
  assert.ok(612 * cssScale <= 900)
  assert.ok(612 * 10000 * renderScale ** 2 <= MAX_PREVIEW_PIXELS)
  assert.ok(renderScale < cssScale * 5)
})
```

- [ ] **Step 2: Run the red test.** Run `node --test tests/preview-scale.test.mjs`; expect a missing-module failure.

- [ ] **Step 3: Add the minimal helper** in `src/workspace/preview-scale.ts`:

```ts
export const MAX_PREVIEW_PIXELS = 8_000_000

export function getPreviewScales(width: number, height: number, devicePixelRatio: number) {
  const pageWidth = Math.max(1, width)
  const pageHeight = Math.max(1, height)
  const cssScale = Math.min(2, 900 / pageWidth)
  const pixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.min(2, Math.max(1, devicePixelRatio))
    : 1
  const renderScale = Math.min(
    cssScale * pixelRatio,
    Math.sqrt(MAX_PREVIEW_PIXELS / (pageWidth * pageHeight)),
  )
  return { cssScale, renderScale }
}
```

- [ ] **Step 4: Run the green test.** Run `node --test tests/preview-scale.test.mjs` and `npm run typecheck`; both must pass.
- [ ] **Step 5: Commit only these two files:** `git add src/workspace/preview-scale.ts tests/preview-scale.test.mjs && git commit -m "feat: bound PDF preview canvas size"`.

### Task 2: Choose and preview PDF pages

**Files:**
- Create: `src/workspace/PdfPreview.tsx`
- Modify: `src/workspace/App.tsx`
- Modify: `tests/build.test.mjs`

**Interfaces:**
- Consumes: `getPreviewScales` from Task 1; existing shadcn `Button`; `pdfjs-dist` `getDocument`, `GlobalWorkerOptions`, `PasswordException`, and its `PDFDocumentLoadingTask`, `PDFDocumentProxy`, `RenderTask` types.
- Produces: `PdfPreview(): React.JSX.Element` (inferred return type); `App` renders it in the Translator view.

- [ ] **Step 1: Extend the failing build test.** In `tests/build.test.mjs`, remove the stale `"Nano Banana Lite 2"` entry from the emitted-copy list, add `"Previous"` and `"Next"`, and after reading `assetNames` add:

```js
const workerAsset = assetNames.find((name) => /^pdf\.worker\.min-.+\.mjs$/.test(name))
assert.ok(workerAsset, "PDF.js worker must be emitted locally")
assert.ok(javascript.includes(workerAsset), "workspace bundle must reference the local worker")
```

Place the `javascript.includes` assertion after `javascript` is defined. Run `npm run build && node --test tests/build.test.mjs`; expect failure because no PDF.js worker or navigation UI exists yet.

- [ ] **Step 2: Add the PDF preview component** in `src/workspace/PdfPreview.tsx`. It owns the native input, local PDF.js worker URL, document and render task lifecycles, navigation, and recoverable errors. Use this complete implementation as the starting point; refine only if TypeScript or browser verification exposes a concrete issue.

```tsx
import { useEffect, useRef, useState, type ChangeEvent } from "react"
import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

import { Button } from "@/components/ui/button"
import { getPreviewScales } from "./preview-scale"

GlobalWorkerOptions.workerSrc = workerUrl

export function PdfPreview() {
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const [fileName, setFileName] = useState("")
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState("")

  function releaseCurrent() {
    renderTaskRef.current?.cancel()
    if (loadingTaskRef.current) void loadingTaskRef.current.destroy().catch(() => {})
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    loadingTaskRef.current = null
    objectUrlRef.current = null
  }

  useEffect(() => () => {
    generationRef.current += 1
    releaseCurrent()
  }, [])

  async function openFile(file: File) {
    const generation = ++generationRef.current
    releaseCurrent()
    setPdf(null)
    setPageNumber(1)
    setFileName(file.name)
    setError("")
    setLoading(true)

    let url: string | null = null
    let task: PDFDocumentLoadingTask | null = null
    try {
      url = URL.createObjectURL(file)
      task = getDocument({ url })
      objectUrlRef.current = url
      loadingTaskRef.current = task
      const loaded = await task.promise
      if (generation === generationRef.current) setPdf(loaded)
    } catch (cause) {
      if (generation !== generationRef.current) return
      setError(cause instanceof PasswordException
        ? "This PDF requires a password and cannot be previewed yet."
        : "Could not open this PDF. Choose another file.")
      if (task) void task.destroy().catch(() => {})
      if (url) URL.revokeObjectURL(url)
      loadingTaskRef.current = null
      objectUrlRef.current = null
    } finally {
      if (generation === generationRef.current) setLoading(false)
    }
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void openFile(file)
  }

  useEffect(() => {
    if (!pdf) return
    const canvas = canvasRef.current
    if (!canvas) return
    const generation = generationRef.current
    let active = true
    setRendering(true)
    setError("")

    async function renderPage() {
      const previous = renderTaskRef.current
      if (previous) {
        previous.cancel()
        await previous.promise.catch(() => {})
        if (renderTaskRef.current === previous) renderTaskRef.current = null
      }
      if (!active || generation !== generationRef.current) return

      const page = await pdf.getPage(pageNumber)
      if (!active || generation !== generationRef.current) return
      const base = page.getViewport({ scale: 1 })
      const { cssScale, renderScale } = getPreviewScales(
        base.width, base.height, window.devicePixelRatio,
      )
      const viewport = page.getViewport({ scale: renderScale })
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      canvas.style.width = `${Math.ceil(base.width * cssScale)}px`
      canvas.style.height = `${Math.ceil(base.height * cssScale)}px`
      const task = page.render({ canvas, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null
      }
      if (active && generation === generationRef.current) setRendering(false)
    }

    void renderPage().catch(() => {
      if (active && generation === generationRef.current) {
        setRendering(false)
        setError("Could not render this page.")
      }
    })
    return () => {
      active = false
      renderTaskRef.current?.cancel()
    }
  }, [pdf, pageNumber])

  return (
    <main className={`mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center gap-4 p-6 text-center ${pdf ? "justify-start" : "justify-center"}`}>
      <h1 className="text-3xl font-semibold">pdf2imgvi</h1>
      <p className="text-muted-foreground">Translate PDFs to Vietnamese</p>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf"
        className="sr-only" tabIndex={-1} aria-label="Choose PDF file"
        onChange={pickFile} />
      <Button type="button" onClick={() => inputRef.current?.click()}>Choose PDF</Button>
      {fileName && <p className="max-w-full break-all text-sm">{fileName}</p>}
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {loading ? "Loading PDF…" : rendering ? "Rendering page…" : ""}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pdf && (
        <>
          <div className="flex items-center gap-4">
            <Button type="button" variant="outline"
              disabled={rendering || pageNumber === 1}
              onClick={() => setPageNumber((page) => page - 1)}>Previous</Button>
            <span>Page {pageNumber} of {pdf.numPages}</span>
            <Button type="button" variant="outline"
              disabled={rendering || pageNumber === pdf.numPages}
              onClick={() => setPageNumber((page) => page + 1)}>Next</Button>
          </div>
          <canvas ref={canvasRef} role="img"
            aria-label={`Preview of page ${pageNumber} of ${pdf.numPages}`}
            className="mx-auto max-w-full rounded border bg-white shadow-sm" />
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Wire the workspace** by adding `import { PdfPreview } from "./PdfPreview"` to `src/workspace/App.tsx` and replacing only the Translator branch of the current view ternary. Keeping the wrapper mounted preserves the selected document while Settings is open:

```tsx
<div hidden={view !== "translator"}>
  <PdfPreview />
</div>
{view === "settings" && <SettingsPage />}
```

- [ ] **Step 4: Run the green checks.** Run `npm run typecheck`, `npm run build`, `node --test tests/build.test.mjs`, and `npm test`. The preview checks must pass. If the pre-existing uncommitted `src/types/settings.ts` edit causes unrelated settings-model expectations to fail, report that separately; do not silently change the user's file or claim the full suite passed.
- [ ] **Step 5: Verify manually if a browser is available.** Load `dist` unpacked and open the workspace. Use a valid multi-page PDF to check that page 1 appears, **Previous** is disabled there, **Next** reaches the last page, and **Next** is disabled there. Cancel the picker from page 2 and confirm page 2 remains. Select the same file again and confirm it returns to page 1. Select an invalid PDF and a password-protected PDF and confirm each shows a recoverable error. Replace a file or navigate quickly during rendering and confirm the latest selection/page wins. Switch to Settings and back and confirm the preview remains; reload the tab and confirm it clears. If no browser is available, record these checks as not run.
- [ ] **Step 6: Commit only this task's files:** `git add src/workspace/PdfPreview.tsx src/workspace/App.tsx tests/build.test.mjs && git commit -m "feat: preview selected PDF one page at a time"`.

### Final Verification

- [ ] Run `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, and `git status --short` on the final worktree.
- [ ] Inspect `dist/manifest.json` for unchanged permissions and `dist/assets/` for a local PDF.js worker.
- [ ] Report any unrelated baseline test failures and unavailable browser checks explicitly. Preserve `.gitignore` and `src/types/settings.ts` user edits.
