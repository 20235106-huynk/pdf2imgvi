import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import {
  UploadCloud,
  Loader2,
  FileUp,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { pdfDocumentOptions } from "@/features/pdf/pdf-renderer"
import { getPageImage, listJobs } from "@/features/translation/results.storage"
import { parsePageRange } from "./page-selection"
import { getPreviewScales } from "./preview-scale"
import { TranslationPanel } from "../translation/TranslationPanel"
import { PdfViewport } from "./PdfViewport"

GlobalWorkerOptions.workerSrc = workerUrl

interface PdfPreviewProps {
  onTranslationRunningChange: (running: boolean) => void
  onNavigateSettings?: () => void
}

type ViewMode = "original" | "translated" | "sideBySide"

export function PdfPreview({ onTranslationRunningChange, onNavigateSettings }: PdfPreviewProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const chooseButtonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sideCanvasRef = useRef<HTMLCanvasElement>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const generationRef = useRef(0)

  const [fileName, setFileName] = useState("")
  const [fileSize, setFileSize] = useState(0)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSelection, setPageSelection] = useState("")
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState("")
  const [translationRunning, setTranslationRunning] = useState(false)

  // Viewport mode
  const [viewMode, setViewMode] = useState<ViewMode>("original")
  const [isDragging, setIsDragging] = useState(false)

  // Translated image for current page
  const [translatedImageUrl, setTranslatedImageUrl] = useState<string | null>(null)
  const [loadingTranslatedImage, setLoadingTranslatedImage] = useState(false)

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

  function removeFile() {
    if (translationRunning) return
    generationRef.current += 1
    releaseCurrent()
    if (inputRef.current) inputRef.current.value = ""
    setPdf(null)
    setFileName("")
    setFileSize(0)
    setPageNumber(1)
    setPageSelection("")
    setLoading(false)
    setRendering(false)
    setError("")
    setTranslatedImageUrl(null)
    chooseButtonRef.current?.focus()
  }

  async function openFile(file: File) {
    if (translationRunning) return
    const generation = ++generationRef.current
    releaseCurrent()
    setPdf(null)
    setPageNumber(1)
    setPageSelection("")
    setFileName(file.name)
    setFileSize(file.size)
    setError("")
    setLoading(true)
    setRendering(false)
    setTranslatedImageUrl(null)

    let url: string | null = null
    let task: PDFDocumentLoadingTask | null = null
    try {
      url = URL.createObjectURL(file)
      task = getDocument(pdfDocumentOptions(url, window.location.href))
      objectUrlRef.current = url
      loadingTaskRef.current = task
      const loaded = await task.promise
      if (generation === generationRef.current) {
        setPdf(loaded)
        setPageSelection(`1-${loaded.numPages}`)
      }
    } catch (cause) {
      if (generation !== generationRef.current) return
      setError(
        cause instanceof PasswordException
          ? t("passwordProtected")
          : t("pdfError")
      )
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
    if (file && !translationRunning) void openFile(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!translationRunning) setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (translationRunning) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === "application/pdf") {
      void openFile(file)
    }
  }

  let selectedPages: number[] | null = null
  let selectionWarning = ""
  if (pdf) {
    try {
      selectedPages = parsePageRange(pageSelection, pdf.numPages)
    } catch (cause) {
      selectionWarning = cause instanceof Error ? cause.message : "Invalid page range."
    }
  }

  // Render PDF page to canvas
  useEffect(() => {
    if (!pdf) return
    const targetCanvas = viewMode === "sideBySide" ? sideCanvasRef.current : canvasRef.current
    if (!targetCanvas) return

    const generation = generationRef.current
    let active = true
    setRendering(true)
    setError("")

    async function renderPage(currentPdf: PDFDocumentProxy, currentCanvas: HTMLCanvasElement) {
      const previous = renderTaskRef.current
      if (previous) {
        previous.cancel()
        await previous.promise.catch(() => {})
        if (renderTaskRef.current === previous) renderTaskRef.current = null
      }
      if (!active || generation !== generationRef.current) return

      const page = await currentPdf.getPage(pageNumber)
      if (!active || generation !== generationRef.current) return
      const base = page.getViewport({ scale: 1 })
      const { renderScale } = getPreviewScales(
        base.width,
        base.height,
        window.devicePixelRatio,
      )
      const viewport = page.getViewport({ scale: renderScale })
      currentCanvas.width = Math.max(1, Math.floor(viewport.width))
      currentCanvas.height = Math.max(1, Math.floor(viewport.height))
      currentCanvas.style.width = ""
      currentCanvas.style.height = ""
      const task = page.render({ canvas: currentCanvas, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null
      }
      if (active && generation === generationRef.current) setRendering(false)
    }

    void renderPage(pdf, targetCanvas).catch(() => {
      if (active && generation === generationRef.current) {
        setRendering(false)
        setError(t("renderingPage"))
      }
    })
    return () => {
      active = false
      renderTaskRef.current?.cancel()
    }
  }, [pdf, pageNumber, viewMode])

  // Look up translated image for current page
  useEffect(() => {
    if (!fileName || (viewMode !== "translated" && viewMode !== "sideBySide")) {
      setTranslatedImageUrl(null)
      return
    }

    let active = true
    let currentObjectUrl: string | null = null
    setLoadingTranslatedImage(true)

    async function fetchTranslatedPage() {
      try {
        const jobs = await listJobs()
        const matchingJob = jobs.find((j) => j.fileName === fileName && j.completedPages > 0)
        if (matchingJob && active) {
          const blob = await getPageImage(matchingJob.id, pageNumber)
          if (blob && active) {
            currentObjectUrl = URL.createObjectURL(blob)
            setTranslatedImageUrl(currentObjectUrl)
            return
          }
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoadingTranslatedImage(false)
      }
      if (active) setTranslatedImageUrl(null)
    }

    void fetchTranslatedPage()

    return () => {
      active = false
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    }
  }, [fileName, pageNumber, viewMode, translationRunning])

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        disabled={translationRunning}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("choosePdf")}
        onChange={pickFile}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Document Viewport & Controls */}
        <section
          aria-label="Document Viewport"
          className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4"
        >
          {!pdf ? (
            /* Dropzone Empty State */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex min-h-[460px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                  : "border-border bg-card/50 hover:border-primary/50 hover:bg-card/80"
              }`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600/10 to-indigo-500/10 text-primary mb-4 shadow-xs">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">{t("dropzoneTitle")}</h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{t("dropzoneHint")}</p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  ref={chooseButtonRef}
                  type="button"
                  size="default"
                  disabled={translationRunning}
                  onClick={(e) => {
                    e.stopPropagation()
                    inputRef.current?.click()
                  }}
                  className="gap-2 shadow-xs cursor-pointer"
                >
                  <FileUp className="h-4 w-4" />
                  {t("choosePdf")}
                </Button>
              </div>

              {loading && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>{t("loadingPdf")}</span>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <PdfViewport
              pdf={pdf}
              fileName={fileName}
              fileSize={fileSize}
              pageNumber={pageNumber}
              viewMode={viewMode}
              rendering={rendering}
              loadingTranslatedImage={loadingTranslatedImage}
              translatedImageUrl={translatedImageUrl}
              translationRunning={translationRunning}
              canvasRef={canvasRef}
              sideCanvasRef={sideCanvasRef}
              setViewMode={setViewMode}
              setPageNumber={setPageNumber}
              removeFile={removeFile}
            />
          )}
        </section>

        {/* Right Column: Control & Job Hub (TranslationPanel) */}
        <section
          aria-label="Translation Controls and History"
          className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4"
        >
          {pdf && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <label htmlFor="page-selection" className="text-xs font-semibold text-foreground">
                {t("pagesToTranslate")}
              </label>
              <input
                id="page-selection"
                type="text"
                value={pageSelection}
                disabled={translationRunning}
                onChange={(event) => setPageSelection(event.target.value)}
                aria-invalid={selectedPages === null}
                aria-describedby="page-selection-help page-selection-status"
                className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                placeholder="vd: 1-5, 8, 10-12"
              />

              {/* Quick Presets */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={translationRunning}
                  onClick={() => setPageSelection(`1-${pdf.numPages}`)}
                  className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                >
                  {t("presetAll")}
                </button>
                <button
                  type="button"
                  disabled={translationRunning}
                  onClick={() => setPageSelection(String(pageNumber))}
                  className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                >
                  {t("presetCurrent")}
                </button>
                {pdf.numPages >= 5 && (
                  <button
                    type="button"
                    disabled={translationRunning}
                    onClick={() => setPageSelection("1-5")}
                    className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                  >
                    {t("presetFirst5")}
                  </button>
                )}
              </div>

              <p id="page-selection-help" className="mt-2 text-[11px] text-muted-foreground">
                {t("pageSelectionHelp")}
              </p>
              <p
                id="page-selection-status"
                aria-live="polite"
                aria-atomic="true"
                className={`mt-1 text-xs font-medium ${
                  selectedPages ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {selectedPages
                  ? t("pagesSelected", { count: selectedPages.length })
                  : selectionWarning}
              </p>
            </div>
          )}

          <TranslationPanel
            pdf={pdf}
            fileName={fileName}
            fileSize={fileSize}
            selectedPages={selectedPages}
            onRunningChange={(running) => {
              setTranslationRunning(running)
              onTranslationRunningChange(running)
            }}
            onNavigateSettings={onNavigateSettings}
          />
        </section>
      </div>
    </div>
  )
}
