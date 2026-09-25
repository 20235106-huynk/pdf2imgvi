import assert from "node:assert/strict"
import test from "node:test"

import { createGeminiBatchClient } from "../src/features/translation/gemini-batch.ts"

test("uses the Gemini SDK for upload, submit, status, and cancellation", async () => {
  const calls = []
  const sdk = {
    files: {
      upload: async (params) => {
        calls.push(["upload", params])
        return { name: "files/input", uri: "https://generativelanguage.googleapis.com/file/input" }
      },
    },
    batches: {
      create: async (params) => {
        calls.push(["create", params])
        return { name: "batches/job1" }
      },
      get: async (params) => {
        calls.push(["get", params])
        return { name: "batches/job1", state: "JOB_STATE_SUCCEEDED", dest: { fileName: "files/output" } }
      },
      cancel: async (params) => { calls.push(["cancel", params]) },
    },
  }
  const fetcher = async (url, init) => {
    calls.push(["download", String(url), init])
    return new Response('{"key":"job:page:1"}\n')
  }
  const client = createGeminiBatchClient("secret", sdk, fetcher)
  const blob = new Blob(["image"], { type: "image/png" })
  assert.deepEqual(await client.uploadFile(blob, "page-1.png"), {
    name: "files/input", uri: "https://generativelanguage.googleapis.com/file/input",
  })
  assert.equal(await client.submitBatch("gemini-3.1-flash-image", "files/input"), "batches/job1")
  assert.deepEqual(await client.getBatch("batches/job1"), {
    name: "batches/job1", state: "completed", responseFile: "files/output",
  })
  assert.equal(await client.downloadResults("files/output"), '{"key":"job:page:1"}\n')
  await client.cancelBatch("batches/job1")

  assert.deepEqual(calls.map(([action]) => action), ["upload", "create", "get", "download", "cancel"])
  assert.equal(calls[0][1].file, blob)
  assert.equal(calls[0][1].config.mimeType, "image/png")
  assert.deepEqual(calls[1][1], {
    model: "gemini-3.1-flash-image", src: "files/input", config: { displayName: "pdf2imgvi-translation" },
  })
  assert.deepEqual(calls[2][1], { name: "batches/job1" })
  assert.equal(calls[3][1], "https://generativelanguage.googleapis.com/download/v1beta/files/output:download?alt=media")
  assert.equal(calls[3][2].headers["x-goog-api-key"], "secret")
  assert.deepEqual(calls[4][1], { name: "batches/job1" })
})

test("normalizes every documented Gemini batch state and rejects unknown states", async () => {
  const sdk = { files: { upload: async () => ({}) }, batches: {
    create: async () => ({}), cancel: async () => {}, get: async () => ({}),
  } }
  const client = createGeminiBatchClient("secret", sdk)
  const cases = [
    ["JOB_STATE_QUEUED", "pending"],
    ["JOB_STATE_PENDING", "pending"],
    ["JOB_STATE_RUNNING", "running"],
    ["JOB_STATE_CANCELLING", "running"],
    ["JOB_STATE_SUCCEEDED", "completed"],
    ["JOB_STATE_FAILED", "failed"],
    ["JOB_STATE_CANCELLED", "cancelled"],
    ["JOB_STATE_EXPIRED", "failed"],
  ]
  for (const [raw, expected] of cases) {
    sdk.batches.get = async () => ({ name: "batches/job1", state: raw })
    assert.equal((await client.getBatch("batches/job1")).state, expected)
  }
  sdk.batches.get = async () => ({ name: "batches/job1", state: "UNEXPECTED" })
  await assert.rejects(client.getBatch("batches/job1"), /state/i)
})

test("validates SDK responses and result download without leaking the API key", async () => {
  const sdk = { files: { upload: async () => ({ name: "files/input" }) }, batches: {
    create: async () => ({ name: "batches/job1" }),
    get: async () => ({ name: "batches/job1", state: "JOB_STATE_SUCCEEDED" }),
    cancel: async () => {},
  } }
  const client = createGeminiBatchClient("secret", sdk, async () => new Response("private detail", { status: 403 }))
  await assert.rejects(client.uploadFile(new Blob(["x"], { type: "image/png" }), "page.png"), /file/i)
  await assert.rejects(client.submitBatch("bad/model", "files/input"), /model/i)
  await assert.rejects(client.downloadResults("../../secret"), /file/i)
  await assert.rejects(client.downloadResults("files/output"), (error) => !error.message.includes("private detail") && !error.message.includes("secret"))
})
