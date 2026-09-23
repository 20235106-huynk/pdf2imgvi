import type { PDFDocumentProxy } from "pdfjs-dist"
import type { OutputQuality } from "../types/settings"

export function pdfDocumentOptions(url: string, baseUrl: string) {
  return {
    url,
    wasmUrl: new URL("wasm/", baseUrl).href,
    verbosity: 0,
  }
}

const PDF_POINTS_PER_INCH = 72
const INPUT_DPI = 240
const INPUT_ASPECT_WIDTH = 9
const INPUT_ASPECT_HEIGHT = 16
const MAX_RENDER_PIXELS = 16_000_000
const MAX_RENDER_DIMENSION = 8192
const MAX_CANVAS_UNIT = Math.min(
  Math.floor(Math.sqrt(MAX_RENDER_PIXELS / (INPUT_ASPECT_WIDTH * INPUT_ASPECT_HEIGHT))),
  Math.floor(MAX_RENDER_DIMENSION / INPUT_ASPECT_HEIGHT),
)

export interface RenderedPage {
  pageNumber: number
  blob: Blob
  width: number
  height: number
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  _quality: OutputQuality,
): Promise<RenderedPage> {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new RangeError("Invalid PDF page number")
  }
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  if (!Number.isFinite(base.width) || !Number.isFinite(base.height)
    || base.width <= 0 || base.height <= 0) {
    throw new Error("Invalid PDF page dimensions")
  }
  const baseCanvasUnit = Math.max(base.width / INPUT_ASPECT_WIDTH, base.height / INPUT_ASPECT_HEIGHT)
  const scale = Math.min(INPUT_DPI / PDF_POINTS_PER_INCH, MAX_CANVAS_UNIT / baseCanvasUnit)
  const viewport = page.getViewport({ scale })
  const canvasUnit = Math.min(
    MAX_CANVAS_UNIT,
    Math.ceil(Math.max(viewport.width / INPUT_ASPECT_WIDTH, viewport.height / INPUT_ASPECT_HEIGHT)),
  )
  const canvas = document.createElement("canvas")
  canvas.width = INPUT_ASPECT_WIDTH * canvasUnit
  canvas.height = INPUT_ASPECT_HEIGHT * canvasUnit
  try {
    await page.render({
      canvas,
      viewport,
      transform: [1, 0, 0, 1, (canvas.width - viewport.width) / 2, (canvas.height - viewport.height) / 2],
      background: "white",
    }).promise
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error("Could not create image Blob"))
      }, "image/png")
    })
    return { pageNumber, blob, width: canvas.width, height: canvas.height }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
