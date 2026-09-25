import type { PDFDocumentProxy } from "pdfjs-dist"

import { buildBatchJsonl, splitIntoBatches } from "./gemini-jsonl.ts"
import { createGeminiBatchClient, type GeminiBatchClient } from "./gemini-batch.ts"
import { abortableDelay } from "./translation-job.ts"
import { reconcileBatch, recalculateJobProgress, type ReconcileOptions } from "./translation-reconcile.ts"
import { resumeJob } from "./translation-resume.ts"
import { renderPdfPage } from "../pdf/pdf-renderer.ts"
import type { AppSettings } from "../settings/settings.ts"
import type { StoredJob, TranslationBatchRecord } from "./model.ts"
import {
  getJob as defaultGetJob,
  getPagesByJob as defaultGetPagesByJob,
  getBatchesByJob as defaultGetBatchesByJob,
  createBatchRecord as defaultCreateBatchRecord,
  updateBatch as defaultUpdateBatch,
  updatePageRecord as defaultUpdatePageRecord,
  updateJobRecord as defaultUpdateJobRecord,
  saveCompletedPage as defaultSaveCompletedPage,
} from "./results.storage.ts"

export interface RetryOptions {
  jobId: string
  pdf: { numPages: number }
  fileName: string
  fileSize?: number
  apiKey: string
  settings: AppSettings
  signal?: AbortSignal
  onProgress?: (job: StoredJob) => void
  deps?: {
    getJob?: typeof defaultGetJob
    getPagesByJob?: typeof defaultGetPagesByJob
    getBatchesByJob?: typeof defaultGetBatchesByJob
    createBatchRecord?: typeof defaultCreateBatchRecord
    updateBatch?: typeof defaultUpdateBatch
    updatePageRecord?: typeof defaultUpdatePageRecord
    updateJobRecord?: typeof defaultUpdateJobRecord
    saveCompletedPage?: typeof defaultSaveCompletedPage
    renderPage?: typeof renderPdfPage
    client?: GeminiBatchClient | (Pick<GeminiBatchClient, "uploadFile" | "submitBatch" | "getBatch" | "downloadResults"> & { cancelBatch?: (name: string) => Promise<void> })
    sleep?: typeof abortableDelay
  }
}

