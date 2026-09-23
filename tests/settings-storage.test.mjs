import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_SETTINGS } from "../src/types/settings.ts"
import {
  getSettings,
  resetSettings,
  saveSettings,
} from "../src/storage/settings.storage.ts"
import {
  getApiKey,
  removeApiKey,
  saveApiKey,
} from "../src/storage/api-key.storage.ts"

function storageArea() {
  const values = new Map()
  return {
    values,
    failNextSet: false,
    async get(key) {
      return { [key]: values.get(key) }
    },
    async set(entries) {
      if (this.failNextSet) {
        this.failNextSet = false
        throw new Error("storage unavailable")
      }
      for (const [key, value] of Object.entries(entries)) values.set(key, value)
    },
    async remove(key) {
      values.delete(key)
    },
  }
}

function installStorage() {
  const local = storageArea()
  const session = storageArea()
  globalThis.chrome = { storage: { local, session } }
  return { local, session }
}

test("settings load defaults, normalize before saving, and reset", async () => {
  const { local, session } = installStorage()

  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
  await saveSettings({
    ...DEFAULT_SETTINGS,
    concurrency: 99,
    sourceLanguage: "ja",
    apiKey: "must-not-persist",
  })
  assert.equal((await getSettings()).concurrency, 30)
  assert.equal((await getSettings()).sourceLanguage, "ja")
  assert.equal("apiKey" in local.values.get("appSettings"), false)
  assert.equal(session.values.size, 0)

  await resetSettings()
  assert.equal(local.values.has("appSettings"), false)
  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
})

test("corrupt saved settings are normalized on load", async () => {
  const { local } = installStorage()
  local.values.set("appSettings", { quality: "unknown", maxRetries: -9 })

  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
})

test("API key is trimmed and migrates between local and session", async () => {
  const { local, session } = installStorage()

  assert.equal(await getApiKey(), null)
  await saveApiKey("  first-key  ", "local")
  assert.equal(local.values.get("apiKey"), "first-key")
  assert.equal(session.values.has("apiKey"), false)

  await saveApiKey(" first-key ", "session")
  assert.equal(session.values.get("apiKey"), "first-key")
  assert.equal(local.values.has("apiKey"), false)
  assert.equal(await getApiKey(), "first-key")

  await saveApiKey("second-key", "local")
  assert.equal(local.values.get("apiKey"), "second-key")
  assert.equal(session.values.has("apiKey"), false)

  await saveApiKey("   ", "local")
  assert.equal(await getApiKey(), null)
  assert.equal(local.values.has("apiKey"), false)
  assert.equal(session.values.has("apiKey"), false)
})

test("failed migration write preserves the old API key", async () => {
  const { local, session } = installStorage()
  await saveApiKey("keep-me", "local")
  session.failNextSet = true

  await assert.rejects(saveApiKey("new-key", "session"), /storage unavailable/)
  assert.equal(local.values.get("apiKey"), "keep-me")
  assert.equal(session.values.has("apiKey"), false)

  await removeApiKey()
  assert.equal(local.values.has("apiKey"), false)
  assert.equal(session.values.has("apiKey"), false)
})
