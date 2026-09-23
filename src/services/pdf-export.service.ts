import { PDFDocument } from "pdf-lib"

import {
  getJob as defaultGetJob,
  getPagesByJob as defaultGetPagesByJob,
  getPageImage as defaultGetPageImage,
} from "../storage/results.storage.ts"
import { getSettings as defaultGetSettings } from "../storage/settings.storage.ts"

export interface ExportProgress {
  currentPage: number
  processedPages: number
  totalPages: number
}

export interface ExportPdfOptions {
  jobId: string
  outputFilename?: string
  onProgress?: (progress: ExportProgress) => void
  deps?: {
    getJob?: typeof defaultGetJob
    getPagesByJob?: typeof defaultGetPagesByJob
    getPageImage?: typeof defaultGetPageImage
    getSettings?: typeof defaultGetSettings
  }
}

export interface ExportPdfResult {
  filename: string
  blob: Blob
  pageCount: number
}

function formatFilename(template: string, original: string): string {
  const stem = original.replace(/\.pdf$/i, "").trim()
  const name = (template || "{original}_vi.pdf").replaceAll("{original}", stem)
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`
}

export async function exportTranslatedPdf(options: ExportPdfOptions): Promise<ExportPdfResult> {
  const getJob = options.deps?.getJob ?? defaultGetJob
  const getPagesByJob = options.deps?.getPagesByJob ?? defaultGetPagesByJob
  const getPageImage = options.deps?.getPageImage ?? defaultGetPageImage
  const getSettings = options.deps?.getSettings ?? defaultGetSettings

  const job = await getJob(options.jobId)
  if (!job) {
    throw new Error("Translation job not found.")
  }

  const allPages = await getPagesByJob(options.jobId)
  const completedPages = allPages
    .filter((page) => page.status === "completed")
    .sort((a, b) => a.pageNumber - b.pageNumber)

  if (completedPages.length === 0) {
    throw new Error("No completed translated pages to export.")
  }

  const pdfDoc = await PDFDocument.create()

  for (let i = 0; i < completedPages.length; i++) {
    const pageMeta = completedPages[i]
    options.onProgress?.({
      currentPage: pageMeta.pageNumber,
      processedPages: i,
      totalPages: completedPages.length,
    })

    const imageBlob = await getPageImage(options.jobId, pageMeta.pageNumber)
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error(`Could not create the PDF because page ${pageMeta.pageNumber} image is missing.`)
    }

    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer())
    const isJpeg = imageBlob.type === "image/jpeg" || imageBlob.type === "image/jpg"
    const embeddedImage = isJpeg
      ? await pdfDoc.embedJpg(imageBytes)
      : await pdfDoc.embedPng(imageBytes)

    const width = pageMeta.width && pageMeta.width > 0 ? pageMeta.width : embeddedImage.width
    const height = pageMeta.height && pageMeta.height > 0 ? pageMeta.height : embeddedImage.height

    pdfDoc.addPage([width, height]).drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    })
  }

  options.onProgress?.({
    currentPage: completedPages[completedPages.length - 1].pageNumber,
    processedPages: completedPages.length,
    totalPages: completedPages.length,
  })

  const pdfBytes = await pdfDoc.save()
  const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" })

  let filename = options.outputFilename
  if (!filename) {
    const settings = await getSettings()
    filename = formatFilename(settings.outputFilenameTemplate, job.fileName)
  }

  return {
    filename,
    blob: pdfBlob,
    pageCount: completedPages.length,
  }
}

export async function downloadPdfBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  try {
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: false })
      return
    }
    if (typeof document !== "undefined") {
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}
