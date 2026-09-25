import { useEffect, useState } from "react"
import {
  Sparkles,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Sun,
  Moon,
  Languages,
  SlidersHorizontal,
  Download,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import { getApiKey } from "@/storage/api-key.storage"
import { listJobs, type StoredJob } from "@/storage/results.storage"
import { exportTranslatedPdf, downloadPdfBlob } from "@/services/pdf-export.service"

type OpenWorkspaceMessage = {
  type: "OPEN_WORKSPACE"
}

export function Popup() {
  const { lang, toggleLanguage, t } = useI18n()
  const { isDark, toggleTheme } = useTheme()
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [recentJobs, setRecentJobs] = useState<StoredJob[]>([])
  const [exportingId, setExportingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getApiKey()
      .then((key) => {
        if (active) setHasApiKey(Boolean(key && key.trim().length > 0))
      })
      .catch(() => {
        if (active) setHasApiKey(false)
      })

    void listJobs()
      .then((jobs) => {
        if (active) setRecentJobs(jobs.slice(0, 2))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const openTranslator = () => {
    const message = { type: "OPEN_WORKSPACE" } satisfies OpenWorkspaceMessage
    void chrome.runtime.sendMessage(message).catch(console.error)
  }

  const handleDownload = async (job: StoredJob) => {
    if (exportingId) return
    setExportingId(job.id)
    try {
      const result = await exportTranslatedPdf({ jobId: job.id })
      await downloadPdfBlob(result.blob, result.filename)
    } catch {
      openTranslator()
    } finally {
      setExportingId(null)
    }
  }

  const activeJob = recentJobs.find((j) => j.status === "submitted" || j.status === "processing")

  return (
    <div className="flex w-[380px] flex-col p-4 gap-4 bg-background text-foreground text-xs select-none">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight">pdf2imgvi</span>
              <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                Studio
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{t("appSubtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            title={t("language")}
            aria-label={t("language")}
          >
            <Languages className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            title={isDark ? t("lightMode") : t("darkMode")}
            aria-label={isDark ? t("lightMode") : t("darkMode")}
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* API Key Status Pill */}
      <div>
        {hasApiKey === null ? (
          <div className="h-7 w-full animate-pulse rounded-lg bg-muted/40" />
        ) : hasApiKey ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t("apiReady")}</span>
            </div>
            <span className="text-[10px] opacity-75">Gemini AI</span>
          </div>
        ) : (
          <div
            onClick={openTranslator}
            className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/15 p-2.5 text-amber-800 dark:text-amber-300 cursor-pointer hover:bg-amber-500/20 transition-colors"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{t("noApiKey")}</span>
            </div>
            <span className="text-[10px] underline">{t("openSettings")}</span>
          </div>
        )}
      </div>

      {/* Active Job Tracker (if running) */}
      {activeJob && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-primary">{t("inProgress")}</span>
            <span className="text-[10px] text-muted-foreground">
              {activeJob.completedPages} / {activeJob.selectedPages.length}
            </span>
          </div>
          <p className="truncate text-[11px] font-medium" title={activeJob.fileName}>
            {activeJob.fileName}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-500/20">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.round(
                  (activeJob.completedPages / Math.max(1, activeJob.selectedPages.length)) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Main Launch Action */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div>
          <h2 className="font-bold text-sm tracking-tight">{t("openStudio")}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            {t("openStudioDesc")}
          </p>
        </div>

        <Button
          type="button"
          size="default"
          onClick={openTranslator}
          className="w-full gap-2 h-10 font-semibold shadow-xs cursor-pointer"
        >
          <ExternalLink className="h-4 w-4" />
          <span>{t("openStudio")}</span>
        </Button>
      </div>

      {/* Recent Documents */}
      {recentJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{t("recentDocs")}</span>
            <button
              type="button"
              onClick={openTranslator}
              className="text-primary hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>

          <div className="space-y-1.5">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-2xs hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold" title={job.fileName}>
                      {job.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {job.completedPages} / {job.selectedPages.length} {t("completed").toLowerCase()}
                    </p>
                  </div>
                </div>

                {job.completedPages > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={exportingId === job.id}
                    onClick={() => void handleDownload(job)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={t("downloadPdf")}
                  >
                    {exportingId === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
