import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist"

import { Button } from "@/components/ui/button"
import { createGeminiBatchClient } from "@/features/translation/gemini-batch"
import {
  exportTranslatedPdf,
  downloadPdfBlob,
  type ExportProgress,
} from "@/features/pdf/pdf-export.service"
import { pdfDocumentOptions, renderPdfPage } from "@/features/pdf/pdf-renderer"
import { abortableDelay, startTranslation } from "@/features/translation/translation-job"
import { recalculateJobProgress } from "@/features/translation/translation-reconcile"
import { resumeJob } from "@/features/translation/translation-resume"
import { retryFailedPages } from "@/features/translation/translation-retry"
import { getApiKey } from "@/features/settings/api-key.storage"
import { registerBatch, unregisterBatch } from "@/features/translation/active-batches.storage"
import {
  createBatchRecord, createJob, deleteJob, getBatchesByJob, getJob, getPageImage, getPagesByJob, listJobs,
  saveCompletedPage, saveJobSnapshot, updateBatch, updatePageRecord,
} from "@/features/translation/results.storage"
import { getSettings } from "@/features/settings/settings.storage"
import type { BatchStatus, LocalBatchStatus, PageMetadata, StoredJob, StoredPage, TranslationBatchRecord, TranslationJob } from "@/features/translation/model"
import { translationStartError } from "./translation-start"
import { TranslationProgress } from "./TranslationProgress"
import { TranslationHistory } from "./TranslationHistory"
import { toTranslationJob } from "./translation-view-model"

interface Props {
  pdf: PDFDocumentProxy | null
  fileName: string
  fileSize: number
  selectedPages: number[] | null
  onRunningChange: (running: boolean) => void
  onNavigateSettings?: () => void
  loadPdf?: (file: File) => Promise<PDFDocumentProxy>
}

const FINISHED_JOB = new Set(["completed", "completed_with_errors", "failed"])
const TERMINAL_BATCH = new Set(["completed", "failed", "cancelled"])

