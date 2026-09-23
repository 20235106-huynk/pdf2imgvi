export type ApiKeyStorageMode = "local" | "session"
export type OutputQuality = "standard" | "high" | "very-high"

export interface AppSettings {
  geminiModel: string
  sourceLanguage: string
  targetLanguage: string
  quality: OutputQuality
  batchSize: number
  pollingIntervalMs: number
  outputFilenameTemplate: string
  apiKeyStorageMode: ApiKeyStorageMode
}

export const MODEL_OPTIONS = [
  { value: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash" },
  { value: "gemini-3-pro-image", label: "Gemini 3 Pro" },
  { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash" },
] as const

export const SOURCE_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
] as const

export const TARGET_LANGUAGE_OPTIONS = [
  { value: "vi", label: "Vietnamese" },
] as const

export const QUALITY_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
  { value: "very-high", label: "Very High" },
] as const

export const MIN_BATCH_SIZE = 1
export const MAX_BATCH_SIZE = 20
export const MIN_POLLING_INTERVAL_MS = 3000
export const MAX_POLLING_INTERVAL_MS = 60000

export const DEFAULT_SETTINGS: AppSettings = {
  geminiModel: MODEL_OPTIONS[0].value,
  sourceLanguage: SOURCE_LANGUAGE_OPTIONS[0].value,
  targetLanguage: TARGET_LANGUAGE_OPTIONS[0].value,
  quality: QUALITY_OPTIONS[0].value,
  batchSize: 5,
  pollingIntervalMs: 3000,
  outputFilenameTemplate: "{original}_vi.pdf",
  apiKeyStorageMode: "local",
}

function isOption<T extends string>(
  value: unknown,
  options: readonly { value: T }[],
): value is T {
  return typeof value === "string" && options.some((option) => option.value === value)
}

export function normalizeSettings(value: unknown): AppSettings {
  const input: Record<string, unknown> =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

  const model = input.geminiModel ?? input.modelId
  return {
    geminiModel: isOption(model, MODEL_OPTIONS)
      ? model
      : DEFAULT_SETTINGS.geminiModel,
    sourceLanguage: isOption(input.sourceLanguage, SOURCE_LANGUAGE_OPTIONS)
      ? input.sourceLanguage
      : DEFAULT_SETTINGS.sourceLanguage,
    targetLanguage: isOption(input.targetLanguage, TARGET_LANGUAGE_OPTIONS)
      ? input.targetLanguage
      : DEFAULT_SETTINGS.targetLanguage,
    quality: isOption(input.quality, QUALITY_OPTIONS)
      ? input.quality
      : DEFAULT_SETTINGS.quality,
    batchSize:
      typeof input.batchSize === "number" && Number.isSafeInteger(input.batchSize)
        ? Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, input.batchSize))
        : DEFAULT_SETTINGS.batchSize,
    pollingIntervalMs:
      typeof input.pollingIntervalMs === "number" && Number.isSafeInteger(input.pollingIntervalMs)
        ? Math.max(MIN_POLLING_INTERVAL_MS, Math.min(MAX_POLLING_INTERVAL_MS, input.pollingIntervalMs))
        : DEFAULT_SETTINGS.pollingIntervalMs,
    outputFilenameTemplate:
      typeof input.outputFilenameTemplate === "string" && input.outputFilenameTemplate.trim()
        ? input.outputFilenameTemplate.trim()
        : DEFAULT_SETTINGS.outputFilenameTemplate,
    apiKeyStorageMode:
      input.apiKeyStorageMode === "session" ? "session" : DEFAULT_SETTINGS.apiKeyStorageMode,
  }
}
