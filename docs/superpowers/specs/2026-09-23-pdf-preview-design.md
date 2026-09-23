# pdf2imgvi PDF Preview Design

## Goal

Make **Choose PDF** in the workspace open a local PDF and display one page at a time. This is a visual preview only: no translation, extraction, export, background job, or persistence.

## User Flow

1. In the Translator view, choose a local PDF with a native file input (`accept=".pdf,application/pdf"`). Canceling the picker leaves the current preview unchanged.
2. Show the selected filename and a loading state while PDF.js opens it. The input hint is not trusted as validation; PDF.js must successfully parse the file.
3. Render page 1 on a canvas. Show **Page X of Y** and **Previous**/**Next** controls. Keep controls within page bounds and render only the current page.
4. **Choose PDF** remains available to replace the document, including by selecting the same file again.
5. Switching between Translator and Settings within the open workspace tab preserves the selected preview. Reloading or closing the tab discards it and requires choosing the file again.

The preview displays the visual page. Selectable text, search, hyperlinks, forms, zoom controls, and thumbnails are out of scope.

## Components and Data Flow

Add a small preview component in `src/workspace/` and use it from the existing Translator view in `App.tsx`. Keep the Translator view mounted while Settings is shown so its in-memory PDF state survives local navigation. No router or new extension page is needed.

Use the installed `pdfjs-dist` display API. Configure its own worker from a Vite-bundled local worker URL; do not create a custom Web Worker or fetch code from a CDN. Create an object URL for the selected `File`, pass that URL to PDF.js, and retain it until the document is replaced or the workspace unloads. This avoids an eager `File.arrayBuffer()` copy in application code, although PDF.js will still use memory to parse the document. Revoke the object URL when no longer needed.

The PDF document and current page number live only in the workspace tab. Obtain one page with `getPage(pageNumber)` and render it to a single responsive canvas. Size the canvas for legibility while capping render resolution so unusually large pages do not allocate an unbounded bitmap. Do not render or cache every page.

## Cancellation and Errors

Replacing a file, changing pages, or unmounting cancels any active render. Replacing a file also destroys the previous PDF.js loading/document task and releases its object URL. Ignore late results from obsolete asynchronous operations so an older page cannot overwrite the latest selection.

Show a short recoverable error for an unreadable, invalid, corrupt, or password-protected PDF. A failed replacement clears the old preview and leaves **Choose PDF** usable. A page-render failure shows an error without crashing the workspace. No filename or file contents are logged or sent over the network.

## Build and Verification

The production build must emit the PDF.js worker as a local asset referenced by the workspace bundle. `manifest.json` keeps its existing `storage` and `downloads` permissions with no host permissions.

Run TypeScript checks, the production build, and the existing tests. Extend build checks to confirm the worker asset and preview UI are emitted. Manual verification in a loaded extension should cover a valid multi-page PDF, Previous/Next boundaries, replacing a file, picker cancellation, an invalid file, switching to Settings and back, and tab reload. If a browser is unavailable, report that manual check as unverified rather than claiming it passed.

## Out of Scope

Do not add IndexedDB, Dexie usage, storage of the PDF, scheduler, queue, offscreen document, notifications, new permissions, translation API, OCR, or PDF export. Durable processing after the workspace closes is a separate future feature.
