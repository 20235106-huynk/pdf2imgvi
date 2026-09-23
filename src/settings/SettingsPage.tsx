import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { getApiKey, saveApiKey } from "@/storage/api-key.storage"
import { getSettings, saveSettings } from "@/storage/settings.storage"
import { listCompletedPages, removeResults } from "@/storage/results.storage"
import {
  DEFAULT_SETTINGS,
  MAX_BATCH_SIZE,
  MAX_POLLING_INTERVAL_MS,
  MIN_BATCH_SIZE,
  MIN_POLLING_INTERVAL_MS,
  MODEL_OPTIONS,
  QUALITY_OPTIONS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  normalizeSettings,
  type AppSettings,
} from "@/types/settings"

const controlClass =
  "mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

export function SettingsPage() {
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    let active = true
    void Promise.all([getSettings(), getApiKey()])
      .then(([settings, key]) => {
        if (!active) return
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
      setFeedback("Settings saved")
    } catch {
      setFeedback("Could not save settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl px-4 py-8">Loading settings…</main>
  }

  if (loadFailed) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8" role="alert">
        Could not load settings. Reload the page to try again.
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Choose how your translations will run.</p>

      <form onSubmit={save} className="mt-8 space-y-8" aria-busy={saving}>
        <fieldset disabled={saving} className="min-w-0 space-y-8 border-0 p-0">
        <section className="space-y-5 border-b pb-8" aria-labelledby="engine-heading">
          <h2 id="engine-heading" className="text-lg font-semibold">Gemini</h2>
          <label className="block text-sm font-medium" htmlFor="model">
            Gemini Model
            <select
              id="model"
              className={controlClass}
              value={draft.geminiModel}
              onChange={(event) => update("geminiModel", event.target.value)}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div>
            <label className="text-sm font-medium" htmlFor="api-key">API Key</label>
            <div className="flex items-end gap-2">
              <input
                id="api-key"
                className={controlClass}
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => { setApiKey(event.target.value); setFeedback("") }}
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                aria-pressed={showApiKey}
                onClick={() => setShowApiKey((shown) => !shown)}
              >
                {showApiKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          <fieldset className="space-y-2 text-sm">
            <legend className="mb-2 font-medium">API Key Storage Mode</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="api-key-storage"
                checked={draft.apiKeyStorageMode === "local"}
                onChange={() => update("apiKeyStorageMode", "local")}
              />
              Save on this device
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="api-key-storage"
                checked={draft.apiKeyStorageMode === "session"}
                onChange={() => update("apiKeyStorageMode", "session")}
              />
              Session only
            </label>
          </fieldset>
        </section>

        <section className="space-y-5 border-b pb-8" aria-labelledby="translation-heading">
          <h2 id="translation-heading" className="text-lg font-semibold">Translation Settings</h2>
          <label className="block text-sm font-medium" htmlFor="source-language">
            Source Language
            <select
              id="source-language"
              className={controlClass}
              value={draft.sourceLanguage}
              onChange={(event) => update("sourceLanguage", event.target.value)}
            >
              {SOURCE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor="target-language">
            Target Language
            <select
              id="target-language"
              className={controlClass}
              value={draft.targetLanguage}
              onChange={(event) => update("targetLanguage", event.target.value)}
            >
              {TARGET_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </section>

        <fieldset className="space-y-2 border-b pb-8 text-sm">
          <legend className="mb-2 text-lg font-semibold">Output Quality</legend>
          {QUALITY_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="quality"
                checked={draft.quality === option.value}
                onChange={() => update("quality", option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <section className="space-y-4 border-b pb-8" aria-labelledby="batch-heading">
          <h2 id="batch-heading" className="text-lg font-semibold">Batch Settings</h2>
          <label className="block text-sm font-medium" htmlFor="batch-size">
            Pages per batch
            <input id="batch-size" className={controlClass} type="number"
              min={MIN_BATCH_SIZE} max={MAX_BATCH_SIZE} step={1} value={draft.batchSize}
              onChange={(event) => update("batchSize", Number(event.target.value))} />
          </label>
          <label className="block text-sm font-medium" htmlFor="polling-interval">
            Status check interval (seconds)
            <input id="polling-interval" className={controlClass} type="number"
              min={MIN_POLLING_INTERVAL_MS / 1000} max={MAX_POLLING_INTERVAL_MS / 1000}
              step={1} value={draft.pollingIntervalMs / 1000}
              onChange={(event) => update("pollingIntervalMs", Number(event.target.value) * 1000)} />
          </label>
        </section>

        <section className="border-b pb-8" aria-labelledby="output-heading">
          <h2 id="output-heading" className="text-lg font-semibold">Output Settings</h2>
          <label className="mt-4 block text-sm font-medium" htmlFor="filename-template">
            Output Filename
            <input
              id="filename-template"
              className={controlClass}
              value={draft.outputFilenameTemplate}
              required
              onChange={(event) => update("outputFilenameTemplate", event.target.value)}
            />
          </label>
        </section>

        <section className="space-y-3 border-b pb-8" aria-labelledby="storage-heading">
          <h2 id="storage-heading" className="text-lg font-semibold">Local Storage</h2>
          <p className="text-sm text-muted-foreground">
            Completed page images are stored locally on this device. Active jobs are not resumed after closing the workspace.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void (async () => {
              try {
                const rows = await listCompletedPages()
                await Promise.all([...new Set(rows.map((row) => row.jobId))].map(removeResults))
                window.dispatchEvent(new Event("pdf2imgvi-results-changed"))
                setFeedback("Translation cache cleared.")
              } catch {
                setFeedback("Could not clear translation cache.")
              }
            })()}
          >
            Clear Translation Cache
          </Button>
        </section>

        <section className="space-y-2 border-b pb-8 text-sm" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="text-lg font-semibold">Privacy</h2>
          <p>Your API key uses the storage mode selected above.</p>
          <p>The source PDF stays on your device; selected pages are rendered and uploaded directly to Gemini.</p>
          <p>Completed images are stored locally in IndexedDB. No files are uploaded to our servers.</p>
        </section>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setDraft(DEFAULT_SETTINGS)
              setFeedback("Defaults ready. Save Changes to apply.")
            }}
          >
            Reset to Defaults
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm">{feedback}</p>
      </form>
    </main>
  )
}
