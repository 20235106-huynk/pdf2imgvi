import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { transformWithOxc } from "vite"

async function loadWorker({ apiKey = "secret", failCancel = false } = {}) {
  const source = await readFile(
    new URL("../src/background/service-worker.ts", import.meta.url),
    "utf8",
  )
  const { code: javascript } = await transformWithOxc(
    source,
    "service-worker.ts",
  )
  const opened = []
  const cancelled = []
  const batches = new Map([[9, ["batches/a", "batches/b"]], [10, ["batches/c"]]])
  let listener
  let removedListener
  const errors = []
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener: (value) => {
          listener = value
        },
      },
    },
    tabs: {
      create: async (options) => {
        opened.push(options)
        return {}
      },
      onRemoved: { addListener: (value) => { removedListener = value } },
    },
  }

  vm.runInNewContext(javascript.replace(/^import .*$/gm, ""), {
    chrome,
    console: { error: (error) => errors.push(error) },
    getApiKey: async () => apiKey,
    takeTabBatches: async (tabId) => {
      const names = batches.get(tabId) ?? []
      batches.delete(tabId)
      return names
    },
    createGeminiBatchClient: () => ({
      cancelBatch: async (name) => {
        if (failCancel) throw new Error("secret raw server error")
        cancelled.push(name)
      },
    }),
  })
  assert.equal(typeof listener, "function")
  return { listener, removedListener, opened, cancelled, batches, errors, chrome }
}

test("OPEN_WORKSPACE opens the extension workspace in a new tab", async () => {
  const { listener, opened } = await loadWorker()

  listener({ type: "OPEN_WORKSPACE" })
  await new Promise(setImmediate)

  assert.equal(opened.length, 1)
  assert.equal(opened[0].url, "chrome-extension://test/workspace.html")
})

test("unrelated messages do not open tabs", async () => {
  const { listener, opened } = await loadWorker()

  for (const message of [{ type: "OTHER_MESSAGE" }, null, "OPEN_WORKSPACE"]) {
    listener(message)
  }
  await new Promise(setImmediate)

  assert.deepEqual(opened, [])
})

test("REGISTER_WORKSPACE returns only the sender tab ID", async () => {
  const { listener } = await loadWorker()
  let response
  listener({ type: "REGISTER_WORKSPACE" }, { tab: { id: 9 } }, (value) => { response = value })
  assert.equal(response.tabId, 9)
  listener({ type: "REGISTER_WORKSPACE" }, {}, (value) => { response = value })
  assert.equal(response.tabId, null)
})

test("closing a workspace tab cancels only its registered batches", async () => {
  const { removedListener, cancelled, batches } = await loadWorker()
  assert.equal(typeof removedListener, "function")
  removedListener(9)
  await new Promise(setImmediate)
  assert.deepEqual(cancelled, ["batches/a", "batches/b"])
  assert.equal(batches.has(9), false)
  assert.deepEqual(batches.get(10), ["batches/c"])
})

test("missing key or cancellation failure never claims confirmed cancellation or logs secrets", async () => {
  const missing = await loadWorker({ apiKey: null })
  missing.removedListener(9)
  await new Promise(setImmediate)
  assert.deepEqual(missing.cancelled, [])
  assert.equal(missing.errors.every((error) => !String(error).includes("secret")), true)

  const failing = await loadWorker({ failCancel: true })
  failing.removedListener(9)
  await new Promise(setImmediate)
  assert.deepEqual(failing.cancelled, [])
  assert.equal(failing.errors.length > 0, true)
  assert.equal(failing.errors.every((error) => !String(error).includes("secret")), true)
})
