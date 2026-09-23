import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_SETTINGS } from "../src/types/settings.ts"

async function start(input, ports) {
  const { startTranslation } = await import("../src/services/translation-job.ts")
  return startTranslation(input, ports)
}

function input(pages, onChange, batchSize = 5) {
  return {
    pdf: {}, fileName: "book.pdf", pages,
    settings: { ...DEFAULT_SETTINGS, batchSize, pollingIntervalMs: 3000 },
    apiKey: "secret", tabId: 12, onChange,
  }
}

function fixturePorts(overrides = {}) {
  const events = []
  const saved = []
  const groups = []
  let uploadNumber = 0
  let batchNumber = 0
  const ports = {
    renderPage: async (_pdf, pageNumber) => {
      events.push(`render:${pageNumber}`)
      return { pageNumber, blob: new Blob([`page-${pageNumber}`], { type: "image/png" }), width: 1, height: 1 }
    },
    client: {
      uploadFile: async (blob) => {
        uploadNumber += 1
        if (blob.type === "application/jsonl") {
          groups.push((await blob.text()).trim().split("\n").map(JSON.parse))
          return { name: `files/jsonl${groups.length}`, uri: `https://generativelanguage.googleapis.com/file/jsonl${groups.length}` }
        }
        const page = Number((await blob.text()).slice(5))
        events.push(`upload:${page}`)
        return { name: `files/page${uploadNumber}`, uri: `https://generativelanguage.googleapis.com/file/page${page}` }
      },
      submitBatch: async () => `batches/b${++batchNumber}`,
      getBatch: async (name) => ({ name, state: "JOB_STATE_SUCCEEDED", responseFile: `files/result${name.slice(-1)}` }),
      downloadResults: async (fileName) => {
        const group = groups[Number(fileName.slice(-1)) - 1]
        return group.toReversed().map((row) => JSON.stringify({
          key: row.key,
          response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa(row.key) } }] } }] },
        })).join("\n")
      },
      cancelBatch: async () => {},
    },
    saveCompletedPage: async (jobId, fileName, pageNumber, image) => saved.push({ jobId, fileName, pageNumber, image }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    sleep: async () => {},
  }
  return { events, saved, groups, ports: { ...ports, ...overrides, client: { ...ports.client, ...overrides.client } } }
}

test("renders/uploads one page at a time, submits chunks, and maps reversed results", async () => {
  const snapshots = []
  const { events, saved, groups, ports } = fixturePorts()
  const run = await start(input([1, 2, 3, 4, 5, 6], (job) => snapshots.push(job)), ports)
  await run.finished

  assert.deepEqual(events, [
    "render:1", "upload:1", "render:2", "upload:2", "render:3", "upload:3",
    "render:4", "upload:4", "render:5", "upload:5", "render:6", "upload:6",
  ])
  assert.deepEqual(groups.map((group) => group.map((row) => Number(row.key.split(":").at(-1)))), [[1, 2, 3, 4, 5], [6]])
  assert.deepEqual(saved.map((row) => row.pageNumber), [1, 2, 3, 4, 5, 6])
  assert.equal(snapshots.at(-1).completedPages, 6)
  assert.equal(snapshots.at(-1).status, "completed")
})

test("isolates keyed page failures and a failed batch while preserving completed images", async () => {
  const snapshots = []
  const { saved, ports } = fixturePorts({
    client: {
      getBatch: async (name) => name === "batches/b2"
        ? { name, state: "JOB_STATE_FAILED" }
        : { name, state: "JOB_STATE_SUCCEEDED", responseFile: "files/result1" },
      downloadResults: async () => {
        const jobId = snapshots[0].id
        return [
          JSON.stringify({ key: `${jobId}:page:1`, response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] } }),
          JSON.stringify({ key: `${jobId}:page:2`, error: { message: "blocked" } }),
        ].join("\n")
      },
    },
  })
  const run = await start(input([1, 2, 3], (job) => snapshots.push(job), 2), ports)
  await run.finished

  assert.deepEqual(saved.map((row) => row.pageNumber), [1])
  assert.deepEqual(snapshots.at(-1).pages.map((page) => page.status), ["completed", "failed", "failed"])
  assert.equal(snapshots.at(-1).failedPages, 2)
})

test("cancel stops unsent pages during upload", async () => {
  const snapshots = []
  let releaseUpload
  let uploadStarted
  const started = new Promise((resolve) => { uploadStarted = resolve })
  const held = new Promise((resolve) => { releaseUpload = resolve })
  const { saved, ports } = fixturePorts({
    client: {
      uploadFile: async (blob) => {
        if (blob.type === "application/jsonl") return { name: "files/jsonl", uri: "https://generativelanguage.googleapis.com/file/jsonl" }
        uploadStarted()
        await held
        return { name: "files/page1", uri: "https://generativelanguage.googleapis.com/file/page1" }
      },
      submitBatch: async () => "batches/one",
      getBatch: async (name) => ({ name, state: "JOB_STATE_SUCCEEDED", responseFile: "files/output" }),
      downloadResults: async () => JSON.stringify({
        key: `${snapshots[0].id}:page:1`,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
      }),
    },
  })
  const run = await start(input([1, 2], (job) => snapshots.push(job)), ports)
  await started
  const cancellation = run.cancel()
  releaseUpload()
  await cancellation
  await run.finished
  assert.deepEqual(saved.map((row) => row.pageNumber), [])
  assert.deepEqual(snapshots.at(-1).pages.map((page) => page.status), ["cancelled", "cancelled"])
})

test("cancel preserves a batch result that completes before cancellation confirms", async () => {
  const raceSnapshots = []
  let polled
  let releaseSleep
  const pendingPoll = new Promise((resolve) => { polled = resolve })
  const heldSleep = new Promise((resolve) => { releaseSleep = resolve })
  let statusCalls = 0
  let cancelCalls = 0
  const race = fixturePorts({
    client: {
      getBatch: async (name) => {
        statusCalls += 1
        if (statusCalls === 1) {
          polled()
          return { name, state: "JOB_STATE_PENDING" }
        }
        return { name, state: "JOB_STATE_SUCCEEDED", responseFile: "files/output" }
      },
      cancelBatch: async () => { cancelCalls += 1 },
      downloadResults: async () => JSON.stringify({
        key: `${raceSnapshots[0].id}:page:1`,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
      }),
    },
    sleep: async () => heldSleep,
  })
  const raceRun = await start(input([1], (job) => raceSnapshots.push(job)), race.ports)
  await pendingPoll
  await raceRun.cancel()
  releaseSleep()
  await raceRun.finished
  assert.equal(cancelCalls, 1)
  assert.equal(raceSnapshots.at(-1).pages[0].status, "completed")
  assert.deepEqual(race.saved.map((row) => row.pageNumber), [1])
})
