import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_SETTINGS } from "../src/types/settings.ts"

async function start(input, ports) {
  const { startTranslation } = await import("../src/services/translation-job.ts")
  return startTranslation(input, ports)
}

function input(pages, onChange, batchSize = 5) {
  return {
    pdf: { numPages: Math.max(...pages, 1) },
    fileName: "book.pdf",
    fileSize: 1024,
    pages,
    settings: { ...DEFAULT_SETTINGS, batchSize, pollingIntervalMs: 3000 },
    apiKey: "secret", tabId: 12, onChange,
  }
}

function fixturePorts(overrides = {}) {
  const events = []
  const saved = []
  const groups = []
  const snapshots = []
  const createdJobs = []
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
      getBatch: async (name) => ({ name, state: "completed", responseFile: `files/result${name.slice(-1)}` }),
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
    createJob: async (job, file, settings) => { createdJobs.push({ job, file, settings }) },
    saveJobSnapshot: async (job, changedPages) => { snapshots.push({ job, changedPages }) },
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    sleep: async () => {},
  }
  return { events, saved, groups, snapshots, createdJobs, ports: { ...ports, ...overrides, client: { ...ports.client, ...overrides.client } } }
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
  assert.ok(snapshots.some((job) => job.stage === "preparing"))
  assert.ok(snapshots.some((job) => job.stage === "submitted"))
  assert.ok(snapshots.some((job) => job.stage === "waiting"))
  assert.equal(snapshots.at(-1).stage, "finished")
  assert.equal(snapshots.at(-1).batches[0].state, "completed")
})

test("isolates keyed page failures and a failed batch while preserving completed images", async () => {
  const snapshots = []
  const { saved, ports } = fixturePorts({
    client: {
      getBatch: async (name) => name === "batches/b2"
        ? { name, state: "failed" }
        : { name, state: "completed", responseFile: "files/result1" },
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
      getBatch: async (name) => ({ name, state: "completed", responseFile: "files/output" }),
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
          return { name, state: "pending" }
        }
        return { name, state: "completed", responseFile: "files/output" }
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

test("a temporary status error keeps the remote batch registered and eventually collects its image", async () => {
  const snapshots = []
  const registrations = []
  const removals = []
  let calls = 0
  const { saved, ports } = fixturePorts({
    registerBatch: async (_tab, name) => registrations.push(name),
    unregisterBatch: async (_tab, name) => removals.push(name),
    client: {
      getBatch: async (name) => {
        calls += 1
        if (calls === 1) {
          assert.deepEqual(removals, [])
          throw new Error("offline")
        }
        return { name, state: "completed", responseFile: "files/output" }
      },
      downloadResults: async () => JSON.stringify({
        key: `${snapshots[0].id}:page:1`,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
      }),
    },
  })
  const run = await start(input([1], (job) => snapshots.push(job)), ports)
  await run.finished
  assert.equal(calls, 2)
  assert.deepEqual(registrations, ["batches/b1"])
  assert.deepEqual(removals, ["batches/b1"])
  assert.deepEqual(saved.map((row) => row.pageNumber), [1])
  assert.equal(snapshots.at(-1).status, "completed")
})

test("pending cancellation keeps polling and collects a later success even if cancel call fails", async () => {
  const snapshots = []
  const { saved, ports } = fixturePorts()
  let firstPoll
  let releaseSleep
  const polled = new Promise((resolve) => { firstPoll = resolve })
  const heldSleep = new Promise((resolve) => { releaseSleep = resolve })
  let calls = 0
  ports.client.getBatch = async (name) => {
    calls += 1
    if (calls === 1) { firstPoll(); return { name, state: "pending" } }
    if (calls === 2) return { name, state: "running" }
    return { name, state: "completed", responseFile: "files/output" }
  }
  ports.client.cancelBatch = async () => { throw new Error("temporary cancel error") }
  ports.client.downloadResults = async () => JSON.stringify({
    key: `${snapshots[0].id}:page:1`,
    response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
  })
  ports.sleep = async () => heldSleep
  const run = await start(input([1], (job) => snapshots.push(job)), ports)
  await polled
  await run.cancel()
  releaseSleep()
  await run.finished
  assert.ok(calls >= 3)
  assert.deepEqual(saved.map((row) => row.pageNumber), [1])
  assert.equal(snapshots.at(-1).status, "completed")
})

test("an unconfirmed cancellation can be explicitly requested again", async () => {
  const snapshots = []
  const { ports } = fixturePorts()
  let firstPoll
  let releaseSleep
  const polled = new Promise((resolve) => { firstPoll = resolve })
  const heldSleep = new Promise((resolve) => { releaseSleep = resolve })
  let statusCalls = 0
  let cancelCalls = 0
  ports.client.getBatch = async (name) => {
    statusCalls += 1
    if (statusCalls === 1) { firstPoll(); return { name, state: "pending" } }
    if (statusCalls === 2) return { name, state: "running" }
    return { name, state: "cancelled" }
  }
  ports.client.cancelBatch = async () => { cancelCalls += 1 }
  ports.sleep = async () => heldSleep
  const run = await start(input([1], (job) => snapshots.push(job)), ports)
  await polled
  await run.cancel()
  assert.equal(snapshots.at(-1).status, "running")
  await run.cancel()
  releaseSleep()
  await run.finished
  assert.equal(cancelCalls, 2)
  assert.equal(snapshots.at(-1).pages[0].status, "cancelled")
})

test("cancellation interrupts the polling delay but still collects a completed batch", async () => {
  const snapshots = []
  let delayBegun
  const delayStarted = new Promise((resolve) => { delayBegun = resolve })
  let polls = 0
  let abortedDelay = false
  const { saved, ports } = fixturePorts({
    client: {
      getBatch: async (name) => {
        polls += 1
        if (polls === 1) return { name, state: "pending" }
        return { name, state: "completed", responseFile: "files/output" }
      },
      downloadResults: async () => JSON.stringify({
        key: `${snapshots[0].id}:page:1`,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
      }),
    },
    sleep: (_ms, signal) => new Promise((_resolve, reject) => {
      assert.ok(signal, "polling delay needs a signal")
      delayBegun()
      signal.addEventListener("abort", () => {
        abortedDelay = true
        reject(new DOMException("Aborted", "AbortError"))
      }, { once: true })
    }),
  })
  const run = await start(input([1], (job) => snapshots.push(job)), ports)
  await delayStarted
  await run.cancel()
  await run.finished
  assert.equal(abortedDelay, true)
  assert.deepEqual(saved.map((row) => row.pageNumber), [1])
  assert.equal(snapshots.at(-1).status, "completed")
})

test("abortableDelay rejects immediately when aborted", async () => {
  const { abortableDelay } = await import("../src/services/translation-job.ts")
  const controller = new AbortController()
  const waiting = abortableDelay(60000, controller.signal)
  controller.abort()
  await assert.rejects(waiting, { name: "AbortError" })
})

test("a stale poll cannot reopen a batch completed during cancellation", async () => {
  const snapshots = []
  let pollStarted
  let releaseStalePoll
  const started = new Promise((resolve) => { pollStarted = resolve })
  const stalePoll = new Promise((resolve) => { releaseStalePoll = resolve })
  let polls = 0
  const { ports } = fixturePorts({
    client: {
      getBatch: async (name) => {
        polls += 1
        if (polls === 1) { pollStarted(); await stalePoll; return { name, state: "pending" } }
        return { name, state: "completed", responseFile: "files/output" }
      },
      downloadResults: async () => JSON.stringify({
        key: `${snapshots[0].id}:page:1`,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("one") } }] } }] },
      }),
    },
    sleep: async () => new Promise(() => {}),
  })
  const run = await start(input([1], (job) => snapshots.push(job)), ports)
  await started
  await run.cancel()
  releaseStalePoll()
  const outcome = await Promise.race([
    run.finished.then(() => "finished"),
    new Promise((resolve) => setTimeout(() => resolve("timed out"), 30)),
  ])
  assert.equal(outcome, "finished")
  assert.equal(polls, 2)
  assert.equal(snapshots.at(-1).batches[0].state, "completed")
  assert.equal(snapshots.at(-1).status, "completed")
})

