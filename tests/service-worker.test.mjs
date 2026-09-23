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
    },
  }

  vm.runInNewContext(javascript, {
    chrome,
    console: { error: (error) => errors.push(error) },
  })
  assert.equal(typeof listener, "function")
  return { listener, opened, errors, chrome }
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
