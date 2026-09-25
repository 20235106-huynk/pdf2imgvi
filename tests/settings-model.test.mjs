import assert from "node:assert/strict"
import test from "node:test"

import * as settings from "../src/features/settings/settings.ts"

const {
  DEFAULT_SETTINGS,
  MAX_BATCH_SIZE,
  MAX_POLLING_INTERVAL_MS,
  MIN_BATCH_SIZE,
  MIN_POLLING_INTERVAL_MS,
  normalizeSettings,
} = settings

test("missing settings use the single default object", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.equal(DEFAULT_SETTINGS.sourceLanguage, "en")
  assert.equal(DEFAULT_SETTINGS.targetLanguage, "vi")
  assert.equal(DEFAULT_SETTINGS.quality, "standard")
  assert.equal(DEFAULT_SETTINGS.batchSize, 5)
  assert.equal(DEFAULT_SETTINGS.pollingIntervalMs, 120000)
  assert.equal(DEFAULT_SETTINGS.outputFilenameTemplate, "{original}_vi.pdf")
  assert.equal("apiKey" in DEFAULT_SETTINGS, false)
})

test("known choices and valid values survive normalization", () => {
  const settings = normalizeSettings({
    geminiModel: "gemini-3.1-flash-image",
    sourceLanguage: "ja",
    targetLanguage: "vi",
    quality: "very-high",
    batchSize: 7,
    pollingIntervalMs: 60000,
    outputFilenameTemplate: " chapter.pdf ",
    apiKeyStorageMode: "session",
  })

  assert.equal(settings.sourceLanguage, "ja")
  assert.equal(settings.quality, "very-high")
  assert.equal(settings.geminiModel, "gemini-3.1-flash-image")
  assert.equal(settings.batchSize, 7)
  assert.equal(settings.pollingIntervalMs, 60000)
  assert.equal(settings.outputFilenameTemplate, "chapter.pdf")
  assert.equal(settings.apiKeyStorageMode, "session")
})

test("unknown choices and invalid numbers fall back safely", () => {
  const settings = normalizeSettings({
    geminiModel: "unknown-model",
    sourceLanguage: "xx",
    targetLanguage: "xx",
    quality: "ultra",
    batchSize: Number.NaN,
    pollingIntervalMs: Number.NaN,
    outputFilenameTemplate: "   ",
    apiKeyStorageMode: "cloud",
    apiKey: "must-not-leak",
  })

  assert.deepEqual(settings, DEFAULT_SETTINGS)
  assert.equal("apiKey" in settings, false)
  assert.equal(normalizeSettings({ batchSize: -5 }).batchSize, MIN_BATCH_SIZE)
  assert.equal(normalizeSettings({ batchSize: 100 }).batchSize, MAX_BATCH_SIZE)
  assert.equal(normalizeSettings({ pollingIntervalMs: 1 }).pollingIntervalMs, MIN_POLLING_INTERVAL_MS)
  assert.equal(normalizeSettings({ pollingIntervalMs: 200000 }).pollingIntervalMs, MAX_POLLING_INTERVAL_MS)
  assert.equal(normalizeSettings({ batchSize: 1.5 }).batchSize, DEFAULT_SETTINGS.batchSize)
  assert.equal(normalizeSettings({ pollingIntervalMs: 1.5 }).pollingIntervalMs, DEFAULT_SETTINGS.pollingIntervalMs)
})

test("legacy Gemini model selection survives settings migration", () => {
  assert.equal(
    normalizeSettings({ modelId: "gemini-3.1-flash-image" }).geminiModel,
    "gemini-3.1-flash-image",
  )
  assert.equal(normalizeSettings({ geminiModel: "unknown" }).geminiModel, DEFAULT_SETTINGS.geminiModel)
})

test("QUALITY_TO_IMAGE_SIZE maps standard to 1K, high to 2K, very-high to 4K", () => {
  assert.equal(settings.QUALITY_TO_IMAGE_SIZE.standard, "1K")
  assert.equal(settings.QUALITY_TO_IMAGE_SIZE.high, "2K")
  assert.equal(settings.QUALITY_TO_IMAGE_SIZE["very-high"], "4K")
})

test("normalizes quality based on geminiModel capability", () => {
  // Models supporting 1K only: fallback to standard
  assert.equal(
    normalizeSettings({ geminiModel: "gemini-3.1-flash-lite-image", quality: "very-high" }).quality,
    "standard",
  )
  assert.equal(
    normalizeSettings({ geminiModel: "gemini-2.5-flash-image", quality: "high" }).quality,
    "standard",
  )

  // Models supporting 1K / 2K / 4K: keep quality
  assert.equal(
    normalizeSettings({ geminiModel: "gemini-3.1-flash-image", quality: "very-high" }).quality,
    "very-high",
  )
  assert.equal(
    normalizeSettings({ geminiModel: "gemini-3.1-flash-image", quality: "high" }).quality,
    "high",
  )
  assert.equal(
    normalizeSettings({ geminiModel: "gemini-3-pro-image", quality: "very-high" }).quality,
    "very-high",
  )
})
