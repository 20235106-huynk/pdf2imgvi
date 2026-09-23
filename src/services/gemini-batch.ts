import { MODEL_OPTIONS } from "../types/settings.ts"

const API = "https://generativelanguage.googleapis.com"
const FILE_NAME = /^files\/[A-Za-z0-9_-]+$/
const BATCH_NAME = /^batches\/[A-Za-z0-9_-]+$/

export interface GeminiBatchStatus {
  name: string
  state: string
  responseFile?: string
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function requireFileName(value: string): void {
  if (!FILE_NAME.test(value)) throw new Error("Invalid Gemini file name")
}

function requireBatchName(value: string): void {
  if (!BATCH_NAME.test(value)) throw new Error("Invalid Gemini batch name")
}

export function createGeminiBatchClient(apiKey: string, fetcher: typeof fetch = fetch) {
  if (!apiKey.trim()) throw new Error("Gemini API key is required")
  const auth = { "x-goog-api-key": apiKey }

  async function checked(url: string, init: RequestInit, action: string): Promise<Response> {
    const response = await fetcher(url, init)
    if (!response.ok) throw new Error(`Gemini ${action} failed (HTTP ${response.status})`)
    return response
  }

  async function json(response: Response, action: string): Promise<Record<string, unknown>> {
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new Error(`Invalid Gemini ${action} response`)
    }
    const result = record(value)
    if (!result) throw new Error(`Invalid Gemini ${action} response`)
    return result
  }

  return {
    async uploadFile(blob: Blob, displayName: string, signal?: AbortSignal): Promise<{ name: string; uri: string }> {
      const start = await checked(`${API}/upload/v1beta/files`, {
        method: "POST",
        signal,
        headers: {
          ...auth,
          "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(blob.size),
          "X-Goog-Upload-Header-Content-Type": blob.type,
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      }, "upload start")
      const uploadUrl = start.headers.get("X-Goog-Upload-URL")
      if (!uploadUrl) throw new Error("Missing Gemini upload URL")
      let parsedUrl: URL
      try {
        parsedUrl = new URL(uploadUrl)
      } catch {
        throw new Error("Invalid Gemini upload URL")
      }
      if (parsedUrl.origin !== API || !parsedUrl.pathname.startsWith("/upload/")) {
        throw new Error("Unexpected Gemini upload URL")
      }
      const finish = await checked(uploadUrl, {
        method: "POST",
        signal,
        headers: {
          ...auth,
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        },
        body: blob,
      }, "upload finalize")
      const file = record((await json(finish, "upload")).file)
      if (typeof file?.name !== "string" || typeof file.uri !== "string") {
        throw new Error("Invalid Gemini file response")
      }
      requireFileName(file.name)
      return { name: file.name, uri: file.uri }
    },

    async submitBatch(model: string, inputFileName: string, signal?: AbortSignal): Promise<string> {
      if (!MODEL_OPTIONS.some((option) => option.value === model)) throw new Error("Invalid Gemini model")
      requireFileName(inputFileName)
      const response = await checked(`${API}/v1beta/models/${model}:batchGenerateContent`, {
        method: "POST",
        signal,
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ batch: {
          display_name: "pdf2imgvi-translation",
          input_config: { file_name: inputFileName },
        } }),
      }, "batch submission")
      const result = await json(response, "batch submission")
      if (typeof result.name !== "string") throw new Error("Invalid Gemini batch response")
      requireBatchName(result.name)
      return result.name
    },

    async getBatch(name: string, signal?: AbortSignal): Promise<GeminiBatchStatus> {
      requireBatchName(name)
      const response = await checked(`${API}/v1beta/${name}`, {
        method: "GET", signal, headers: auth,
      }, "batch status")
      const result = await json(response, "batch status")
      const metadata = record(result.metadata)
      const output = record(result.response)
      if (result.name !== name || typeof metadata?.state !== "string") {
        throw new Error("Invalid Gemini batch status")
      }
      const responseFile = output?.responsesFile
      if (responseFile !== undefined && typeof responseFile !== "string") {
        throw new Error("Invalid Gemini results file")
      }
      if (typeof responseFile === "string") requireFileName(responseFile)
      return { name, state: metadata.state, ...(responseFile ? { responseFile } : {}) }
    },

    async downloadResults(fileName: string, signal?: AbortSignal): Promise<string> {
      requireFileName(fileName)
      const response = await checked(`${API}/download/v1beta/${fileName}:download?alt=media`, {
        method: "GET", signal, headers: auth,
      }, "results download")
      return response.text()
    },

    async cancelBatch(name: string): Promise<void> {
      requireBatchName(name)
      await checked(`${API}/v1beta/${name}:cancel`, {
        method: "POST", headers: auth,
      }, "batch cancellation")
    },
  }
}

export type GeminiBatchClient = ReturnType<typeof createGeminiBatchClient>
