import type { GeminiBatchClient } from "./gemini-batch.ts"
import type { StoredJob, TranslationBatchRecord } from "./model.ts"
import { getJob as defaultGetJob, getBatchesByJob as defaultGetBatchesByJob } from "./results.storage.ts"
import { abortableDelay } from "./translation-job.ts"
import { reconcileBatch, recalculateJobProgress } from "./translation-reconcile.ts"

export interface ResumeJobOptions {
  jobId: string
  client: GeminiBatchClient
  pollingIntervalMs: number
  signal?: AbortSignal
  onProgress?: (job: StoredJob) => void
  deps?: {
    getJob?: typeof defaultGetJob
    getBatchesByJob?: typeof defaultGetBatchesByJob
    reconcileBatch?: typeof reconcileBatch
    recalculateJobProgress?: typeof recalculateJobProgress
    sleep?: typeof abortableDelay
  }
}

export async function resumeJob(options: ResumeJobOptions): Promise<void> {
  const getJob = options.deps?.getJob ?? defaultGetJob
  const getBatchesByJob = options.deps?.getBatchesByJob ?? defaultGetBatchesByJob
  const doReconcile = options.deps?.reconcileBatch ?? reconcileBatch
  const doRecalculate = options.deps?.recalculateJobProgress ?? recalculateJobProgress
  const sleep = options.deps?.sleep ?? abortableDelay

  const job = await getJob(options.jobId)
  if (!job) throw new Error("Translation job not found")

  let batches = await getBatchesByJob(options.jobId)
  const nonTerminal = batches.filter((b) => !["succeeded", "failed", "cancelled", "expired"].includes(b.status))

  for (const batch of nonTerminal) {
    if (options.signal?.aborted) return
    try {
      await doReconcile(batch, options.client, {
        fileName: job.fileName,
        signal: options.signal,
      })
    } catch {
      // Continue reconciling remaining batches
    }
  }

  let updatedJob = await doRecalculate(options.jobId)
  options.onProgress?.(updatedJob)

  while (true) {
    if (options.signal?.aborted) return
    batches = await getBatchesByJob(options.jobId)
    const active = batches.filter((b) => ["submitted", "pending", "running"].includes(b.status))
    if (active.length === 0) break

    try {
      await sleep(options.pollingIntervalMs, options.signal)
    } catch {
      if (options.signal?.aborted) return
    }

    for (const batch of active) {
      if (options.signal?.aborted) return
      try {
        await doReconcile(batch, options.client, {
          fileName: job.fileName,
          signal: options.signal,
        })
      } catch {
        // Status request can fail temporarily
      }
    }

    updatedJob = await doRecalculate(options.jobId)
    options.onProgress?.(updatedJob)
  }

  await doRecalculate(options.jobId)
}

