import type { PDFDocumentProxy } from "pdfjs-dist"

import { buildBatchJsonl, parseBatchResults, splitIntoBatches } from "./gemini-jsonl.ts"
import type { GeminiBatchClient, GeminiBatchStatus } from "./gemini-batch.ts"
import type { RenderedPage } from "./pdf-renderer.ts"
import type { AppSettings } from "../types/settings.ts"
import type { TranslationBatchRecord } from "../storage/results.storage.ts"
import type { BatchStatus, PageStatus, TranslationJob, TranslationPageJob } from "../types/translation.ts"

export interface TranslationInput {
  pdf: PDFDocumentProxy
  fileName: string
  fileSize: number
  pages: number[]
  settings: AppSettings
  apiKey: string
  tabId: number
  onChange: (job: TranslationJob) => void
}

export interface TranslationPorts {
  renderPage: (pdf: PDFDocumentProxy, pageNumber: number, quality: AppSettings["quality"]) => Promise<RenderedPage>
  client: GeminiBatchClient
  saveCompletedPage: (jobId: string, fileName: string, pageNumber: number, image: Blob) => Promise<void>
  createJob: (job: TranslationJob, file: { name: string; size: number; totalPages: number }, settings: AppSettings) => Promise<void>
  saveJobSnapshot: (job: TranslationJob, changedPages: readonly number[]) => Promise<void>
  registerBatch: (tabId: number, batchName: string) => Promise<void>
  unregisterBatch: (tabId: number, batchName: string) => Promise<void>
  createBatchRecord?: (batch: TranslationBatchRecord) => Promise<void>
  updateBatch?: (batchId: string, patch: Partial<TranslationBatchRecord>) => Promise<void>
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

const TERMINAL = new Set<BatchStatus>(["completed", "failed", "cancelled"])

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return }
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    const abort = () => { clearTimeout(timer); cleanup(); reject(new DOMException("Aborted", "AbortError")) }
    const cleanup = () => signal?.removeEventListener("abort", abort)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

