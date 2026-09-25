import { GoogleGenAI } from "@google/genai"

import { MODEL_OPTIONS } from "../settings/settings.ts"
import type { BatchStatus } from "./model.ts"

const API = "https://generativelanguage.googleapis.com"
const FILE_NAME = /^files\/[A-Za-z0-9_-]+$/
const BATCH_NAME = /^batches\/[A-Za-z0-9_-]+$/

export interface GeminiBatchStatus {
  name: string
  state: BatchStatus
  responseFile?: string
}

function requireFileName(value: string): void {
  if (!FILE_NAME.test(value)) throw new Error("Invalid Gemini file name")
}

function requireBatchName(value: string): void {
  if (!BATCH_NAME.test(value)) throw new Error("Invalid Gemini batch name")
}

function batchStatus(state: string | undefined): BatchStatus {
  switch (state) {
    case "JOB_STATE_QUEUED":
    case "JOB_STATE_PENDING": return "pending"
    case "JOB_STATE_RUNNING":
    case "JOB_STATE_CANCELLING": return "running"
    case "JOB_STATE_SUCCEEDED": return "completed"
    case "JOB_STATE_FAILED":
    case "JOB_STATE_EXPIRED": return "failed"
    case "JOB_STATE_CANCELLED": return "cancelled"
    default: throw new Error("Unknown Gemini batch state")
  }
}

export function createGeminiBatchClient(
  apiKey: string,
  sdk: Pick<GoogleGenAI, "files" | "batches"> = new GoogleGenAI({ apiKey }),
  fetcher: typeof fetch = fetch,
) {
  if (!apiKey.trim()) throw new Error("Gemini API key is required")

  return {
    async uploadFile(blob: Blob, displayName: string, signal?: AbortSignal): Promise<{ name: string; uri: string }> {
      const file = await sdk.files.upload({ file: new File([blob], displayName, { type: blob.type }), config: {
        displayName, mimeType: blob.type, ...(signal ? { abortSignal: signal } : {}),
      } })
      if (typeof file.name !== "string" || typeof file.uri !== "string") {
        throw new Error("Invalid Gemini file response")
      }
      requireFileName(file.name)
      return { name: file.name, uri: file.uri }
    },

    async submitBatch(model: string, inputFileName: string, signal?: AbortSignal): Promise<string> {
      if (!MODEL_OPTIONS.some((option) => option.value === model)) throw new Error("Invalid Gemini model")
      requireFileName(inputFileName)
      const batch = await sdk.batches.create({
        model, src: inputFileName,
        config: { displayName: "pdf2imgvi-translation", ...(signal ? { abortSignal: signal } : {}) },
      })
      if (typeof batch.name !== "string") throw new Error("Invalid Gemini batch response")
      requireBatchName(batch.name)
      return batch.name
    },

    async getBatch(name: string, signal?: AbortSignal): Promise<GeminiBatchStatus> {
      requireBatchName(name)
      const batch = await sdk.batches.get({ name, ...(signal ? { config: { abortSignal: signal } } : {}) })
      if (batch.name !== name) throw new Error("Invalid Gemini batch status")
      const state = batchStatus(batch.state)
      const responseFile = batch.dest?.fileName
      if (responseFile !== undefined) requireFileName(responseFile)
      return { name, state, ...(responseFile ? { responseFile } : {}) }
    },

    async downloadResults(fileName: string, signal?: AbortSignal): Promise<string> {
      requireFileName(fileName)
      // The SDK's files.download writes to disk and is unavailable in Chrome.
      const response = await fetcher(`${API}/download/v1beta/${fileName}:download?alt=media`, {
        method: "GET", signal, headers: { "x-goog-api-key": apiKey },
      })
      if (!response.ok) throw new Error(`Gemini results download failed (HTTP ${response.status})`)
      return response.text()
    },

    async cancelBatch(name: string): Promise<void> {
      requireBatchName(name)
      await sdk.batches.cancel({ name })
    },
  }
}

export type GeminiBatchClient = ReturnType<typeof createGeminiBatchClient>
