import type { PDFDocumentProxy } from "pdfjs-dist"

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