test("persists batch record immediately after submission", async () => {
  const createdBatches = []
  const { ports } = fixturePorts({
    createBatchRecord: async (record) => { createdBatches.push(record) },
  })
  const run = await start(input([1], () => {}), ports)
  await run.finished
  assert.equal(createdBatches.length, 1)
  assert.equal(createdBatches[0].batchName, "batches/b1")
  assert.equal(createdBatches[0].status, "submitted")
  assert.deepEqual(createdBatches[0].pageNumbers, [1])
})

test("job records and uses outputQuality and geminiModel for rendering and batch submission", async () => {
  let renderedQuality = null
  let submittedModel = null
  let uploadedJsonl = null
  let createdJobRecord = null

  const { ports } = fixturePorts({
    renderPage: async (_pdf, pNum, quality) => {
      renderedQuality = quality
      return { pageNumber: pNum, blob: new Blob(["img"], { type: "image/png" }), width: 10, height: 10 }
    },
    createJob: async (job, _file, _settings) => {
      createdJobRecord = { ...job }
    },
    client: {
      uploadFile: async (blob, name) => {
        if (name.endsWith(".jsonl")) uploadedJsonl = await blob.text()
        return { name: `files/${name}`, uri: `https://files/${name}` }
      },
      submitBatch: async (model, _name) => {
        submittedModel = model
        return "batches/b1"
      },
      getBatch: async (name) => ({ name, state: "completed", responseFile: "files/res1" }),
      downloadResults: async () =>
        JSON.stringify({
          key: `${createdJobRecord.id}:page:1`,
          response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("res") } }] } }] },
        }),
    },
  })

  const customInput = input([1], () => {})
  customInput.settings = {
    ...customInput.settings,
    geminiModel: "gemini-3-pro-image",
    quality: "very-high",
  }

  const run = await start(customInput, ports)
  await run.finished

  assert.equal(createdJobRecord.outputQuality, "very-high")
  assert.equal(createdJobRecord.geminiModel, "gemini-3-pro-image")
  assert.equal(renderedQuality, "very-high")
  assert.equal(submittedModel, "gemini-3-pro-image")
  assert.match(uploadedJsonl, /"imageSize":"4K"/)
})

