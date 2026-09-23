export type ApiKeyStorageMode = "local" | "session"
export type OutputQuality = "standard" | "high" | "very-high"

export interface AppSettings {
  providerId: string
  modelId: string
  sourceLanguage: string
  targetLanguage: string
  quality: OutputQuality
  concurrency: number
  autoRetry: boolean
  maxRetries: number
  outputFilenameTemplate: string
  apiKeyStorageMode: ApiKeyStorageMode
}

export const MODEL_OPTIONS = [
  { value: "nano-banana-lite-2", label: "Nano Banana Lite 2" },
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

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 20
export const DEFAULT_CONCURRENCY = 10

export const DEFAULT_SETTINGS: AppSettings = {
  providerId: "gemini",
  modelId: MODEL_OPTIONS[0].value,
  sourceLanguage: SOURCE_LANGUAGE_OPTIONS[0].value,
  targetLanguage: TARGET_LANGUAGE_OPTIONS[0].value,
  quality: QUALITY_OPTIONS[0].value,
  concurrency: DEFAULT_CONCURRENCY,
  autoRetry: true,
  maxRetries: 3,
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

  return {
    providerId:
      typeof input.providerId === "string" && input.providerId.trim()
        ? input.providerId.trim()
        : DEFAULT_SETTINGS.providerId,
    modelId: isOption(input.modelId, MODEL_OPTIONS)
      ? input.modelId
      : DEFAULT_SETTINGS.modelId,
    sourceLanguage: isOption(input.sourceLanguage, SOURCE_LANGUAGE_OPTIONS)
      ? input.sourceLanguage
      : DEFAULT_SETTINGS.sourceLanguage,
    targetLanguage: isOption(input.targetLanguage, TARGET_LANGUAGE_OPTIONS)
      ? input.targetLanguage
      : DEFAULT_SETTINGS.targetLanguage,
    quality: isOption(input.quality, QUALITY_OPTIONS)
      ? input.quality
      : DEFAULT_SETTINGS.quality,
    concurrency:
      typeof input.concurrency === "number" && Number.isFinite(input.concurrency)
        ? Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.trunc(input.concurrency)))
        : DEFAULT_SETTINGS.concurrency,
    autoRetry:
      typeof input.autoRetry === "boolean" ? input.autoRetry : DEFAULT_SETTINGS.autoRetry,
    maxRetries:
      typeof input.maxRetries === "number" &&
      Number.isSafeInteger(input.maxRetries) &&
      input.maxRetries >= 0
        ? input.maxRetries
        : DEFAULT_SETTINGS.maxRetries,
    outputFilenameTemplate:
      typeof input.outputFilenameTemplate === "string" && input.outputFilenameTemplate.trim()
        ? input.outputFilenameTemplate.trim()
        : DEFAULT_SETTINGS.outputFilenameTemplate,
    apiKeyStorageMode:
      input.apiKeyStorageMode === "session" ? "session" : DEFAULT_SETTINGS.apiKeyStorageMode,
  }
}
