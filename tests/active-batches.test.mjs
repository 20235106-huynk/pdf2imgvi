import assert from "node:assert/strict"
import test from "node:test"

function installSession() {
  const values = new Map()
  globalThis.chrome = {
    storage: {
      session: {
        async get(key) { return { [key]: values.get(key) } },
        async set(entries) { for (const [key, value] of Object.entries(entries)) values.set(key, value) },
        async remove(key) { values.delete(key) },
      },
    },
  }
  return values
}

test("active batch registry isolates tabs and removes only the closed tab's IDs", async () => {
  const values = installSession()
  const { registerBatch, unregisterBatch, takeTabBatches } = await import("../src/storage/active-batches.storage.ts")

  await registerBatch(9, "batches/a")
  await registerBatch(9, "batches/b")
  await registerBatch(9, "batches/a")
  await registerBatch(10, "batches/c")
  assert.deepEqual(await takeTabBatches(9), ["batches/a", "batches/b"])
  assert.deepEqual(await takeTabBatches(9), [])
  assert.deepEqual(values.get("activeBatches:10"), ["batches/c"])
  await unregisterBatch(10, "batches/c")
  assert.equal(values.has("activeBatches:10"), false)
})

test("registry never stores API keys and rejects malformed batch IDs", async () => {
  const values = installSession()
  const { registerBatch } = await import("../src/storage/active-batches.storage.ts")
  await assert.rejects(registerBatch(9, "../secret"), /batch/i)
  await registerBatch(9, "batches/valid")
  assert.equal(JSON.stringify([...values]), '[["activeBatches:9",["batches/valid"]]]')
})
