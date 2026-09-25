import { useEffect, useState, type FormEvent } from "react"
import {
  Key,
  Cpu,
  Zap,
  Database,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { getApiKey, saveApiKey } from "@/storage/api-key.storage"
import { getSettings, saveSettings } from "@/storage/settings.storage"
import { clearTranslationCache } from "@/storage/results.storage"
import {
  DEFAULT_SETTINGS,
  MAX_BATCH_SIZE,
  MAX_POLLING_INTERVAL_MS,
  MIN_BATCH_SIZE,
  MIN_POLLING_INTERVAL_MS,
  MODEL_OPTIONS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  normalizeSettings,
  type AppSettings,
} from "@/types/settings"

const inputClass =
  "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all disabled:opacity-50"

export function SettingsPage({ translationRunning }: { translationRunning: boolean }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | "info">("info")

  useEffect(() => {
    let active = true
    void Promise.all([getSettings(), getApiKey()])
      .then(([settings, key]) => {
        if (!active) return
        switch (settings.geminiModel) {
          case "gemini-3.1-flash-lite-image":
          case "gemini-2.5-flash-image":
            if (settings.quality !== "standard") {
              settings.quality = "standard"
            }
            break
          case "gemini-3.1-flash-image":
          case "gemini-3-pro-image":
            break
        }
        setDraft(settings)
        setApiKey(key ?? "")
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function handleModelChange(model: string) {
    setDraft((current) => {
      let quality = current.quality
      switch (model) {
        case "gemini-3.1-flash-image":
        case "gemini-3-pro-image":
          break
        case "gemini-3.1-flash-lite-image":
        case "gemini-2.5-flash-image":
        default:
          quality = "standard"
          break
      }
      return { ...current, geminiModel: model, quality }
    })
    setFeedback("")
  }

  function update<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setFeedback("")
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || loading || loadFailed) return

    setSaving(true)
    setFeedback("")
    const normalized = normalizeSettings(draft)
    try {
      await saveSettings(normalized)
      await saveApiKey(apiKey, normalized.apiKeyStorageMode)
      setDraft(normalized)
      setApiKey(apiKey.trim())
      setFeedback(t("saved"))
      setFeedbackType("success")
    } catch {
      setFeedback(t("saveError"))
      setFeedbackType("error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center py-20 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
        <span>Loading settings…</span>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center text-xs text-destructive" role="alert">
        Could not load settings. Reload the page to try again.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("settingsTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("settingsDesc")}</p>
      </div>

      <form onSubmit={save} className="space-y-6" aria-busy={saving}>
        <fieldset disabled={saving} className="min-w-0 space-y-6 border-0 p-0">
          {/* Card 1: API Key & Security */}
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4"
            aria-labelledby="api-heading"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-primary">
                  <Key className="h-4 w-4" />
                </div>
                <h2 id="api-heading" className="text-sm font-semibold">
                  {t("apiKeySection")}
                </h2>
              </div>
              {apiKey.trim().length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Key configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  Key missing
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold" htmlFor="api-key">
                  {t("apiKeyLabel")}
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <span>{t("apiKeyHelp")}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="relative mt-1.5 flex items-center">
                <input
                  id="api-key"
                  className={`${inputClass} pr-10`}
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  placeholder="AIzaSy..."
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setFeedback("")
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  aria-pressed={showApiKey}
                  onClick={() => setShowApiKey((shown) => !shown)}
                  className="absolute right-2.5 top-3.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title={showApiKey ? "Hide key" : "Show key"}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <fieldset className="space-y-2 text-xs pt-1">
              <legend className="mb-1.5 font-semibold text-xs text-foreground">
                {t("storageMode")}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                  draft.apiKeyStorageMode === "local" ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                }`}>
                  <input
                    type="radio"
                    name="api-key-storage"
                    checked={draft.apiKeyStorageMode === "local"}
                    onChange={() => update("apiKeyStorageMode", "local")}
                    className="accent-primary"
                  />
                  <div>
                    <p className="font-semibold text-xs">{t("localStorage")}</p>
                    <p className="text-[11px] text-muted-foreground">Persists across restarts</p>
                  </div>
                </label>

                <label className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                  draft.apiKeyStorageMode === "session" ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                }`}>
                  <input
                    type="radio"
                    name="api-key-storage"
                    checked={draft.apiKeyStorageMode === "session"}
                    onChange={() => update("apiKeyStorageMode", "session")}
                    className="accent-primary"
                  />
                  <div>
                    <p className="font-semibold text-xs">Session only</p>
                    <p className="text-[11px] text-muted-foreground">Cleared on browser exit</p>
                  </div>
                </label>
              </div>
            </fieldset>
          </section>

          {/* Card 2: AI Model & Quality */}
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4"
            aria-labelledby="ai-heading"
          >
            <div className="flex items-center gap-2 border-b border-border/80 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Cpu className="h-4 w-4" />
              </div>
              <h2 id="ai-heading" className="text-sm font-semibold">
                {t("aiModelSection")}
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold" htmlFor="model">
                {t("modelLabel")}
              </label>
              <select
                id="model"
                className={inputClass}
                value={draft.geminiModel}
                onChange={(event) => handleModelChange(event.target.value)}
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold" htmlFor="source-language">
                  {t("sourceLang")}
                </label>
                <select
                  id="source-language"
                  className={inputClass}
                  value={draft.sourceLanguage}
                  onChange={(event) => update("sourceLanguage", event.target.value)}
                >
                  {SOURCE_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold" htmlFor="target-language">
                  {t("targetLang")}
                </label>
                <select
                  id="target-language"
                  className={inputClass}
                  value={draft.targetLanguage}
                  onChange={(event) => update("targetLanguage", event.target.value)}
                >
                  {TARGET_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="space-y-2 text-xs pt-1">
              <legend className="mb-1.5 font-semibold text-xs text-foreground">
                {t("qualityLabel")}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${
                  draft.quality === "standard" ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                }`}>
                  <input
                    type="radio"
                    name="quality"
                    checked={draft.quality === "standard"}
                    onChange={() => update("quality", "standard")}
                    className="accent-primary"
                  />
                  <div>
                    <p className="font-semibold text-xs">Standard (1K)</p>
                    <p className="text-[10px] text-muted-foreground">Fastest</p>
                  </div>
                </label>

                <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${
                  draft.quality === "high" ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                } ${draft.geminiModel.includes("lite") ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <input
                    type="radio"
                    name="quality"
                    disabled={draft.geminiModel.includes("lite")}
                    checked={draft.quality === "high"}
                    onChange={() => update("quality", "high")}
                    className="accent-primary"
                  />
                  <div>
                    <p className="font-semibold text-xs">High (2K)</p>
                    <p className="text-[10px] text-muted-foreground">Crisp text</p>
                  </div>
                </label>

                <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${
                  draft.quality === "very-high" ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                } ${draft.geminiModel.includes("lite") ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <input
                    type="radio"
                    name="quality"
                    disabled={draft.geminiModel.includes("lite")}
                    checked={draft.quality === "very-high"}
                    onChange={() => update("quality", "very-high")}
                    className="accent-primary"
                  />
                  <div>
                    <p className="font-semibold text-xs">Ultra (4K)</p>
                    <p className="text-[10px] text-muted-foreground">Max details</p>
                  </div>
                </label>
              </div>
            </fieldset>
          </section>

          {/* Card 3: Batch Performance & Output */}
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4"
            aria-labelledby="perf-heading"
          >
            <div className="flex items-center gap-2 border-b border-border/80 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Zap className="h-4 w-4" />
              </div>
              <h2 id="perf-heading" className="text-sm font-semibold">
                {t("performanceSection")}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold" htmlFor="batch-size">
                  {t("batchSize")}
                </label>
                <input
                  id="batch-size"
                  className={inputClass}
                  type="number"
                  min={MIN_BATCH_SIZE}
                  max={MAX_BATCH_SIZE}
                  step={1}
                  value={draft.batchSize}
                  onChange={(event) => update("batchSize", Number(event.target.value))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("batchSizeHelp")}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold" htmlFor="polling-interval">
                  {t("pollingInterval")} (seconds)
                </label>
                <input
                  id="polling-interval"
                  className={inputClass}
                  type="number"
                  min={MIN_POLLING_INTERVAL_MS / 1000}
                  max={MAX_POLLING_INTERVAL_MS / 1000}
                  step={1}
                  value={draft.pollingIntervalMs / 1000}
                  onChange={(event) => update("pollingIntervalMs", Number(event.target.value) * 1000)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("pollingHelp")}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold" htmlFor="filename-template">
                Output Filename Pattern
              </label>
              <input
                id="filename-template"
                className={inputClass}
                value={draft.outputFilenameTemplate}
                required
                onChange={(event) => update("outputFilenameTemplate", event.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Default: &#123;original&#125;_vi.pdf
              </p>
            </div>
          </section>

          {/* Card 4: Local Storage & Privacy */}
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4"
            aria-labelledby="storage-heading"
          >
            <div className="flex items-center gap-2 border-b border-border/80 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Database className="h-4 w-4" />
              </div>
              <h2 id="storage-heading" className="text-sm font-semibold">
                {t("storageSection")}
              </h2>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("clearCacheHelp")}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={translationRunning}
                onClick={() => void (async () => {
                  if (!window.confirm(t("clearCacheConfirm"))) return
                  try {
                    await clearTranslationCache()
                    window.dispatchEvent(new Event("pdf2imgvi-results-changed"))
                    setFeedback(t("cacheCleared"))
                    setFeedbackType("info")
                  } catch {
                    setFeedback("Could not clear translation cache.")
                    setFeedbackType("error")
                  }
                })()}
                className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Translation Cache
              </Button>
            </div>
          </section>
        </fieldset>

        {/* Floating Actions & Feedback */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => {
              setDraft(DEFAULT_SETTINGS)
              setFeedback("Defaults ready. Save Changes to apply.")
              setFeedbackType("info")
            }}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </Button>

          <Button
            type="submit"
            size="default"
            disabled={saving}
            className="gap-2 shadow-xs cursor-pointer font-semibold"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </div>

        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
              feedbackType === "success"
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : feedbackType === "error"
                ? "border border-destructive/20 bg-destructive/10 text-destructive"
                : "border border-border bg-muted/40 text-foreground"
            }`}
          >
            {feedbackType === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {feedbackType === "error" && <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{feedback}</span>
          </div>
        )}
      </form>
    </div>
  )
}
