import { useEffect, useState, type FormEvent } from "react"
import {
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { getApiKey, saveApiKey } from "@/features/settings/api-key.storage"
import { getSettings, saveSettings } from "@/features/settings/settings.storage"
import { clearTranslationCache } from "@/features/translation/results.storage"
import { SettingsSections } from "./SettingsSections"
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
} from "@/features/settings/settings"

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

  async function clearCache() {
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
        <SettingsSections
          draft={draft}
          apiKey={apiKey}
          showApiKey={showApiKey}
          saving={saving}
          translationRunning={translationRunning}
          update={update}
          onModelChange={handleModelChange}
          onApiKeyChange={(value) => { setApiKey(value); setFeedback("") }}
          onToggleApiKey={() => setShowApiKey((shown) => !shown)}
          onClearCache={clearCache}
        />

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
