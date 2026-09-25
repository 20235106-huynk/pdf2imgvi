import { useEffect, useState } from "react"
import {
  Sparkles,
  FileText,
  SlidersHorizontal,
  Sun,
  Moon,
  Languages,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import { getApiKey } from "@/features/settings/api-key.storage"
import { SettingsPage } from "@/features/settings/SettingsPage"
import { PdfPreview } from "../features/pdf/PdfPreview"

export function App() {
  const [view, setView] = useState<"translator" | "settings">("translator")
  const [translationRunning, setTranslationRunning] = useState(false)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const { lang, toggleLanguage, t } = useI18n()
  const { isDark, toggleTheme } = useTheme()

  useEffect(() => {
    let active = true
    const checkApiKey = async () => {
      try {
        const key = await getApiKey()
        if (active) setHasApiKey(Boolean(key && key.trim().length > 0))
      } catch {
        if (active) setHasApiKey(false)
      }
    }
    void checkApiKey()

    const handleNavigate = () => setView("settings")
    window.addEventListener("pdf2imgvi-navigate-settings", handleNavigate)
    return () => {
      active = false
      window.removeEventListener("pdf2imgvi-navigate-settings", handleNavigate)
    }
  }, [view])

  return (
    <div className="min-h-screen bg-background text-foreground antialiased transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-sm shadow-blue-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tracking-tight">pdf2imgvi</span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    v1.0
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-none">{t("appSubtitle")}</p>
              </div>
            </div>

            {hasApiKey !== null && (
              <div className="ml-2 hidden sm:block">
                {hasApiKey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("apiReady")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setView("settings")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-400 cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("noApiKey")}
                  </button>
                )}
              </div>
            )}
          </div>

          <nav
            className="flex items-center rounded-lg border border-border bg-muted/60 p-0.5"
            aria-label="Workspace navigation"
          >
            <button
              type="button"
              aria-current={view === "translator" ? "page" : undefined}
              onClick={() => setView("translator")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === "translator"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              {t("studio")}
            </button>
            <button
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => setView("settings")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === "settings"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("settings")}
            </button>
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="h-8 gap-1.5 px-2.5 text-xs font-medium"
              title={t("language")}
              aria-label={t("language")}
            >
              <Languages className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold uppercase">{lang}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={isDark ? t("lightMode") : t("darkMode")}
              aria-label={isDark ? t("lightMode") : t("darkMode")}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div hidden={view !== "translator"}>
          <PdfPreview
            onTranslationRunningChange={setTranslationRunning}
            onNavigateSettings={() => setView("settings")}
          />
        </div>
        {view === "settings" && <SettingsPage translationRunning={translationRunning} />}
      </main>
    </div>
  )
}
