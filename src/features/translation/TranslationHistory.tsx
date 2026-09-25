import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { PageMetadata, StoredJob } from "./model.ts"

interface Props {
  savedJobs: StoredJob[]
  viewed: { job: StoredJob; pages: PageMetadata[] } | null
  selectedPage: number | null
  resultUrl: string
  running: boolean
  exportingJobId: string | null
  renderJobActions: (job: StoredJob, options?: { showView?: boolean; showDelete?: boolean }) => ReactNode
  onSelectPage: (pageNumber: number | null) => void
  onRegenerate: (pageNumber: number) => Promise<void>
}

export function TranslationHistory({ savedJobs, viewed, selectedPage, resultUrl, running, exportingJobId, renderJobActions, onSelectPage, onRegenerate }: Props) {
  const pages = viewed?.pages ?? []
  const currentIndex = pages.findIndex((page) => page.pageNumber === selectedPage)
  const currentPage = pages[currentIndex]
  const markedCount = pages.filter((page) => page.retryRequested).length
  const attentionPages = pages.filter((page) => page.status === "failed" || page.retryRequested)
  const nextAttention = attentionPages.find((page) => page.pageNumber > (selectedPage ?? 0)) ?? attentionPages[0]

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5" aria-label="Saved translations">
      <h2 className="text-sm font-bold tracking-tight">Saved translations</h2>
      <div className="divide-y divide-border/60">
        {savedJobs.map((saved) => (
          <div key={saved.id} className="flex flex-wrap items-center justify-between gap-2.5 py-3 first:pt-1 last:pb-0">
            <div className="min-w-0 max-w-[200px] sm:max-w-xs">
              <p className="truncate text-xs font-semibold" title={saved.fileName}>{saved.fileName}</p>
              <p className="text-[11px] text-muted-foreground">
                {saved.completedPages} / {saved.selectedPages.length} completed · {saved.failedPages} failed · {saved.status.replaceAll("_", " ")}
              </p>
            </div>
            {renderJobActions(saved, { showView: true, showDelete: true })}
          </div>
        ))}
      </div>

      {viewed && (
        <div className="space-y-3 border-t border-border/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{viewed.job.fileName}</p>
              <p className="text-[11px] text-muted-foreground">
                {pages.length} pages · {viewed.job.failedPages} failed · {markedCount} marked for retry
              </p>
            </div>
            {renderJobActions(viewed.job)}
          </div>

          {pages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button type="button" size="sm" variant="outline" disabled={currentIndex <= 0}
                onClick={() => onSelectPage(pages[currentIndex - 1].pageNumber)} aria-label="Previous translated page">
                Previous
              </Button>
              <form className="flex items-center gap-1" onSubmit={(event) => {
                event.preventDefault()
                const pageNumber = Number(new FormData(event.currentTarget).get("page"))
                if (pages.some((page) => page.pageNumber === pageNumber)) onSelectPage(pageNumber)
                else event.currentTarget.reset()
              }}>
                <label htmlFor="review-page">Page</label>
                <input key={selectedPage} id="review-page" name="page" type="number" min={1} max={viewed.job.totalPages}
                  defaultValue={selectedPage ?? ""} aria-label="Go to translated page"
                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm" />
                / {viewed.job.totalPages}
                <Button type="submit" size="sm" variant="outline">Go</Button>
              </form>
              <Button type="button" size="sm" variant="outline" disabled={currentIndex < 0 || currentIndex >= pages.length - 1}
                onClick={() => onSelectPage(pages[currentIndex + 1].pageNumber)} aria-label="Next translated page">
                Next
              </Button>
              {nextAttention && (
                <Button type="button" size="sm" variant="outline" onClick={() => onSelectPage(nextAttention.pageNumber)}>
                  Next needing attention ({attentionPages.length})
                </Button>
              )}
            </div>
          )}

          {currentPage && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className={currentPage.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                Page {currentPage.pageNumber}: {currentPage.status}{currentPage.retryRequested ? " · marked for retry" : ""}
                {currentPage.error ? ` · ${currentPage.error}` : ""}
              </p>
              {currentPage.status === "completed" && (
                <Button type="button" size="sm" variant={currentPage.retryRequested ? "secondary" : "outline"}
                  disabled={running || exportingJobId !== null}
                  aria-label={currentPage.retryRequested ? `Unmark page ${currentPage.pageNumber} for regeneration` : `Mark page ${currentPage.pageNumber} for regeneration`}
                  onClick={() => void onRegenerate(currentPage.pageNumber)}>
                  {currentPage.retryRequested ? "Unmark retry" : "Mark for retry"}
                </Button>
              )}
            </div>
          )}

          {selectedPage !== null && resultUrl && (
            <div className="mt-3 flex justify-center rounded-xl border border-border/80 bg-muted/20 p-3">
              <div className="flex aspect-[210/297] w-full max-w-[900px] items-center justify-center bg-white shadow-sm">
                <img src={resultUrl} alt={`Translated page ${selectedPage} from ${viewed.job.fileName}`}
                  className="max-h-full max-w-full object-contain" />
              </div>
            </div>
          )}
          {currentPage && !resultUrl && <p className="text-xs text-muted-foreground">No translated image for this page yet.</p>}
        </div>
      )}
    </section>
  )
}
