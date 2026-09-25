import type { PDFDocumentProxy } from "pdfjs-dist"
import type { TranslationJob } from "./model.ts"

export function translationStartError(
  pdf: PDFDocumentProxy | null,
  selectedPages: readonly number[] | null,
  apiKey: string | null,
): string | null {
  if (!pdf) return "Choose a PDF before starting translation."
  if (!selectedPages?.length) return "Enter a valid page range before starting translation."
  if (!apiKey?.trim()) return "Add a Gemini API key in Settings before starting translation."
  return null
}

export function translationProgressLabel(job: Pick<TranslationJob, "status" | "stage">): string {
  if (job.status === "completed") return "Translation completed"
  if (job.status === "failed") return "Translation finished with errors"
  if (job.status === "cancelled") return "Translation cancelled"
  if (job.stage === "preparing") return "Preparing pages…"
  if (job.stage === "submitted") return "Batch submitted"
  return "Waiting for Gemini…"
}
