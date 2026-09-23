import type { PDFDocumentProxy } from "pdfjs-dist"

import { buildBatchJsonl, parseBatchResults, splitIntoBatches } from "./gemini-jsonl.ts"
import { abortableDelay } from "./translation-job.ts"
import { createGeminiBatchClient, type GeminiBatchClient } from "./gemini-batch.ts"
import { renderPdfPage } from "./pdf-renderer.ts"
import type { AppSettings } from "../types/settings.ts"
import type { BatchStatus } from "../types/translation.ts"
import {
  getJob as defaultGetJob,
  getPagesByJob as defaultGetPagesByJob,
  getBatchesByJob as defaultGetBatchesByJob,
  createBatchRecord as defaultCreateBatchRecord,
  updateBatch as defaultUpdateBatch,
  updatePageRecord as defaultUpdatePageRecord,
  updateJobRecord as defaultUpdateJobRecord,
  saveCompletedPage as defaultSaveCompletedPage,
  jobStatus,
  type LocalBatchStatus,
  type StoredJob,
  type StoredJobStatus,
  type StoredPage,
  type TranslationBatchRecord,
} from "../storage/results.storage.ts"

export function mapGeminiBatchState(state: BatchStatus | string | undefined): LocalBatchStatus {
  switch (state) {
    case "JOB_STATE_QUEUED":
    case "JOB_STATE_PENDING":
    case "pending":
      return "pending"
    case "JOB_STATE_RUNNING":
    case "JOB_STATE_CANCELLING":
    case "running":
      return "running"
    case "JOB_STATE_SUCCEEDED":
    case "completed":
      return "succeeded"
    case "JOB_STATE_FAILED":
    case "failed":
      return "failed"
    case "JOB_STATE_EXPIRED":
      return "expired"
    case "JOB_STATE_CANCELLED":
    case "cancelled":
      return "cancelled"
    default:
      return "pending"
  }
}

export interface ReconcileOptions {
  fileName?: string
  signal?: AbortSignal
  deps?: {
    getPagesByJob?: typeof defaultGetPagesByJob
    saveCompletedPage?: typeof defaultSaveCompletedPage
    updateBatch?: typeof defaultUpdateBatch
    updatePage?: (key: [string, number], patch: Partial<StoredPage>) => Promise<void>
    updatePageRecord?: typeof defaultUpdatePageRecord
  }
}

export async function reconcileBatch(
  batch: TranslationBatchRecord,
  client: Pick<GeminiBatchClient, "getBatch" | "downloadResults">,
  options: ReconcileOptions = {},
): Promise<LocalBatchStatus> {
  const getPagesByJob = options.deps?.getPagesByJob ?? defaultGetPagesByJob
  const saveCompletedPage = options.deps?.saveCompletedPage ?? defaultSaveCompletedPage
  const updateBatch = options.deps?.updateBatch ?? defaultUpdateBatch
  const updatePage = options.deps?.updatePage
    ? async (pNum: number, patch: Partial<StoredPage>) => options.deps!.updatePage!([batch.jobId, pNum], patch)
    : (options.deps?.updatePageRecord ?? defaultUpdatePageRecord).bind(null, batch.jobId)

  const remote = await client.getBatch(batch.batchName, options.signal)
  const raw = "rawState" in remote && typeof remote.rawState === "string" ? remote.rawState : remote.state
  const status = mapGeminiBatchState(raw)

  if (status === "succeeded") {
    if (batch.status !== "succeeded") {
      const responseFile = remote.responseFile
      if (!responseFile) throw new Error("Missing Gemini results file")
      const jsonl = await client.downloadResults(responseFile, options.signal)
      const results = await parseBatchResults(jsonl, batch.jobId, batch.pageNumbers)

      for (const result of results) {
        if (result.image) {
          await saveCompletedPage(batch.jobId, options.fileName ?? "document.pdf", result.pageNumber, result.image)
        } else {
          await updatePage(result.pageNumber, {
            status: "failed",
            error: result.error ?? "Gemini returned no image",
          })
        }
      }

      await updateBatch(batch.id, { status: "succeeded" })
    }
  } else if (status === "failed" || status === "expired") {
    await updateBatch(batch.id, {
      status,
      error: status === "expired" ? "Gemini batch expired before completion" : "Gemini batch failed",
    })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && page.status !== "completed") {
        await updatePage(pageNumber, {
          status: "failed",
          error: status === "expired" ? "Gemini batch expired before completion" : "Gemini batch failed",
        })
      }
    }
  } else if (status === "cancelled") {
    await updateBatch(batch.id, { status: "cancelled" })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && page.status !== "completed") {
        await updatePage(pageNumber, { status: "cancelled" })
      }
    }
  } else if (status === "running") {
    await updateBatch(batch.id, { status: "running" })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && (page.status === "queued" || page.status === "pending")) {
        await updatePage(pageNumber, { status: "processing" })
      }
    }
  } else {
    await updateBatch(batch.id, { status: "pending" })
  }

  return status
}

