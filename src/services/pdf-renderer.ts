import type { PDFDocumentProxy } from "pdfjs-dist"
import type { OutputQuality } from "../types/settings"

export const PDF_RENDER_SCALE: Record<OutputQuality, number> = {
  standard: 1.5,
  high: 2,
  "very-high": 3,
}

const MAX_RENDER_PIXELS = 16_000_000
const MAX_RENDER_DIMENSION = 8192

export interface RenderedPage {
  pageNumber: number
  blob: Blob
  width: number
  height: number
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  quality: OutputQuality,
): Promise<RenderedPage> {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new RangeError("Invalid PDF page number")
  }
  const targetScale = PDF_RENDER_SCALE[quality]
  if (!targetScale) throw new Error("Invalid render quality")

  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  if (!Number.isFinite(base.width) || !Number.isFinite(base.height)
    || base.width <= 0 || base.height <= 0) {
    throw new Error("Invalid PDF page dimensions")
  }
  const scale = Math.min(
    targetScale,
    Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height)),
    MAX_RENDER_DIMENSION / base.width,
    MAX_RENDER_DIMENSION / base.height,
  )
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  try {
    await page.render({ canvas, viewport }).promise
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
