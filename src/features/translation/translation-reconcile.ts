import { parseBatchResults } from "./gemini-jsonl.ts"
import type { GeminiBatchClient } from "./gemini-batch.ts"
import { jobStatus, type BatchStatus, type LocalBatchStatus, type StoredJob, type StoredPage, type TranslationBatchRecord } from "./model.ts"
import {
  getJob as defaultGetJob,
  getPagesByJob as defaultGetPagesByJob,
  getBatchesByJob as defaultGetBatchesByJob,
  updateBatch as defaultUpdateBatch,
  updatePageRecord as defaultUpdatePageRecord,
  updateJobRecord as defaultUpdateJobRecord,
  saveCompletedPage as defaultSaveCompletedPage,
} from "./results.storage.ts"

export function mapGeminiBatchState(state: BatchStatus | string | undefined): LocalBatchStatus {
  switch (state) {
    case "JOB_STATE_QUEUED":
    case "JOB_STATE_PENDING":
    case "pending":
      return "pending"
    case "JOB_STATE_RUNNING":
    case "JOB_STATE_CANCELLING":
    case "running":
      return "running"
    case "JOB_STATE_SUCCEEDED":
    case "completed":
      return "succeeded"
    case "JOB_STATE_FAILED":
    case "failed":
      return "failed"
    case "JOB_STATE_EXPIRED":
      return "expired"
    case "JOB_STATE_CANCELLED":
    case "cancelled":
      return "cancelled"
    default:
      return "pending"
  }
}

export interface ReconcileOptions {
  fileName?: string
  signal?: AbortSignal
  deps?: {
    getPagesByJob?: typeof defaultGetPagesByJob
    saveCompletedPage?: typeof defaultSaveCompletedPage
    updateBatch?: typeof defaultUpdateBatch
    updatePage?: (key: [string, number], patch: Partial<StoredPage>) => Promise<void>
    updatePageRecord?: typeof defaultUpdatePageRecord
  }
}

export async function reconcileBatch(
  batch: TranslationBatchRecord,
  client: Pick<GeminiBatchClient, "getBatch" | "downloadResults">,
  options: ReconcileOptions = {},
): Promise<LocalBatchStatus> {
  const getPagesByJob = options.deps?.getPagesByJob ?? defaultGetPagesByJob
  const saveCompletedPage = options.deps?.saveCompletedPage ?? defaultSaveCompletedPage
  const updateBatch = options.deps?.updateBatch ?? defaultUpdateBatch
  const updatePage = options.deps?.updatePage
    ? async (pNum: number, patch: Partial<StoredPage>) => options.deps!.updatePage!([batch.jobId, pNum], patch)
    : (options.deps?.updatePageRecord ?? defaultUpdatePageRecord).bind(null, batch.jobId)

  const remote = await client.getBatch(batch.batchName, options.signal)
  const raw = "rawState" in remote && typeof remote.rawState === "string" ? remote.rawState : remote.state
  const status = mapGeminiBatchState(raw)

  if (status === "succeeded") {
    if (batch.status !== "succeeded") {
      const responseFile = remote.responseFile
      if (!responseFile) throw new Error("Missing Gemini results file")
      const jsonl = await client.downloadResults(responseFile, options.signal)
      const results = await parseBatchResults(jsonl, batch.jobId, batch.pageNumbers)

      for (const result of results) {
        if (result.image) {
          await saveCompletedPage(batch.jobId, options.fileName ?? "document.pdf", result.pageNumber, result.image)
        } else {
          await updatePage(result.pageNumber, {
            status: "failed",
            error: result.error ?? "Gemini returned no image",
          })
        }
      }

      await updateBatch(batch.id, { status: "succeeded" })
    }
  } else if (status === "failed" || status === "expired") {
    await updateBatch(batch.id, {
      status,
      error: status === "expired" ? "Gemini batch expired before completion" : "Gemini batch failed",
    })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && page.status !== "completed") {
        await updatePage(pageNumber, {
          status: "failed",
          error: status === "expired" ? "Gemini batch expired before completion" : "Gemini batch failed",
        })
      }
    }
  } else if (status === "cancelled") {
    await updateBatch(batch.id, { status: "cancelled" })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && page.status !== "completed") {
        await updatePage(pageNumber, { status: "cancelled" })
      }
    }
  } else if (status === "running") {
    await updateBatch(batch.id, { status: "running" })
    const pages = await getPagesByJob(batch.jobId)
    for (const pageNumber of batch.pageNumbers) {
      const page = pages.find((p) => p.pageNumber === pageNumber)
      if (page && (page.status === "queued" || page.status === "pending")) {
        await updatePage(pageNumber, { status: "processing" })
      }
    }
  } else {
    await updateBatch(batch.id, { status: "pending" })
  }

  return status
}

export interface RecalculateDeps {
  getJob?: typeof defaultGetJob
  getPagesByJob?: typeof defaultGetPagesByJob
  getBatchesByJob?: typeof defaultGetBatchesByJob
  updateJob?: (id: string, patch: Partial<StoredJob>) => Promise<void>
  updateJobRecord?: typeof defaultUpdateJobRecord
}

export async function recalculateJobProgress(jobId: string, deps: RecalculateDeps = {}): Promise<StoredJob> {
  const getJob = deps.getJob ?? defaultGetJob
  const getPagesByJob = deps.getPagesByJob ?? defaultGetPagesByJob
  const getBatchesByJob = deps.getBatchesByJob ?? defaultGetBatchesByJob
  const updateJob = deps.updateJob
    ? async (patch: Partial<StoredJob>) => deps.updateJob!(jobId, patch)
    : (deps.updateJobRecord ?? defaultUpdateJobRecord).bind(null, jobId)

  const job = await getJob(jobId)
  if (!job) throw new Error("Translation job not found")

  const pages = await getPagesByJob(jobId)
  const batches = await getBatchesByJob(jobId)

  const completedPages = pages.filter((p) => p.status === "completed").length
  const failedPages = pages.filter((p) => p.status === "failed").length
  const cancelledPages = pages.filter((p) => p.status === "cancelled").length
  const status = jobStatus({ pages, completedPages, batches })

  const patch: Partial<StoredJob> = {
    completedPages,
    failedPages,
    cancelledPages,
    status,
    updatedAt: Date.now(),
  }

  await updateJob(patch)
  return {
    ...job,
    ...patch,
  }
}