export interface RecalculateDeps {
  getJob?: typeof defaultGetJob
  getPagesByJob?: typeof defaultGetPagesByJob
  getBatchesByJob?: typeof defaultGetBatchesByJob
  updateJob?: (id: string, patch: Partial<StoredJob>) => Promise<void>
  updateJobRecord?: typeof defaultUpdateJobRecord
}

export async function recalculateJobProgress(jobId: string, deps: RecalculateDeps = {}): Promise<StoredJob> {
  const getJob = deps.getJob ?? defaultGetJob
  const getPagesByJob = deps.getPagesByJob ?? defaultGetPagesByJob
  const getBatchesByJob = deps.getBatchesByJob ?? defaultGetBatchesByJob
  const updateJob = deps.updateJob
    ? async (patch: Partial<StoredJob>) => deps.updateJob!(jobId, patch)
    : (deps.updateJobRecord ?? defaultUpdateJobRecord).bind(null, jobId)

  const job = await getJob(jobId)
  if (!job) throw new Error("Translation job not found")

  const pages = await getPagesByJob(jobId)
  const batches = await getBatchesByJob(jobId)

  const completedPages = pages.filter((p) => p.status === "completed").length
  const failedPages = pages.filter((p) => p.status === "failed").length
  const cancelledPages = pages.filter((p) => p.status === "cancelled").length
  const status = jobStatus({ pages, completedPages, batches })

  const patch: Partial<StoredJob> = {
    completedPages,
    failedPages,
    cancelledPages,
    status,
    updatedAt: Date.now(),
  }

  await updateJob(patch)
  return {
    ...job,
    ...patch,
  }
}

export interface ResumeJobOptions {
  jobId: string
  client: GeminiBatchClient
  pollingIntervalMs: number
  signal?: AbortSignal
  onProgress?: (job: StoredJob) => void
  deps?: {
    getJob?: typeof defaultGetJob
    getBatchesByJob?: typeof defaultGetBatchesByJob
    reconcileBatch?: typeof reconcileBatch
    recalculateJobProgress?: typeof recalculateJobProgress
    sleep?: typeof abortableDelay
  }
}

export async function resumeJob(options: ResumeJobOptions): Promise<void> {
  const getJob = options.deps?.getJob ?? defaultGetJob
  const getBatchesByJob = options.deps?.getBatchesByJob ?? defaultGetBatchesByJob
  const doReconcile = options.deps?.reconcileBatch ?? reconcileBatch
  const doRecalculate = options.deps?.recalculateJobProgress ?? recalculateJobProgress
  const sleep = options.deps?.sleep ?? abortableDelay

  const job = await getJob(options.jobId)
  if (!job) throw new Error("Translation job not found")

  let batches = await getBatchesByJob(options.jobId)
  const nonTerminal = batches.filter((b) => !["succeeded", "failed", "cancelled", "expired"].includes(b.status))

  for (const batch of nonTerminal) {
    if (options.signal?.aborted) return
    try {
      await doReconcile(batch, options.client, {
        fileName: job.fileName,
        signal: options.signal,
      })
    } catch {
      // Continue reconciling remaining batches
    }
  }

  let updatedJob = await doRecalculate(options.jobId)
  options.onProgress?.(updatedJob)

  while (true) {
    if (options.signal?.aborted) return
    batches = await getBatchesByJob(options.jobId)
    const active = batches.filter((b) => ["submitted", "pending", "running"].includes(b.status))
    if (active.length === 0) break

    try {
      await sleep(options.pollingIntervalMs, options.signal)
    } catch {
      if (options.signal?.aborted) return
    }

    for (const batch of active) {
      if (options.signal?.aborted) return
      try {
        await doReconcile(batch, options.client, {
          fileName: job.fileName,
          signal: options.signal,
        })
      } catch {
        // Status request can fail temporarily
      }
    }

    updatedJob = await doRecalculate(options.jobId)
    options.onProgress?.(updatedJob)
  }

  await doRecalculate(options.jobId)
}

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
      const uploads: { pageNumber: number; fileUri: string; mimeType: string }[] = []

      for (const pageNumber of chunk) {
        if (options.signal?.aborted) return
        await updatePageRecord(job.id, pageNumber, { status: "rendering" })
        try {
          const rendered = await renderPage(options.pdf as PDFDocumentProxy, pageNumber, quality)
          const file = await client.uploadFile(rendered.blob, `page-${pageNumber}.png`, options.signal)
          uploads.push({ pageNumber, fileUri: file.uri, mimeType: rendered.blob.type })
          await updatePageRecord(job.id, pageNumber, { status: "queued" })
        } catch {
          await updatePageRecord(job.id, pageNumber, {
            status: "failed",
            error: "Could not render or upload page for retry",
          })
        }
      }

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
