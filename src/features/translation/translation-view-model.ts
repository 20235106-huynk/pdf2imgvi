import type { BatchStatus, LocalBatchStatus, StoredJob, StoredPage, TranslationBatchRecord, TranslationJob } from "./model.ts"

function mapBatchState(status: LocalBatchStatus): BatchStatus {
  switch (status) {
    case "succeeded":
      return "completed"
    case "failed":
    case "expired":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "running":
      return "running"
    case "submitted":
    case "pending":
    default:
      return "pending"
  }
}

export function toTranslationJob(
  stored: StoredJob,
  pages: StoredPage[],
  batches: TranslationBatchRecord[],
): TranslationJob {
  const hasFailed = pages.some((p) => p.status === "failed")
  const allTerminal = pages.length > 0 && pages.every((p) => ["completed", "failed", "cancelled"].includes(p.status))

  let status: TranslationJob["status"] = "running"
  let stage: TranslationJob["stage"] = "waiting"

  if (allTerminal) {
    stage = "finished"
    if (hasFailed || stored.failedPages > 0 || stored.status === "completed_with_errors" || stored.status === "failed") {
      status = "failed"
    } else if (pages.every((p) => p.status === "cancelled")) {
      status = "cancelled"
    } else {
      status = "completed"
    }
  } else {
    status = "running"
    stage = stored.status === "preparing" ? "preparing" : stored.status === "submitted" ? "submitted" : "waiting"
  }

  const effectivePages: StoredPage[] = pages.length > 0
    ? pages
    : stored.selectedPages.map((pageNumber) => ({
        pageNumber,
        status: "pending" as const,
        jobId: stored.id,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
      }))

  return {
    id: stored.id,
    pages: effectivePages.map((p) => ({
      pageNumber: p.pageNumber,
      status: p.status,
      error: p.error,
      batchId: p.batchName,
    })),
    batches: batches.map((b) => ({
      id: b.batchName || b.id,
      pageNumbers: b.pageNumbers,
      state: mapBatchState(b.status),
    })),
    completedPages: stored.completedPages,
    failedPages: stored.failedPages,
    cancelledPages: stored.cancelledPages,
    status,
    stage,
    geminiModel: stored.geminiModel,
    outputQuality: stored.outputQuality,
  }
}

