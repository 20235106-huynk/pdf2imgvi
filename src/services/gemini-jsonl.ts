import type { BatchPageResult } from "../types/translation.ts"
import { translationPrompt } from "./translation-prompt.ts"

export function splitIntoBatches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("Invalid batch size")
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size))
}

export function buildBatchJsonl(
  jobId: string,
  pages: readonly { pageNumber: number; fileUri: string; mimeType: string }[],
  sourceLanguage: string,
  targetLanguage: string,
): Blob {
  const text = pages.map(({ pageNumber, fileUri, mimeType }) => JSON.stringify({
    key: `${jobId}:page:${pageNumber}`,
    request: {
      contents: [{ parts: [
        { text: translationPrompt(sourceLanguage, targetLanguage) },
        { file_data: { mime_type: mimeType, file_uri: fileUri } },
      ] }],
      generation_config: { responseModalities: ["TEXT", "IMAGE"] },
    },
  })).join("\n")
  return new Blob([`${text}\n`], { type: "application/jsonl" })
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function imageFromResponse(value: unknown): Blob | null {
  const response = record(value)
  const candidates = response?.candidates
  if (!Array.isArray(candidates)) return null
  for (const candidate of candidates) {
    const parts = record(record(candidate)?.content)?.parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      const data = record(record(part)?.inlineData ?? record(part)?.inline_data)
      const mimeType = data?.mimeType ?? data?.mime_type
      if (typeof mimeType !== "string" || !/^image\/(png|jpeg|webp)$/.test(mimeType)) continue
      if (typeof data?.data !== "string" || !data.data) continue
      try {
        const bytes = Uint8Array.from(atob(data.data), (character) => character.charCodeAt(0))
        return new Blob([bytes], { type: mimeType })
      } catch {
        return null
      }
    }
  }
  return null
}

export async function parseBatchResults(
  jsonl: string,
  jobId: string,
  expectedPages: readonly number[],
): Promise<BatchPageResult[]> {
  const expectedKeys = new Map(expectedPages.map((pageNumber) => [`${jobId}:page:${pageNumber}`, pageNumber]))
  const results = new Map<number, BatchPageResult>()
  for (const line of jsonl.split(/\r?\n/).filter((item) => item.trim())) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const row = record(parsed)
    const key = row?.key
    const pageNumber = typeof key === "string" ? expectedKeys.get(key) : undefined
    if (pageNumber === undefined) continue
    if (results.has(pageNumber)) {
      results.set(pageNumber, { pageNumber, error: "Duplicate result for page" })
      continue
    }
    const image = imageFromResponse(row?.response)
    results.set(pageNumber, image
      ? { pageNumber, image }
      : { pageNumber, error: row?.error ? "Gemini failed this page" : "Gemini returned no page image" })
  }
  return expectedPages.map((pageNumber) =>
    results.get(pageNumber) ?? { pageNumber, error: "Gemini returned no result for page" })
}
