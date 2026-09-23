import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"

import { Button } from "@/components/ui/button"
import { createGeminiBatchClient } from "@/services/gemini-batch"
import { renderPdfPage } from "@/services/pdf-renderer"
import { abortableDelay, startTranslation } from "@/services/translation-job"
import { getApiKey } from "@/storage/api-key.storage"
import { registerBatch, unregisterBatch } from "@/storage/active-batches.storage"
import { listCompletedPages, removeResults, saveCompletedPage, type CompletedPage } from "@/storage/results.storage"
import { getSettings } from "@/storage/settings.storage"
import type { TranslationJob } from "@/types/translation"
import { translationProgressLabel, translationStartError } from "./translation-start"

interface Props {
  pdf: PDFDocumentProxy | null
  fileName: string
  selectedPages: number[] | null
  onRunningChange: (running: boolean) => void
}

const TERMINAL_BATCH = new Set(["completed", "failed", "cancelled"])

export function TranslationPanel({ pdf, fileName, selectedPages, onRunningChange }: Props) {
  const [job, setJob] = useState<TranslationJob | null>(null)
  const jobRef = useRef<TranslationJob | null>(null)
  const runRef = useRef<ReturnType<typeof startTranslation> | null>(null)
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<CompletedPage[]>([])
  const [selectedResult, setSelectedResult] = useState("")
  const [resultUrl, setResultUrl] = useState("")

  async function refreshSaved() {
    const rows = await listCompletedPages()
    rows.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.pageNumber - b.pageNumber)
    setSaved(rows)
    setSelectedResult((current) => rows.some((row) => `${row.jobId}:${row.pageNumber}` === current)
      ? current
      : rows.length ? `${rows[0].jobId}:${rows[0].pageNumber}` : "")
  }

  useEffect(() => {
    void refreshSaved().catch(() => setError("Could not load saved results."))
    const refresh = () => { void refreshSaved().catch(() => setError("Could not load saved results.")) }
    window.addEventListener("pdf2imgvi-results-changed", refresh)
    return () => window.removeEventListener("pdf2imgvi-results-changed", refresh)
  }, [])

  useEffect(() => {
    const row = saved.find((item) => `${item.jobId}:${item.pageNumber}` === selectedResult)
    if (!row) { setResultUrl(""); return }
    const url = URL.createObjectURL(row.image)
    setResultUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [saved, selectedResult])

  async function start() {
    if (starting || running) return
    setStarting(true)
    setError("")
    setCancelRequested(false)
    try {
      const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()])
      const validation = translationStartError(pdf, selectedPages, apiKey)
      if (validation) { setError(validation); return }
      if (!pdf || !selectedPages || !apiKey) return

      const response: unknown = await chrome.runtime.sendMessage({ type: "REGISTER_WORKSPACE" })
      const tabId = typeof response === "object" && response !== null && "tabId" in response
        ? response.tabId : null
      if (typeof tabId !== "number" || !Number.isSafeInteger(tabId)) {
        throw new Error("Could not identify workspace tab")
      }

      const client = createGeminiBatchClient(apiKey)
      const run = startTranslation({
        pdf, fileName, pages: [...selectedPages], settings, apiKey, tabId,
        onChange: (next) => {
          const previousCompleted = jobRef.current?.completedPages ?? 0
          jobRef.current = next
          setJob(next)
          if (next.completedPages > previousCompleted) {
            void refreshSaved().catch(() => setError("Could not load saved results."))
          }
        },
      }, {
        renderPage: renderPdfPage,
        client,
        saveCompletedPage,
        registerBatch,
        unregisterBatch,
        sleep: abortableDelay,
      })
      runRef.current = run
      setRunning(true)
      onRunningChange(true)
      void run.finished.then(async () => {
        await refreshSaved()
        const active = jobRef.current?.status === "running"
        setRunning(active)
        onRunningChange(active)
      }).catch(() => setError("Translation stopped unexpectedly."))
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
      await refreshSaved()
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

  async function removeSaved(jobId: string) {
    try {
      await removeResults(jobId)
      await refreshSaved()
    } catch {
      setError("Could not remove saved results.")
    }
  }

  const savedJobs = [...new Map(saved.map((row) => [row.jobId, row.fileName])).entries()]
  const selected = saved.find((row) => `${row.jobId}:${row.pageNumber}` === selectedResult)
  const completedBatches = job?.batches.filter((batch) => batch.state === "completed").length ?? 0
  const failedBatches = job?.batches.filter((batch) => batch.state === "failed").length ?? 0
  const activeBatches = job?.batches.filter((batch) => !TERMINAL_BATCH.has(batch.state)).length ?? 0

  return (
    <section className="mt-6 w-full max-w-4xl space-y-4 text-left" aria-label="Translation">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" disabled={!pdf || !selectedPages?.length || starting || running}
          onClick={() => void start()}>
          {starting ? "Starting…" : "Start Translation"}
        </Button>
        {running && <Button type="button" variant="outline" disabled={cancelling || cancelRequested}
          onClick={() => void cancel()}>
          {cancelling ? "Cancelling…" : "Cancel Translation"}
        </Button>}
      </div>
      <p className="text-center text-sm text-muted-foreground">Selected pages are uploaded directly to Gemini for translation.</p>
      {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
      {job && (
        <div className="rounded-md border p-4" aria-live="polite">
          <p className="font-medium">{translationProgressLabel(job)}</p>
          <p>{job.completedPages} completed · {job.failedPages} failed · {job.cancelledPages} cancelled / {job.pages.length} selected</p>
          <p className="text-sm text-muted-foreground">Batches: {completedBatches} completed · {activeBatches} pending/running · {failedBatches} failed</p>
          {job.pages.filter((page) => page.error).map((page) =>
            <p key={page.pageNumber} className="text-sm text-destructive">Page {page.pageNumber}: {page.error}</p>)}
        </div>
      )}
      {savedJobs.length > 0 && (
        <section className="space-y-4 rounded-md border p-4" aria-label="Saved translated pages">
          <h2 className="text-lg font-semibold">Saved translated pages</h2>
          {savedJobs.map(([jobId, name]) => (
            <div key={jobId} className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-all text-sm font-medium">{name}</p>
                <Button type="button" variant="outline" onClick={() => void removeSaved(jobId)}>Remove saved results</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {saved.filter((row) => row.jobId === jobId).map((row) => (
                  <Button key={row.pageNumber} type="button" variant={selectedResult === `${jobId}:${row.pageNumber}` ? "default" : "outline"}
                    onClick={() => setSelectedResult(`${jobId}:${row.pageNumber}`)}>
                    Page {row.pageNumber}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {selected && resultUrl && <img src={resultUrl} alt={`Translated page ${selected.pageNumber} from ${selected.fileName}`}
            className="mx-auto max-w-full rounded border bg-white shadow-sm" />}
        </section>
      )}
    </section>
  )
}
