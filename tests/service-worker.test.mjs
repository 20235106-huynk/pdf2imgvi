import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { transformWithOxc } from "vite"

async function loadWorker() {
  const source = await readFile(
    new URL("../src/background/service-worker.ts", import.meta.url),
    "utf8",
  )
  const { code: javascript } = await transformWithOxc(
    source,
    "service-worker.ts",
  )
  const opened = []
  let listener
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
    },
  }

  vm.runInNewContext(javascript.replace(/^import .*$/gm, ""), {
    chrome,
    console: { error: () => {} },
  })
  assert.equal(typeof listener, "function")
  return { listener, opened, chrome }
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