export async function retryFailedPages(options: RetryOptions): Promise<void> {
  const getJob = options.deps?.getJob ?? defaultGetJob
  const getPagesByJob = options.deps?.getPagesByJob ?? defaultGetPagesByJob
  const getBatchesByJob = options.deps?.getBatchesByJob ?? defaultGetBatchesByJob
  const createBatchRecord = options.deps?.createBatchRecord ?? defaultCreateBatchRecord
  const updatePageRecord = options.deps?.updatePageRecord ?? defaultUpdatePageRecord
  const renderPage = options.deps?.renderPage ?? renderPdfPage
  const client = (options.deps?.client ?? createGeminiBatchClient(options.apiKey)) as GeminiBatchClient

  const job = await getJob(options.jobId)
  if (!job) throw new Error("Translation job not found")

  const fileSizeMismatch =
    options.fileSize !== undefined &&
    job.fileSize !== undefined &&
    options.fileSize !== job.fileSize

  if (
    options.fileName !== job.fileName ||
    options.pdf.numPages !== job.totalPages ||
    fileSizeMismatch
  ) {
    throw new Error(
      `Original PDF does not match the translation job. Please select ${job.fileName} (${job.totalPages} pages).`,
    )
  }

  const pages = await getPagesByJob(options.jobId)
  const failedPages = pages.filter((p) => p.status === "failed")
  if (failedPages.length === 0) return

  // Reset failed pages to pending
  for (const page of failedPages) {
    await updatePageRecord(job.id, page.pageNumber, {
      status: "pending",
      error: undefined,
    })
  }

  const jobId = job.id
  const failedNumbers = failedPages.map((p) => p.pageNumber)
  const unsubmitted = new Set(failedNumbers)
  async function restoreUnsubmitted(): Promise<void> {
    for (const pageNumber of unsubmitted) {
      try {
        await updatePageRecord(jobId, pageNumber, {
          status: "failed",
          error: "Retry stopped before batch submission",
        })
      } catch {
        // Continue restoring remaining pages
      }
    }
  }

  const sourceLanguage = job.sourceLanguage || options.settings.sourceLanguage
  const targetLanguage = job.targetLanguage || options.settings.targetLanguage
  const model = job.geminiModel || options.settings.geminiModel
  const quality = job.outputQuality ?? options.settings.quality

  const recalculateJobProgressFn = (jId: string) =>
    recalculateJobProgress(jId, {
      getJob,
      getPagesByJob,
      getBatchesByJob,
      updateJobRecord: options.deps?.updateJobRecord,
    })

  const batchChunks = splitIntoBatches(failedNumbers, options.settings.batchSize)

  try {
    for (const chunk of batchChunks) {
      if (options.signal?.aborted) return
      const results = await Promise.all(chunk.map(async (pageNumber) => {
        if (options.signal?.aborted) return null
        await updatePageRecord(job.id, pageNumber, { status: "rendering" })
        try {
          const rendered = await renderPage(options.pdf as PDFDocumentProxy, pageNumber, quality)
          if (options.signal?.aborted) return null
          const file = await client.uploadFile(rendered.blob, `page-${pageNumber}.png`, options.signal)
          if (options.signal?.aborted) return null
          await updatePageRecord(job.id, pageNumber, { status: "queued" })
          return { pageNumber, fileUri: file.uri, mimeType: rendered.blob.type }
        } catch {
          if (options.signal?.aborted) return null
          await updatePageRecord(job.id, pageNumber, {
            status: "failed",
            error: "Could not render or upload page for retry",
          })
          return null
        }
      }))
      const uploads = results.filter((result) => result !== null)

      if (options.signal?.aborted) return

      if (uploads.length === 0) continue

      let submittedBatchName: string | null = null
      try {
        const jsonl = buildBatchJsonl(job.id, uploads, sourceLanguage, targetLanguage, quality)
        const file = await client.uploadFile(jsonl, `batch-retry-${Date.now()}.jsonl`, options.signal)
        const batchName = await client.submitBatch(model, file.name, options.signal)
        submittedBatchName = batchName

        const batchRecord: TranslationBatchRecord = {
          id: crypto.randomUUID(),
          jobId: job.id,
          batchName,
          model,
          pageNumbers: uploads.map((u) => u.pageNumber),
          status: "submitted",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        await createBatchRecord(batchRecord)
        for (const upload of uploads) unsubmitted.delete(upload.pageNumber)
      } catch {
        if (submittedBatchName) {
          let cancelRequested = false
          if ("cancelBatch" in client && typeof client.cancelBatch === "function") {
            try {
              await client.cancelBatch(submittedBatchName)
              cancelRequested = true
            } catch {
              // Cancellation may fail after remote submission
            }
          }
          const errorMsg = cancelRequested
            ? "Gemini batch was submitted but could not be saved locally. Cancellation was requested."
            : "Gemini batch was submitted but could not be saved locally. Cancellation is unconfirmed; it may still be processing."
          for (const upload of uploads) {
            await updatePageRecord(job.id, upload.pageNumber, {
              status: "failed",
              error: errorMsg,
            })
          }
          throw new Error(errorMsg)
        }
        for (const upload of uploads) {
          await updatePageRecord(job.id, upload.pageNumber, {
            status: "failed",
            error: "Could not submit retry batch",
          })
        }
      }
    }
  } finally {
    if (options.signal?.aborted) {
      await restoreUnsubmitted()
      await recalculateJobProgressFn(job.id).catch(() => {})
    }
  }

  const reconcileBatchFn = (
    b: TranslationBatchRecord,
    c: Pick<GeminiBatchClient, "getBatch" | "downloadResults">,
    o?: ReconcileOptions,
  ) =>
    reconcileBatch(b, c, {
      ...o,
      deps: {
        getPagesByJob,
        saveCompletedPage: options.deps?.saveCompletedPage,
        updateBatch: options.deps?.updateBatch,
        updatePageRecord,
      },
    })

  // Wait polling interval before polling newly submitted retry batches
  if (unsubmitted.size < failedNumbers.length) {
    try {
      const sleep = options.deps?.sleep ?? abortableDelay
      await sleep(options.settings.pollingIntervalMs, options.signal)
    } catch {
      if (options.signal?.aborted) return
    }
  }

  // Resume and poll to completion
  await resumeJob({
    jobId: job.id,
    client,
    pollingIntervalMs: options.settings.pollingIntervalMs,
    signal: options.signal,
    onProgress: options.onProgress,
    deps: {
      getJob,
      getBatchesByJob,
      reconcileBatch: reconcileBatchFn,
      recalculateJobProgress: recalculateJobProgressFn,
      sleep: options.deps?.sleep,
    },
  })
}
