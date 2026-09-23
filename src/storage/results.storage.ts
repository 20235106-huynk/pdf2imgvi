import Dexie, { type Table } from "dexie"

import type { AppSettings, OutputQuality } from "../types/settings.ts"
import type { PageStatus, TranslationJob } from "../types/translation.ts"

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

class ResultsDatabase extends Dexie {
  jobs!: Table<StoredJob, string>
  pages!: Table<StoredPage, [string, number]>
  batches!: Table<TranslationBatchRecord, string>

  constructor() {
    super("pdf2imgvi-results")
    this.version(1).stores({ pages: "[jobId+pageNumber],jobId" })
    this.version(2).stores({
      jobs: "id,createdAt",
      pages: "[jobId+pageNumber],jobId",
    }).upgrade((transaction) => transaction.table("pages").clear())
    this.version(3).stores({
      jobs: "id,createdAt",
      pages: "[jobId+pageNumber],jobId",
      batches: "id,jobId,batchName,createdAt",
    })
  }
}

const database = new ResultsDatabase()

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

export async function createJob(
  job: TranslationJob,
  file: { name: string; size: number; totalPages: number },
  settings: AppSettings,
): Promise<void> {
  const now = Date.now()
  await database.transaction("rw", database.jobs, database.pages, async () => {
    await database.jobs.add({
      id: job.id,
      fileName: file.name,
      fileSize: file.size,
      totalPages: file.totalPages,
      selectedPages: job.pages.map((page) => page.pageNumber),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      geminiModel: job.geminiModel ?? settings.geminiModel,
      outputQuality: job.outputQuality ?? settings.quality,
      status: "preparing",
      completedPages: 0,
      failedPages: 0,
      cancelledPages: 0,
      createdAt: now,
      updatedAt: now,
    })
    await database.pages.bulkAdd(job.pages.map((page) => ({
      jobId: job.id,
      pageNumber: page.pageNumber,
      status: "pending" as const,
      createdAt: now,
      updatedAt: now,
    })))
  })
}

export async function saveJobSnapshot(job: TranslationJob, changedPages: readonly number[]): Promise<void> {
  const now = Date.now()
  await database.transaction("rw", database.jobs, database.pages, async () => {
    const updated = await database.jobs.update(job.id, {
      status: jobStatus(job),
      completedPages: job.completedPages,
      failedPages: job.failedPages,
      cancelledPages: job.cancelledPages,
      updatedAt: now,
    })
    if (!updated) throw new Error("Translation job no longer exists")
    for (const page of job.pages.filter((item) => changedPages.includes(item.pageNumber))) {
      const changed = await database.pages.update([job.id, page.pageNumber], {
        status: page.status,
        batchName: page.batchId,
        error: page.error,
        updatedAt: now,
      })
      if (!changed) throw new Error("Translation page no longer exists")
    }
  })
}

export async function saveCompletedPage(
  jobId: string,
  _fileName: string,
  pageNumber: number,
  image: Blob,
): Promise<void> {
  await database.transaction("rw", database.jobs, database.pages, async () => {
    const job = await database.jobs.get(jobId)
    const page = await database.pages.get([jobId, pageNumber])
    if (!job || !page) throw new Error("Translation job or page no longer exists")
    const now = Date.now()
    await database.pages.update([jobId, pageNumber], {
      translatedImage: image,
      status: "completed",
      error: undefined,
      updatedAt: now,
    })
    const completedPages = job.completedPages + (page.status === "completed" ? 0 : 1)
    const finished = completedPages + job.failedPages + job.cancelledPages === job.selectedPages.length
    await database.jobs.update(jobId, {
      completedPages,
      status: finished ? (job.failedPages || job.cancelledPages ? "completed_with_errors" : "completed") : job.status,
      updatedAt: now,
    })
  })
}

export async function getJob(jobId: string): Promise<StoredJob | undefined> {
  return database.jobs.get(jobId)
}

export async function listJobs(): Promise<StoredJob[]> {
  return database.jobs.orderBy("createdAt").reverse().toArray()
}

export async function getPagesByJob(jobId: string): Promise<PageMetadata[]> {
  const pages: PageMetadata[] = []
  await database.pages.where("jobId").equals(jobId).each(({ translatedImage: _image, ...metadata }) => {
    pages.push(metadata)
  })
  return pages.sort((a, b) => a.pageNumber - b.pageNumber)
}

export async function getPageImage(jobId: string, pageNumber: number): Promise<Blob | undefined> {
  return (await database.pages.get([jobId, pageNumber]))?.translatedImage
}

export async function createBatchRecord(batch: TranslationBatchRecord): Promise<void> {
  await database.batches.put(batch)
}

export async function getBatchesByJob(jobId: string): Promise<TranslationBatchRecord[]> {
  return database.batches.where("jobId").equals(jobId).sortBy("createdAt")
}

export async function updateBatch(batchId: string, patch: Partial<TranslationBatchRecord>): Promise<void> {
  await database.batches.update(batchId, {
    ...patch,
    updatedAt: Date.now(),
  })
}

export async function deleteJob(jobId: string): Promise<void> {
  await database.transaction("rw", database.jobs, database.pages, database.batches, async () => {
    await database.batches.where("jobId").equals(jobId).delete()
    await database.pages.where("jobId").equals(jobId).delete()
    await database.jobs.delete(jobId)
  })
}

export async function updatePageRecord(
  jobId: string,
  pageNumber: number,
  patch: Partial<StoredPage>,
): Promise<void> {
  await database.pages.update([jobId, pageNumber], {
    ...patch,
    updatedAt: Date.now(),
  })
}

export async function updateJobRecord(
  jobId: string,
  patch: Partial<StoredJob>,
): Promise<void> {
  await database.jobs.update(jobId, {
    ...patch,
    updatedAt: Date.now(),
  })
}

export async function clearTranslationCache(): Promise<void> {
  await database.transaction("rw", database.jobs, database.pages, database.batches, async () => {
    await database.batches.clear()
    await database.pages.clear()
    await database.jobs.clear()
  })
}

