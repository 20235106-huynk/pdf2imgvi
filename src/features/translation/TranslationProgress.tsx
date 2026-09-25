import type { ReactNode } from "react"
import type { TranslationJob } from "./model.ts"
import { translationProgressLabel } from "./translation-start.ts"

const FINISHED_BATCH_STATES = new Set(["completed", "failed", "cancelled"])

export function TranslationProgress({ job, actions }: { job: TranslationJob; actions: ReactNode }) {
  const completedBatches = job.batches.filter((batch) => batch.state === "completed").length
  const failedBatches = job.batches.filter((batch) => batch.state === "failed").length
  const activeBatches = job.batches.filter((batch) => !FINISHED_BATCH_STATES.has(batch.state)).length
  return (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 shadow-xs" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">{translationProgressLabel(job)}</p>
            <span className="text-xs font-semibold tabular-nums text-primary">
              {Math.round((job.completedPages / Math.max(1, job.pages.length)) * 100)}%
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${Math.round((job.completedPages / Math.max(1, job.pages.length)) * 100)}%` }}
            />
          </div>

          <p className="text-xs">
            {job.completedPages} completed · {job.failedPages} failed · {job.cancelledPages} cancelled / {job.pages.length} selected
          </p>
          <p className="text-[11px] text-muted-foreground">
            Batches: {completedBatches} completed · {activeBatches} pending/running · {failedBatches} failed
          </p>

          {job.pages.filter((page) => page.error).map((page) => (
            <p key={page.pageNumber} className="text-xs text-destructive">
              Page {page.pageNumber}: {page.error}
            </p>
          ))}

          <div className="pt-2">
            {actions}
          </div>
        </div>
  )
}