export function TranslationPanel({ pdf, fileName, fileSize, selectedPages, onRunningChange, onNavigateSettings, loadPdf }: Props) {
  const [job, setJob] = useState<TranslationJob | null>(null)
  const jobRef = useRef<TranslationJob | null>(null)
  const runRef = useRef<ReturnType<typeof startTranslation> | null>(null)
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [error, setError] = useState("")
  const [savedJobs, setSavedJobs] = useState<StoredJob[]>([])
  const [viewed, setViewed] = useState<{ job: StoredJob; pages: PageMetadata[] } | null>(null)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [resultUrl, setResultUrl] = useState("")

  const [exportingJobId, setExportingJobId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [partialConfirm, setPartialConfirm] = useState<{
    jobId: string
    completedCount: number
    failedCount: number
  } | null>(null)

  const [resumingJobId, setResumingJobId] = useState<string | null>(null)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [recoveryStatus, setRecoveryStatus] = useState("")
  const [missingApiKeyPrompt, setMissingApiKeyPrompt] = useState(false)
  const [pdfPromptJob, setPdfPromptJob] = useState<StoredJob | null>(null)
  const [pdfFileError, setPdfFileError] = useState("")
  const abortControllerRef = useRef<AbortController | null>(null)

  async function refreshJobs() {
    setSavedJobs(await listJobs())
  }

  async function openSaved(saved: StoredJob) {
    try {
      const pages = await getPagesByJob(saved.id)
      setViewed({ job: saved, pages })
      setSelectedPage(pages.find((page) => page.status === "completed")?.pageNumber ?? null)
      setError("")
    } catch {
      setError("Could not load saved translation. Please reload the workspace.")
    }
  }

  useEffect(() => {
    void refreshJobs().catch(() => setError("Could not load saved translations."))
    void getApiKey().then((k) => {
      if (!k || !k.trim()) setMissingApiKeyPrompt(true)
      else setMissingApiKeyPrompt(false)
    }).catch(() => {})
    const refresh = () => {
      setViewed(null)
      setSelectedPage(null)
      void refreshJobs().catch(() => setError("Could not load saved translations."))
      void getApiKey().then((k) => {
        if (!k || !k.trim()) setMissingApiKeyPrompt(true)
        else setMissingApiKeyPrompt(false)
      }).catch(() => {})
      if (jobRef.current) void syncActiveJob(jobRef.current.id)
    }
    window.addEventListener("pdf2imgvi-results-changed", refresh)
    return () => window.removeEventListener("pdf2imgvi-results-changed", refresh)
  }, [])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setResultUrl("")
    if (!viewed || selectedPage === null) return
    let active = true
    let url = ""
    void getPageImage(viewed.job.id, selectedPage).then((image) => {
      if (!active) return
      if (!image) { setResultUrl(""); return }
      url = URL.createObjectURL(image)
      setResultUrl(url)
    }).catch(() => { if (active) setError("Could not load translated image.") })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [viewed, selectedPage])

  async function getWorkspaceTabId(): Promise<number> {
    const response = await chrome.runtime.sendMessage({ type: "REGISTER_WORKSPACE" })
    if (typeof response?.tabId === "number") return response.tabId
    throw new Error("Could not identify workspace tab")
  }

  async function defaultLoadPdf(file: File): Promise<PDFDocumentProxy> {
    const url = URL.createObjectURL(file)
    try {
      const task = getDocument(pdfDocumentOptions(url, window.location.href))
      return await task.promise
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function syncActiveJob(jobId: string) {
    const shouldSync = jobRef.current?.id === jobId || job?.id === jobId
    if (!shouldSync) return
    try {
      const getBatches = typeof getBatchesByJob === "function" ? getBatchesByJob : async () => []
      const [stored, pages, batches] = await Promise.all([
        getJob(jobId),
        getPagesByJob(jobId),
        getBatches(jobId),
      ])
      if (!stored) return
      const updated = toTranslationJob(stored, pages, batches)
      jobRef.current = updated
      setJob(updated)
    } catch {
      // Non-critical background sync
    }
  }

  async function start() {
    if (starting || running) return
    setStarting(true)
    setError("")
    setMissingApiKeyPrompt(false)
    setCancelRequested(false)
    try {
      const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()])
      if (!apiKey || !apiKey.trim()) {
        setMissingApiKeyPrompt(true)
      }
      const validation = translationStartError(pdf, selectedPages, apiKey)
      if (validation) { setError(validation); return }
      if (!pdf || !selectedPages || !apiKey) return

      const tabId = await getWorkspaceTabId()

      const client = createGeminiBatchClient(apiKey)
      const run = startTranslation({
        pdf, fileName, fileSize, pages: [...selectedPages], settings, apiKey, tabId,
        onChange: (next) => {
          const previousCompleted = jobRef.current?.completedPages ?? 0
          jobRef.current = next
          setJob(next)
          if (next.completedPages > previousCompleted) {
            void refreshJobs().catch(() => setError("Could not load saved translations."))
          }
        },
      }, {
        renderPage: renderPdfPage,
        client,
        createJob,
        saveJobSnapshot,
        saveCompletedPage,
        registerBatch,
        unregisterBatch,
        createBatchRecord,
        updateBatch,
        sleep: abortableDelay,
      })
      runRef.current = run
      setRunning(true)
      onRunningChange(true)
      void run.finished.then(async () => {
        await refreshJobs()
        const active = jobRef.current?.status === "running"
        setRunning(active)
        onRunningChange(active)
      }).catch((cause: unknown) => {
        setError(cause instanceof Error && cause.message.startsWith("Gemini batch was submitted")
          ? cause.message
          : "Could not save translation progress locally. Please free browser storage and try again.")
        setRunning(false)
        onRunningChange(false)
      })
    } catch {
      setError("Could not start translation. Check Settings and try again.")
      setRunning(false)
      onRunningChange(false)
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    if (!runRef.current || cancelling || cancelRequested) return
    setCancelling(true)
    setCancelRequested(true)
    setError("")
    try {
      await runRef.current.cancel()
      await refreshJobs()
      const unconfirmed = jobRef.current?.batches.filter((batch) => !TERMINAL_BATCH.has(batch.state)) ?? []
      if (unconfirmed.length) {
        setError(`Cancellation is not confirmed for ${unconfirmed.length} batch(es). They may still be processing.`)
        setCancelRequested(false)
      }
      const active = jobRef.current?.status === "running"
      setRunning(active)
      onRunningChange(active)
    } catch {
      setError("Could not confirm cancellation. Gemini batches may still be processing.")
      setCancelRequested(false)
    } finally {
      setCancelling(false)
    }
  }

  function stopPolling() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setResumingJobId(null)
    setRetryingJobId(null)
    setRunning(false)
    onRunningChange(false)
    setRecoveryStatus("")
  }

  async function handleResume(jobId: string) {
    if (starting || running || resumingJobId || retryingJobId) return
    setError("")
    setMissingApiKeyPrompt(false)

    try {
      const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()])
      if (!apiKey?.trim()) {
        setMissingApiKeyPrompt(true)
        setError("Gemini API key is required to resume this translation.")
        return
      }

      setResumingJobId(jobId)
      setRunning(true)
      onRunningChange(true)
      setRecoveryStatus("Checking Gemini…")
      void syncActiveJob(jobId)

      const controller = new AbortController()
      abortControllerRef.current = controller

      const client = createGeminiBatchClient(apiKey)
      await resumeJob({
        jobId,
        client,
        pollingIntervalMs: settings.pollingIntervalMs,
        signal: controller.signal,
        onProgress: (updatedJob) => {
          setRecoveryStatus(`Gemini is processing translation… (${updatedJob.completedPages}/${updatedJob.selectedPages.length})`)
          void refreshJobs()
          if (viewed?.job.id === jobId) {
            void openSaved(updatedJob)
          }
          void syncActiveJob(jobId)
        },
      })
    } catch (err: unknown) {
      if (abortControllerRef.current?.signal.aborted) {
        // Aborted locally
      } else {
        const msg = err instanceof Error ? err.message : "Could not resume translation."
        setError(msg)
      }
    } finally {
      abortControllerRef.current = null
      setResumingJobId(null)
      setRunning(false)
      onRunningChange(false)
      setRecoveryStatus("")
      await refreshJobs()
      const finalJob = await getJob(jobId)
      if (finalJob && viewed?.job.id === jobId) {
        void openSaved(finalJob)
      }
      await syncActiveJob(jobId)
    }
  }

  async function handleRetry(jobToRetry: StoredJob) {
    if (starting || running || resumingJobId || retryingJobId) return
    setError("")
    setPdfFileError("")
    setMissingApiKeyPrompt(false)

    const matchesSize = jobToRetry.fileSize === undefined || fileSize === undefined || fileSize === jobToRetry.fileSize
    const isMatching = pdf !== null && fileName === jobToRetry.fileName && pdf.numPages === jobToRetry.totalPages && matchesSize
    if (isMatching && pdf) {
      await executeRetry(jobToRetry, pdf, fileSize)
    } else {
      setPdfPromptJob(jobToRetry)
    }
  }

  async function onPdfFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pdfPromptJob) return
    setPdfFileError("")

    if (file.name !== pdfPromptJob.fileName) {
      setPdfFileError(`Selected file "${file.name}" does not match original file "${pdfPromptJob.fileName}".`)
      return
    }

    if (pdfPromptJob.fileSize !== undefined && file.size !== pdfPromptJob.fileSize) {
      setPdfFileError(`Selected file size (${file.size} bytes) does not match original file size (${pdfPromptJob.fileSize} bytes).`)
      return
    }

    try {
      const loader = loadPdf ?? defaultLoadPdf
      const loadedPdf = await loader(file)
      if (loadedPdf.numPages !== pdfPromptJob.totalPages) {
        setPdfFileError(`PDF has ${loadedPdf.numPages} pages, but original translation had ${pdfPromptJob.totalPages} pages.`)
        return
      }
      const target = pdfPromptJob
      setPdfPromptJob(null)
      await executeRetry(target, loadedPdf, file.size)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load selected PDF."
      setPdfFileError(msg)
    }
  }

  async function executeRetry(jobToRetry: StoredJob, pdfProxy: PDFDocumentProxy, retryFileSize?: number) {
    if (starting || running || resumingJobId || retryingJobId) return
    setError("")
    setMissingApiKeyPrompt(false)

    try {
      const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()])
      if (!apiKey?.trim()) {
        setMissingApiKeyPrompt(true)
        setError("Gemini API key is required to retry failed pages.")
        return
      }

      setRetryingJobId(jobToRetry.id)
      setRunning(true)
      onRunningChange(true)
      setRecoveryStatus("Preparing retry for failed pages…")
      void syncActiveJob(jobToRetry.id)

      const controller = new AbortController()
      abortControllerRef.current = controller

      await retryFailedPages({
        jobId: jobToRetry.id,
        pdf: pdfProxy,
        fileName: jobToRetry.fileName,
        fileSize: retryFileSize ?? jobToRetry.fileSize,
        apiKey,
        settings,
        signal: controller.signal,
        onProgress: (updatedJob) => {
          setRecoveryStatus(`Retrying failed pages… (${updatedJob.completedPages}/${updatedJob.selectedPages.length})`)
          void refreshJobs()
          if (viewed?.job.id === jobToRetry.id) {
            void openSaved(updatedJob)
          }
          void syncActiveJob(jobToRetry.id)
        },
      })
    } catch (err: unknown) {
      if (abortControllerRef.current?.signal.aborted) {
        // Aborted locally
      } else {
        const msg = err instanceof Error ? err.message : "Could not retry failed pages."
        setError(msg)
      }
    } finally {
      abortControllerRef.current = null
      setRetryingJobId(null)
      setRunning(false)
      onRunningChange(false)
      setRecoveryStatus("")
      await refreshJobs()
      const finalJob = await getJob(jobToRetry.id)
      if (finalJob && viewed?.job.id === jobToRetry.id) {
        void openSaved(finalJob)
      }
      await syncActiveJob(jobToRetry.id)
    }
  }

  async function removeSaved(jobId: string) {
    if (exportingJobId) return
    try {
      await deleteJob(jobId)
      if (viewed?.job.id === jobId) { setViewed(null); setSelectedPage(null) }
      await refreshJobs()
    } catch {
      setError("Could not delete saved translation.")
    }
  }

  async function markPageForRegeneration(pageNumber: number) {
    if (!viewed || running || exportingJobId) return
    setError("")
    try {
      await updatePageRecord(viewed.job.id, pageNumber, {
        status: "failed",
        error: "Marked for regeneration by user",
      })
      const updatedJob = await recalculateJobProgress(viewed.job.id)
      await Promise.all([refreshJobs(), openSaved(updatedJob)])
      await syncActiveJob(viewed.job.id)
    } catch {
      setError("Could not mark this page for regeneration.")
    }
  }

  async function handleExport(
    jobId: string,
    completedCount: number,
    failedCount: number,
    skipConfirm = false,
  ) {
    if (exportingJobId) return
    if (!skipConfirm && failedCount > 0) {
      setPartialConfirm({ jobId, completedCount, failedCount })
      return
    }
    setPartialConfirm(null)
    setExportingJobId(jobId)
    setExportProgress(null)
    setError("")
    try {
      const result = await exportTranslatedPdf({
        jobId,
        onProgress: (p) => setExportProgress(p),
      })
      await downloadPdfBlob(result.blob, result.filename)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not export PDF."
      setError(msg)
    } finally {
      setExportingJobId(null)
      setExportProgress(null)
    }
  }

  function renderJobActions(
    targetJob: StoredJob | { id: string; completedPages: number; failedPages: number; cancelledPages: number; status: string },
    options: { showView?: boolean; showDelete?: boolean } = {}
  ) {
    const isExporting = exportingJobId === targetJob.id
    const isResuming = resumingJobId === targetJob.id
    const isRetrying = retryingJobId === targetJob.id
    const isFinished = FINISHED_JOB.has(targetJob.status)
    const exportDisabled = exportingJobId !== null || (running && job?.id === targetJob.id)

    return (
      <div className="flex flex-wrap items-center gap-2">
        {targetJob.completedPages > 0 && (!running || targetJob.id !== job?.id) && (
          <Button
            type="button"
            disabled={exportDisabled}
            onClick={() => void handleExport(targetJob.id, targetJob.completedPages, targetJob.failedPages + targetJob.cancelledPages)}
          >
            {isExporting
              ? `Preparing PDF… ${exportProgress ? `${exportProgress.processedPages}/${exportProgress.totalPages}` : ""}`
              : "Download PDF"}
          </Button>
        )}
        {!isFinished && (
          <Button
            type="button"
            variant="outline"
            disabled={running || exportingJobId !== null}
            onClick={() => void handleResume(targetJob.id)}
          >
            {isResuming ? "Resuming…" : "Resume"}
          </Button>
        )}
        {targetJob.failedPages > 0 && !running && (
          <Button
            type="button"
            variant="outline"
            disabled={running || exportingJobId !== null}
            onClick={async () => {
              const stored = "fileName" in targetJob ? (targetJob as StoredJob) : await getJob(targetJob.id)
              if (stored) void handleRetry(stored)
            }}
          >
            {isRetrying ? "Retrying…" : "Retry Failed Pages"}
          </Button>
        )}
        {options.showView && "fileName" in targetJob && (
          <Button type="button" variant="outline" onClick={() => void openSaved(targetJob as StoredJob)}>
            View
          </Button>
        )}
        {options.showDelete && (
          <Button
            type="button"
            variant="outline"
            disabled={exportingJobId !== null || (running && (job?.id === targetJob.id || isResuming || isRetrying))}
            onClick={() => void removeSaved(targetJob.id)}
          >
            Delete
          </Button>
        )}
      </div>
    )
  }

  const inProgressJob = savedJobs.find((j) => j.status === "submitted" || j.status === "processing")

  return (
    <section className="w-full space-y-4 text-left" aria-label="Translation">
      {/* Primary Action Card */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            disabled={!pdf || !selectedPages?.length || starting || running}
            onClick={() => void start()}
            className="w-full h-10 text-xs font-semibold shadow-xs cursor-pointer"
          >
            {starting ? "Starting…" : "Start Translation"}
          </Button>

          {running && runRef.current && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelling || cancelRequested}
              onClick={() => void cancel()}
              className="w-full text-xs cursor-pointer"
            >
              {cancelling ? "Cancelling…" : "Cancel Translation"}
            </Button>
          )}

          {running && (resumingJobId || retryingJobId) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={stopPolling}
              className="w-full text-xs cursor-pointer"
            >
              Stop Polling
            </Button>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Selected pages are uploaded directly to Gemini for translation.
        </p>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-center text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      {missingApiKeyPrompt && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-2 text-foreground" role="alert">
          <p className="font-semibold text-amber-700 dark:text-amber-400">Gemini API key required</p>
          <p>Gemini API key is required to translate, resume, or retry.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onNavigateSettings?.()
              window.dispatchEvent(new CustomEvent("pdf2imgvi-navigate-settings"))
            }}
            className="cursor-pointer"
          >
            Open Settings
          </Button>
        </div>
      )}

      {pdfPromptJob && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-xs space-y-2 text-foreground" role="region" aria-label="PDF selection for retry">
          <p className="font-semibold text-blue-700 dark:text-blue-400">Select Original PDF</p>
          <p>Please select the original PDF ({pdfPromptJob.fileName}, {pdfPromptJob.totalPages} pages) to retry failed pages.</p>
          <input
            type="file"
            accept="application/pdf"
            className="block text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
            onChange={(e) => void onPdfFileSelected(e)}
          />
          {pdfFileError && <p role="alert" className="text-xs text-destructive">{pdfFileError}</p>}
          <Button type="button" size="sm" variant="outline" onClick={() => { setPdfPromptJob(null); setPdfFileError("") }}>
            Cancel
          </Button>
        </div>
      )}

      {recoveryStatus && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs space-y-1.5 shadow-xs" aria-live="polite">
          <div className="flex justify-between font-medium">
            <span>{recoveryStatus}</span>
          </div>
        </div>
      )}

      {exportingJobId && exportProgress && (
        <div className="rounded-xl border border-border bg-card p-3.5 text-xs space-y-2 shadow-xs" aria-live="polite">
          <div className="flex justify-between font-semibold">
            <span>Creating PDF…</span>
            <span className="tabular-nums">{exportProgress.processedPages} / {exportProgress.totalPages} pages</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${Math.round((exportProgress.processedPages / exportProgress.totalPages) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {partialConfirm && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-2 text-foreground" role="alert">
          <p className="font-semibold text-amber-700 dark:text-amber-400">Some pages failed to translate</p>
          <p>
            {partialConfirm.completedCount} pages completed, {partialConfirm.failedCount} pages failed.
            Export the {partialConfirm.completedCount} successful pages anyway?
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={exportingJobId !== null}
              onClick={() => void handleExport(partialConfirm.jobId, partialConfirm.completedCount, partialConfirm.failedCount, true)}
              className="cursor-pointer"
            >
              Export {partialConfirm.completedCount} pages
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPartialConfirm(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {inProgressJob && !job && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-2.5 shadow-xs" aria-live="polite">
          <h3 className="font-semibold text-sm">Translation in progress</h3>
          <p className="font-medium text-xs truncate">{inProgressJob.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {inProgressJob.completedPages} / {inProgressJob.selectedPages.length} pages completed
          </p>
          {resumingJobId === inProgressJob.id ? (
            <p className="text-xs font-medium text-primary">{recoveryStatus || "Checking Gemini…"}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Gemini is processing this document.</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={running || exportingJobId !== null}
              onClick={() => void handleResume(inProgressJob.id)}
              className="cursor-pointer"
            >
              {resumingJobId === inProgressJob.id ? "Resuming…" : "Resume"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={running && (resumingJobId === inProgressJob.id || retryingJobId === inProgressJob.id)}
              onClick={() => void removeSaved(inProgressJob.id)}
              className="cursor-pointer"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {job && <TranslationProgress job={job} actions={renderJobActions(job)} />}

      {savedJobs.length > 0 && (
        <TranslationHistory
          savedJobs={savedJobs}
          viewed={viewed}
          selectedPage={selectedPage}
          resultUrl={resultUrl}
          running={running}
          exportingJobId={exportingJobId}
          renderJobActions={renderJobActions}
          onSelectPage={setSelectedPage}
          onRegenerate={markPageForRegeneration}
        />
      )}

    </section>
  )
}
