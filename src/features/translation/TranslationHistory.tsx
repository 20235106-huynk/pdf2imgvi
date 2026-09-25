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
  return (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs" aria-label="Saved translations">
          <h2 className="text-sm font-bold tracking-tight">Saved translations</h2>
          <div className="divide-y divide-border/60">
            {savedJobs.map((saved) => (
              <div key={saved.id} className="flex flex-wrap items-center justify-between gap-2.5 py-3 first:pt-1 last:pb-0">
                <div className="min-w-0 max-w-[200px] sm:max-w-xs">
                  <p className="truncate text-xs font-semibold" title={saved.fileName}>
                    {saved.fileName}
                  </p>
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
                  <p className="font-semibold text-xs truncate">{viewed.job.fileName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {viewed.job.failedPages > 0
                      ? `${viewed.job.failedPages} page(s) failed. Retry Failed Pages will submit a new batch for failed pages.`
                      : "Review translated pages or download completed PDF."}
                  </p>
                </div>
                {renderJobActions(viewed.job)}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {viewed.pages.map((page) => (
                  <div key={page.pageNumber} className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedPage === page.pageNumber ? "default" : "outline"}
                      onClick={() => onSelectPage(page.status === "completed" ? page.pageNumber : null)}
                      className="text-xs h-7 px-2 cursor-pointer"
                    >
                      Page {page.pageNumber}: {page.status}
                    </Button>
                    {page.status === "completed" && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        disabled={running || exportingJobId !== null}
                        aria-label={`Mark page ${page.pageNumber} for regeneration`}
                        onClick={() => void onRegenerate(page.pageNumber)}
                        className="h-7 w-7 text-xs cursor-pointer"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {viewed.pages.filter((page) => page.error).map((page) => (
                <p key={page.pageNumber} className="text-xs text-destructive">
                  Page {page.pageNumber}: {page.error}
                </p>
              ))}

              {selectedPage !== null && resultUrl && (
                <div className="mt-3 flex justify-center rounded-xl border border-border/80 bg-muted/20 p-3">
                  <img
                    src={resultUrl}
                    alt={`Translated page ${selectedPage} from ${viewed.job.fileName}`}
                    className="max-w-full rounded-lg border border-border bg-white shadow-sm"
                  />
                </div>
              )}
            </div>
          )}
        </section>
  )
}