export function startTranslation(input: TranslationInput, ports: TranslationPorts): {
  finished: Promise<void>
  cancel: () => Promise<void>
} {
  if (!input.apiKey.trim()) throw new Error("Gemini API key is required")
  if (!input.pages.length) throw new Error("Select at least one page")

  const job: TranslationJob = {
    id: crypto.randomUUID(),
    pages: input.pages.map((pageNumber) => ({ pageNumber, status: "pending" })),
    batches: [],
    completedPages: 0,
    failedPages: 0,
    cancelledPages: 0,
    status: "running",
    stage: "preparing",
    geminiModel: input.settings.geminiModel,
    outputQuality: input.settings.quality,
  }
  const aborter = new AbortController()
  let stopping = false
  let cancellation: Promise<void> | null = null
  const finalized = new Set<string>()
  let persistence = Promise.resolve()
  let persistenceError: unknown = null
  let fatalSubmissionError: Error | null = null
  const batchRecordIds = new Map<string, string>()

  function emit(changedPages: readonly number[] = []): void {
    job.completedPages = job.pages.filter((page) => page.status === "completed").length
    job.failedPages = job.pages.filter((page) => page.status === "failed").length
    job.cancelledPages = job.pages.filter((page) => page.status === "cancelled").length
    if (job.pages.every((page) => ["completed", "failed", "cancelled"].includes(page.status))) {
      job.status = job.failedPages ? "failed" : job.cancelledPages ? "cancelled" : "completed"
      job.stage = "finished"
    }
    const snapshot: TranslationJob = {
      ...job,
      pages: job.pages.map((page) => ({ ...page })),
      batches: job.batches.map((batch) => ({ ...batch, pageNumbers: [...batch.pageNumbers] })),
    }
    input.onChange(snapshot)
    persistence = persistence.then(() => ports.saveJobSnapshot(snapshot, changedPages)).catch((error: unknown) => {
      persistenceError ??= error
    })
  }

  function page(pageNumber: number): TranslationPageJob {
    const found = job.pages.find((item) => item.pageNumber === pageNumber)
    if (!found) throw new Error("Page not in translation job")
    return found
  }

  function mark(pageNumber: number, status: PageStatus, error?: string): void {
    const item = page(pageNumber)
    if (item.status === "completed") return
    item.status = status
    item.error = error
    emit(status === "completed" ? [] : [pageNumber])
  }

  function batchState(name: string, state: BatchStatus): void {
    const batch = job.batches.find((item) => item.id === name)
    if (batch && !TERMINAL.has(batch.state)) {
      batch.state = state
      emit()
    }
  }

  async function finishBatch(status: GeminiBatchStatus): Promise<void> {
    const batch = job.batches.find((item) => item.id === status.name)
    if (!batch || finalized.has(status.name)) return
    finalized.add(status.name)
    batchState(status.name, status.state)
    if (status.state === "completed") {
      try {
        if (!status.responseFile) throw new Error("Missing Gemini results file")
        const jsonl = await ports.client.downloadResults(status.responseFile)
        const results = await parseBatchResults(jsonl, job.id, batch.pageNumbers)
        for (const result of results) {
          if (result.image) {
            try {
              await persistence
              if (persistenceError) throw persistenceError
              await ports.saveCompletedPage(job.id, input.fileName, result.pageNumber, result.image)
              mark(result.pageNumber, "completed")
            } catch {
              mark(result.pageNumber, "failed", "Could not save translated page locally. Free browser storage and try again.")
            }
          } else {
            mark(result.pageNumber, "failed", result.error ?? "Gemini returned no image")
          }
        }
      } catch {
        for (const pageNumber of batch.pageNumbers) mark(pageNumber, "failed", "Could not read Gemini batch results")
      }
    } else if (status.state === "cancelled") {
      for (const pageNumber of batch.pageNumbers) mark(pageNumber, "cancelled")
    } else {
      for (const pageNumber of batch.pageNumbers) mark(pageNumber, "failed", "Gemini batch failed")
    }
    if (ports.updateBatch) {
      const localStatus = status.state === "completed" ? "succeeded" : status.state === "cancelled" ? "cancelled" : "failed"
      await ports.updateBatch(batchRecordIds.get(status.name) ?? status.name, { status: localStatus }).catch(() => {})
    }
    await ports.unregisterBatch(input.tabId, status.name).catch(() => {})
  }

  const submission = (async () => {
    await ports.createJob(job, { name: input.fileName, size: input.fileSize, totalPages: input.pdf.numPages }, input.settings)
    emit()
    for (const pageNumbers of splitIntoBatches(input.pages, input.settings.batchSize)) {
      await persistence
      if (persistenceError) throw persistenceError
      if (stopping) break
      const uploads: { pageNumber: number; fileUri: string; mimeType: string }[] = []
      for (const pageNumber of pageNumbers) {
        if (stopping) break
        mark(pageNumber, "rendering")
        try {
          const rendered = await ports.renderPage(input.pdf, pageNumber, job.outputQuality ?? input.settings.quality)
          if (stopping) { mark(pageNumber, "cancelled"); break }
          const file = await ports.client.uploadFile(rendered.blob, `page-${pageNumber}.png`, aborter.signal)
          if (stopping) { mark(pageNumber, "cancelled"); break }
          uploads.push({ pageNumber, fileUri: file.uri, mimeType: rendered.blob.type })
          mark(pageNumber, "queued")
        } catch {
          mark(pageNumber, stopping ? "cancelled" : "failed", stopping ? undefined : "Could not render or upload page")
        }
      }
      if (stopping) {
        for (const upload of uploads) mark(upload.pageNumber, "cancelled")
        break
      }
      if (!uploads.length) continue
      let submittedName: string | null = null
      try {
        const jsonl = buildBatchJsonl(job.id, uploads, input.settings.sourceLanguage, input.settings.targetLanguage, job.outputQuality ?? input.settings.quality)
        const file = await ports.client.uploadFile(jsonl, `batch-${job.batches.length + 1}.jsonl`, aborter.signal)
        const name = await ports.client.submitBatch(job.geminiModel ?? input.settings.geminiModel, file.name, aborter.signal)
        submittedName = name
        if (ports.createBatchRecord) {
          const now = Date.now()
          const id = crypto.randomUUID()
          await ports.createBatchRecord({
            id,
            jobId: job.id,
            batchName: name,
            model: job.geminiModel ?? input.settings.geminiModel,
            pageNumbers: uploads.map((upload) => upload.pageNumber),
            status: "submitted",
            createdAt: now,
            updatedAt: now,
          })
          batchRecordIds.set(name, id)
        }
        job.batches.push({ id: name, pageNumbers: uploads.map((upload) => upload.pageNumber), state: "pending" })
        for (const upload of uploads) page(upload.pageNumber).batchId = name
        job.stage = "submitted"
        emit(uploads.map((upload) => upload.pageNumber))
        await ports.registerBatch(input.tabId, name).catch(() => {})
      } catch {
        if (submittedName) {
          let cancelRequested = false
          try {
            await ports.client.cancelBatch(submittedName)
            cancelRequested = true
          } catch { /* Cancellation may fail after remote submission. */ }
          fatalSubmissionError = new Error(cancelRequested
            ? "Gemini batch was submitted but could not be saved locally. Cancellation was requested."
            : "Gemini batch was submitted but could not be saved locally. Cancellation is unconfirmed; it may still be processing.")
          for (const upload of uploads) mark(upload.pageNumber, "failed", fatalSubmissionError.message)
          throw fatalSubmissionError
        }
        for (const upload of uploads) mark(upload.pageNumber, stopping ? "cancelled" : "failed", stopping ? undefined : "Could not submit Gemini batch")
      }
    }
    if (stopping) {
      for (const item of job.pages) {
        if (!item.batchId && ["pending", "rendering", "queued"].includes(item.status)) mark(item.pageNumber, "cancelled")
      }
    }
  })()

  const finished = submission.then(async () => {
    if (job.batches.some((batch) => !TERMINAL.has(batch.state))) {
      job.stage = "waiting"
      emit()
    }
    while (job.batches.some((batch) => !TERMINAL.has(batch.state))) {
      try {
        await ports.sleep(input.settings.pollingIntervalMs, stopping ? undefined : aborter.signal)
      } catch (error) {
        if (!stopping) throw error
      }
      for (const batch of job.batches) {
        if (TERMINAL.has(batch.state)) continue
        try {
          const status = await ports.client.getBatch(batch.id, stopping ? undefined : aborter.signal)
          if (TERMINAL.has(status.state)) {
            await finishBatch(status)
          } else {
            batchState(batch.id, status.state)
            for (const pageNumber of batch.pageNumbers) {
              if (page(pageNumber).status === "queued" && status.state === "running") {
                mark(pageNumber, "processing")
              }
            }
          }
        } catch { /* Keep polling; a status request can fail temporarily. */ }
      }
    }
    emit()
  }).catch(() => {
    for (const item of job.pages) {
      if (!["completed", "failed", "cancelled"].includes(item.status)) {
        mark(item.pageNumber, stopping ? "cancelled" : "failed", "Translation stopped unexpectedly")
      }
    }
  }).then(async () => {
    await persistence
    if (persistenceError) throw persistenceError
    if (fatalSubmissionError) throw fatalSubmissionError
  })

  function cancel(): Promise<void> {
    if (cancellation) return cancellation
    stopping = true
    aborter.abort()
    cancellation = (async () => {
      await submission
      for (const batch of job.batches) {
        if (TERMINAL.has(batch.state)) continue
        try {
          await ports.client.cancelBatch(batch.id)
        } catch { /* Keep the batch active until Gemini reports a terminal state. */ }
        try {
          const status = await ports.client.getBatch(batch.id)
          if (TERMINAL.has(status.state)) await finishBatch(status)
          else batchState(batch.id, status.state)
        } catch { /* Keep the batch active until Gemini reports a terminal state. */ }
      }
      for (const item of job.pages) {
        if (!item.batchId && ["pending", "rendering", "queued"].includes(item.status)) mark(item.pageNumber, "cancelled")
      }
      emit()
    })().finally(() => { cancellation = null })
    return cancellation
  }

  return { finished, cancel }
}
