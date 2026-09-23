import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_SETTINGS,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  normalizeSettings,
} from "../src/types/settings.ts"

test("missing settings use the single default object", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.equal(DEFAULT_SETTINGS.sourceLanguage, "en")
  assert.equal(DEFAULT_SETTINGS.targetLanguage, "vi")
  assert.equal(DEFAULT_SETTINGS.quality, "standard")
  assert.equal(DEFAULT_SETTINGS.concurrency, 10)
  assert.equal(DEFAULT_SETTINGS.maxRetries, 3)
  assert.equal(DEFAULT_SETTINGS.outputFilenameTemplate, "{original}_vi.pdf")
  assert.equal("apiKey" in DEFAULT_SETTINGS, false)
})

test("known choices and valid values survive normalization", () => {
  const settings = normalizeSettings({
    modelId: "nano-banana-lite-2",
    sourceLanguage: "ja",
    targetLanguage: "vi",
    quality: "very-high",
    concurrency: 7,
    autoRetry: false,
    maxRetries: 0,
    outputFilenameTemplate: " chapter.pdf ",
    apiKeyStorageMode: "session",
  })

  assert.equal(settings.sourceLanguage, "ja")
  assert.equal(settings.quality, "very-high")
  assert.equal(settings.concurrency, 7)
  assert.equal(settings.autoRetry, false)
  assert.equal(settings.maxRetries, 0)
  assert.equal(settings.outputFilenameTemplate, "chapter.pdf")
  assert.equal(settings.apiKeyStorageMode, "session")
})

test("unknown choices and invalid numbers fall back safely", () => {
  const settings = normalizeSettings({
    modelId: "unknown-model",
    sourceLanguage: "xx",
    targetLanguage: "xx",
    quality: "ultra",
    concurrency: Number.NaN,
    maxRetries: -1,
    outputFilenameTemplate: "   ",
    apiKeyStorageMode: "cloud",
    apiKey: "must-not-leak",
  })

  assert.deepEqual(settings, DEFAULT_SETTINGS)
  assert.equal("apiKey" in settings, false)
  assert.equal(normalizeSettings({ concurrency: -5 }).concurrency, MIN_CONCURRENCY)
  assert.equal(normalizeSettings({ concurrency: 100 }).concurrency, MAX_CONCURRENCY)
  assert.equal(normalizeSettings({ maxRetries: 1.5 }).maxRetries, DEFAULT_SETTINGS.maxRetries)
})
