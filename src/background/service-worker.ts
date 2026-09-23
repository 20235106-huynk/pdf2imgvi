import { createGeminiBatchClient } from "../services/gemini-batch.ts"
import { getApiKey } from "../storage/api-key.storage.ts"
import { takeTabBatches } from "../storage/active-batches.storage.ts"

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (typeof message !== "object" || message === null || !("type" in message)) return
  if (message.type === "OPEN_WORKSPACE") {
    void chrome.tabs
      .create({ url: chrome.runtime.getURL("workspace.html") })
      .catch(console.error)
  } else if (message.type === "REGISTER_WORKSPACE") {
    sendResponse({ tabId: sender.tab?.id ?? null })
  }
})

async function cancelTabBatches(tabId: number): Promise<void> {
  const names = await takeTabBatches(tabId)
  if (!names.length) return
  const apiKey = await getApiKey()
  if (!apiKey) {
    console.error("Could not cancel Gemini batches: API key unavailable")
    return
  }
  const client = createGeminiBatchClient(apiKey)
  const results = await Promise.allSettled(names.map((name) => client.cancelBatch(name)))
  if (results.some((result) => result.status === "rejected")) {
    console.error("Could not cancel all Gemini batches")
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void cancelTabBatches(tabId).catch(() => console.error("Could not cancel all Gemini batches"))
})
