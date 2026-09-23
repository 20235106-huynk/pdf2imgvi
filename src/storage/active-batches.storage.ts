const BATCH_NAME = /^batches\/[A-Za-z0-9_-]+$/

function key(tabId: number): string {
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("Invalid workspace tab ID")
  return `activeBatches:${tabId}`
}

async function read(tabId: number): Promise<string[]> {
  const stored = (await chrome.storage.session.get(key(tabId)))[key(tabId)]
  return Array.isArray(stored)
    ? stored.filter((name): name is string => typeof name === "string" && BATCH_NAME.test(name))
    : []
}

export async function registerBatch(tabId: number, batchName: string): Promise<void> {
  if (!BATCH_NAME.test(batchName)) throw new Error("Invalid Gemini batch name")
  const names = await read(tabId)
  if (!names.includes(batchName)) await chrome.storage.session.set({ [key(tabId)]: [...names, batchName] })
}

export async function unregisterBatch(tabId: number, batchName: string): Promise<void> {
  const names = (await read(tabId)).filter((name) => name !== batchName)
  if (names.length) await chrome.storage.session.set({ [key(tabId)]: names })
  else await chrome.storage.session.remove(key(tabId))
}

export async function takeTabBatches(tabId: number): Promise<string[]> {
  const names = await read(tabId)
  await chrome.storage.session.remove(key(tabId))
  return names
}
