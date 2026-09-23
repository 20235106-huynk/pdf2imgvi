import type { OutputQuality } from "./settings.ts"

export type PageStatus =
  | "pending"
  | "rendering"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"

export type BatchStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface TranslationPageJob {
  pageNumber: number
  status: PageStatus
  error?: string
  batchId?: string
}

export interface TranslationBatchJob {
  id: string
  pageNumbers: number[]
  state: BatchStatus
}

export interface TranslationJob {
  id: string
  pages: TranslationPageJob[]
  batches: TranslationBatchJob[]
  completedPages: number
  failedPages: number
  cancelledPages: number
  status: "running" | "completed" | "failed" | "cancelled"
  stage: "preparing" | "submitted" | "waiting" | "finished"
  geminiModel?: string
  outputQuality?: OutputQuality
}

export interface BatchPageResult {
  pageNumber: number
  image?: Blob
  error?: string
}
