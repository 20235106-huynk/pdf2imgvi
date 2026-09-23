# pdf2imgvi Gemini Batch Translation Design

## Goal and scope

Translate the user-selected pages of a local PDF into Vietnamese page images with Gemini Batch API. The workspace shows progress and the completed images; it does not assemble or export a PDF. The input PDF stays in the open workspace tab and is not persisted. This is a Gemini-only flow with no backend, other providers, automatic retry, pause/resume, or translation/polling after the workspace closes. The service worker may still make a one-off cancellation attempt on tab close.

The user chose JSONL through Gemini Files API, minimal IndexedDB storage for completed image Blobs, a deliberate **Cancel Translation** control, and best-effort automatic cancellation when the workspace tab closes. A submitted Gemini job may take up to 24 hours; closing the tab is **not** proof of cancellation.

## Settings and permissions

Keep API key storage separate from `AppSettings`, using the existing local/session choice. Migrate the current settings to `geminiModel`, `sourceLanguage`, `targetLanguage`, `quality`, `batchSize`, `pollingIntervalMs`, `outputFilenameTemplate`, and `apiKeyStorageMode`. Remove the now-misleading concurrency and retry controls. Existing saved settings should normalize safely: use the current Gemini `modelId` where valid, otherwise the supported default; use defaults for new batch settings. Do not log or embed the API key in job records or URLs.

Model options live in one constant list, not JSX. The selected model must support image generation and Batch API. Keep the existing Gemini image model options, validate the selection against the list, and use one default. Default language target is Vietnamese; quality continues to select the existing PDF render scale. Batch size and polling interval have bounded, validated inputs; initial defaults are 5 pages and 3 seconds. The extension declares only the narrow `https://generativelanguage.googleapis.com/*` host permission in addition to its existing permissions.

## Components and data flow

Reuse `parsePageRange` and `renderPdfPage`; do not put parsing, Gemini requests, or batch orchestration inside React. The Translator view owns the selected PDF and starts one translation run at a time. Snapshot settings and API key at start, reject an absent key or invalid page range, and disable PDF replacement/range editing while a run is active. Navigation to Settings within the same tab may leave the run active, but setting changes apply only to future runs.

The job service splits selected page numbers by `batchSize`. For each group, render one page at a time to a Blob, upload its image through Gemini Files API, and release the local rendered Blob after its upload is no longer needed. Build one JSONL request file for the group using a stable per-page key containing the local job ID and page number. Each request references its uploaded image's `file_uri`, uses the selected Gemini model and a single shared prompt to translate the text to the target language while preserving page layout, figures, tables, and formulas, and requests image output. Upload the JSONL file and submit the Gemini Batch job. Submit groups sequentially to bound local memory; do not wait for a group's completion before submitting the next one.

After submission, poll nonterminal Gemini batch IDs at `pollingIntervalMs` while the workspace remains open. A successful batch exposes output JSONL; map each result by its stable key, never by output order. Decode a returned image into a Blob and store it with local job ID and page number in Dexie. Keep only lightweight job metadata needed to find completed images after reopening the workspace; do not store the source PDF, rendered input pages, API key, or a resumable queue. Reopening displays saved completed images but does not resume polling, submission, or translation. Gemini input files may remain on Google's Files API until its normal expiry; this iteration does not promise remote file deletion.

The UI adds **Start Translation**, progress counts for completed/failed/cancelled pages and batch states, **Cancel Translation**, and a minimal display of completed page images. Keep the existing one-page PDF preview and Test Render. One active run per workspace tab is enough; no scheduler or concurrency control is introduced.

## Job state and cancellation

Track page states `pending`, `rendering`, `queued`, `processing`, `completed`, `failed`, and `cancelled`. Track Gemini batch IDs and their page numbers once known. A cancelled run can contain completed pages; do not relabel or delete them. Mark unsent pages cancelled immediately; a submitted batch is only marked cancelled after Gemini confirms that state. If cancellation loses a race to completion, keep and process the completed result. The UI must not claim that a cancel request guarantees cancellation or prevents charges for work already performed.

For explicit cancellation, stop starting local renders/uploads/submissions, abort in-flight local requests where possible, call Gemini `batches/{id}:cancel` for every known nonterminal batch, and check/report each resulting state. Do not delete the batch operation instead of cancelling it.

For tab-close cancellation, register the workspace tab ID and known active batch IDs in `chrome.storage.session` as batches are created. The service worker has a top-level `chrome.tabs.onRemoved` listener; when that tab closes it reads the minimal registry and the separately stored API key, then attempts cancellation of its nonterminal batches and clears the registry. It does not poll or translate in the background. This is best-effort: browser shutdown, no network, service-worker termination, or a tab closing before a newly submitted batch ID is registered can leave a remote job running. No extra `tabs` permission is needed for the close event.

## Failures and privacy

Validate Gemini HTTP responses and JSONL records at the service boundary. A render/upload/submission failure marks only that group's affected pages failed and lets other groups continue. A terminal failed or expired batch marks its unfinished pages failed. A malformed or error result line fails only its keyed page; missing/duplicate keys and missing image output are visible failures, not silently successful pages. Preserve completed results on partial failure. Show concise user-facing errors without exposing the API key, file content, or raw server payload in logs.

Do not persist source PDF bytes. The existing API key storage mode remains explicit to the user, and the UI should state that selected page images are uploaded to Gemini. Stored result images remain local in IndexedDB until the user removes them or extension storage is cleared; a minimal removal action prevents unbounded accumulation.

## Verification

Add focused tests for settings normalization, batch splitting, JSONL request/key mapping, mixed successful/error results, job progress transitions, and cancellation behavior. Mock Gemini responses and Chrome APIs; no real Gemini requests in automated tests. Run `npm test`, TypeScript checking, and `npm run build`. Manually load `dist` unpacked to verify settings, PDF selection, page range, progress, completed images, explicit cancellation, and tab-close best-effort cancellation. A live Gemini test requires the user's own API key and may incur charges; without that key, report live submission as unverified.

## Out of scope

No OpenAI/custom provider, backend, authentication, full job persistence/resume, automatic retry, pause, worker optimization, notifications, or PDF export.
