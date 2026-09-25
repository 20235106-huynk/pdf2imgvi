import type { ApiKeyStorageMode } from "./settings.ts"

const API_KEY = "apiKey"

export async function getApiKey(): Promise<string | null> {
  const session = await chrome.storage.session.get(API_KEY)
  if (typeof session[API_KEY] === "string" && session[API_KEY]) {
    return session[API_KEY]
  }

  const local = await chrome.storage.local.get(API_KEY)
  return typeof local[API_KEY] === "string" && local[API_KEY] ? local[API_KEY] : null
}

export async function saveApiKey(apiKey: string, mode: ApiKeyStorageMode): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    await removeApiKey()
    return
  }

  const target = mode === "session" ? chrome.storage.session : chrome.storage.local
  const previous = mode === "session" ? chrome.storage.local : chrome.storage.session
  await target.set({ [API_KEY]: trimmed })
  await previous.remove(API_KEY)
}

export async function removeApiKey(): Promise<void> {
  await Promise.all([
    chrome.storage.local.remove(API_KEY),
    chrome.storage.session.remove(API_KEY),
  ])
}
