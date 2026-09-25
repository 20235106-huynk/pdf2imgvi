import type { OutputQuality } from "../settings/settings.ts"

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

export type StoredJobStatus = "preparing" | "submitted" | "processing" | "completed" | "completed_with_errors" | "failed"

export interface StoredJob {
  id: string
  fileName: string
  fileSize: number
  totalPages: number
  selectedPages: number[]
  sourceLanguage: string
  targetLanguage: string
  geminiModel: string
  outputQuality?: OutputQuality
  status: StoredJobStatus
  completedPages: number
  failedPages: number
  cancelledPages: number
  createdAt: number
  updatedAt: number
}

export interface StoredPage {
  jobId: string
  pageNumber: number
  status: PageStatus
  retryRequested?: boolean
  batchName?: string
  width?: number
  height?: number
  translatedImage?: Blob
  error?: string
  createdAt: number
  updatedAt: number
}

export type LocalBatchStatus =
  | "submitted"
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"

export interface TranslationBatchRecord {
  id: string
  jobId: string
  batchName: string
  model: string
  pageNumbers: number[]
  status: LocalBatchStatus
  createdAt: number
  updatedAt: number
  error?: string
}

export type PageMetadata = Omit<StoredPage, "translatedImage">

export function jobStatus(job: {
  pages: { status: string }[]
  completedPages: number
  batches?: unknown[]
}): StoredJobStatus {
  const terminal = job.pages.length > 0 && job.pages.every((page) => ["completed", "failed", "cancelled"].includes(page.status))
  if (terminal) {
    if (job.completedPages === job.pages.length) return "completed"
    return job.completedPages > 0 ? "completed_with_errors" : "failed"
  }
  if (job.pages.some((page) => page.status === "processing")) return "processing"
  if ((job.batches && job.batches.length > 0) || job.pages.some((page) => page.status === "queued")) return "submitted"
  return "preparing"
}
