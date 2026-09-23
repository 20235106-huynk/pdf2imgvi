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
import { parsePageSelection } from "./page-selection"
import { getPreviewScales } from "./preview-scale"

GlobalWorkerOptions.workerSrc = workerUrl

export function PdfPreview() {
  const inputRef = useRef<HTMLInputElement>(null)
  const chooseButtonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const [fileName, setFileName] = useState("")
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSelection, setPageSelection] = useState("")
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

  function removeFile() {
    generationRef.current += 1
    releaseCurrent()
    if (inputRef.current) inputRef.current.value = ""
    setPdf(null)
    setFileName("")
    setPageNumber(1)
    setPageSelection("")
    setLoading(false)
    setRendering(false)
    setError("")
    chooseButtonRef.current?.focus()
  }

  async function openFile(file: File) {
    const generation = ++generationRef.current
    releaseCurrent()
    setPdf(null)
    setPageNumber(1)
    setPageSelection("")
    setFileName(file.name)
    setError("")
    setLoading(true)
    setRendering(false)

    let url: string | null = null
    let task: PDFDocumentLoadingTask | null = null
    try {
      url = URL.createObjectURL(file)
      task = getDocument({ url, wasmUrl: new URL("wasm/", window.location.href).href })
      objectUrlRef.current = url
      loadingTaskRef.current = task
      const loaded = await task.promise
      if (generation === generationRef.current) {
        setPdf(loaded)
        setPageSelection(`1-${loaded.numPages}`)
      }
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

  const selectedPages = pdf ? parsePageSelection(pageSelection, pdf.numPages) : null

  useEffect(() => {
    if (!pdf) return
    const canvas = canvasRef.current
    if (!canvas) return
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
      const { cssScale, renderScale } = getPreviewScales(
        base.width, base.height, window.devicePixelRatio,
      )
      const viewport = page.getViewport({ scale: renderScale })
      currentCanvas.width = Math.max(1, Math.floor(viewport.width))
      currentCanvas.height = Math.max(1, Math.floor(viewport.height))
      currentCanvas.style.width = `${Math.round(base.width * cssScale)}px`
      currentCanvas.style.height = "auto"
      const task = page.render({ canvas: currentCanvas, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null
      }
      if (active && generation === generationRef.current) setRendering(false)
    }

    void renderPage(pdf, canvas).catch(() => {
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
      <div className="flex flex-wrap justify-center gap-2">
        <Button ref={chooseButtonRef} type="button" onClick={() => inputRef.current?.click()}>Choose PDF</Button>
        {fileName && <Button type="button" variant="outline" onClick={removeFile}>Remove PDF</Button>}
      </div>
      {fileName && <p className="max-w-full break-all text-sm">{fileName}</p>}
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {loading ? "Loading PDF…" : rendering ? "Rendering page…" : ""}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pdf && (
        <>
          <div className="w-full max-w-md text-left">
            <label htmlFor="page-selection" className="text-sm font-medium">Pages to translate</label>
            <input id="page-selection" type="text" value={pageSelection}
              onChange={(event) => setPageSelection(event.target.value)}
              aria-invalid={selectedPages === null}
              aria-describedby="page-selection-help page-selection-status"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p id="page-selection-help" className="mt-1 text-sm text-muted-foreground">
              Use ranges or individual pages, e.g. 1-3, 5, 8-10.
            </p>
            <p id="page-selection-status" aria-live="polite" aria-atomic="true"
              className={`mt-1 text-sm ${selectedPages ? "text-muted-foreground" : "text-destructive"}`}>
              {selectedPages
                ? `${selectedPages.length} ${selectedPages.length === 1 ? "page" : "pages"} selected`
                : `Enter page numbers between 1 and ${pdf.numPages}.`}
            </p>
          </div>
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
