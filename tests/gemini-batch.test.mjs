import assert from "node:assert/strict"
import test from "node:test"

async function clientModule() {
  return import("../src/services/gemini-batch.ts")
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fakeFetch(responses) {
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init })
    const response = responses.shift()
    if (!response) throw new Error("Unexpected fetch")
    return response
  }
  return { calls, fetcher }
}

test("uploads Blob through Gemini resumable Files API without a key in URLs", async () => {
  const { createGeminiBatchClient } = await clientModule()
  const uploadUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=abc"
  const { calls, fetcher } = fakeFetch([
    new Response(null, { status: 200, headers: { "X-Goog-Upload-URL": uploadUrl } }),
    json({ file: { name: "files/input", uri: "https://generativelanguage.googleapis.com/file/input" } }),
  ])
  const client = createGeminiBatchClient("secret", fetcher)
  const file = await client.uploadFile(new Blob(["image"], { type: "image/png" }), "page-1.png")

  assert.deepEqual(file, { name: "files/input", uri: "https://generativelanguage.googleapis.com/file/input" })
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/upload/v1beta/files")
  assert.equal(calls[0].init.headers["x-goog-api-key"], "secret")
  assert.equal(calls[0].init.headers["X-Goog-Upload-Command"], "start")
  assert.equal(calls[1].url, uploadUrl)
  assert.equal(calls[1].init.headers["X-Goog-Upload-Command"], "upload, finalize")
  assert.equal(calls[1].init.body instanceof Blob, true)
  assert.equal(calls.every((call) => !call.url.includes("secret")), true)
})

test("submits, checks, downloads, and cancels a Gemini batch", async () => {
  const { createGeminiBatchClient } = await clientModule()
  const { calls, fetcher } = fakeFetch([
    json({ name: "batches/abc" }),
    json({ name: "batches/abc", metadata: { state: "JOB_STATE_SUCCEEDED" }, response: { responsesFile: "files/output" } }),
    new Response('{"key":"job:page:1"}\n'),
    json({}),
  ])
  const client = createGeminiBatchClient("secret", fetcher)
  assert.equal(await client.submitBatch("gemini-3.1-flash-image", "files/input"), "batches/abc")
  assert.deepEqual(await client.getBatch("batches/abc"), {
    name: "batches/abc", state: "JOB_STATE_SUCCEEDED", responseFile: "files/output",
  })
  assert.equal(await client.downloadResults("files/output"), '{"key":"job:page:1"}\n')
  await client.cancelBatch("batches/abc")

  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:batchGenerateContent")
  assert.deepEqual(JSON.parse(calls[0].init.body).batch.input_config, { file_name: "files/input" })
  assert.equal(calls[1].url, "https://generativelanguage.googleapis.com/v1beta/batches/abc")
  assert.equal(calls[2].url, "https://generativelanguage.googleapis.com/download/v1beta/files/output:download?alt=media")
  assert.equal(calls[3].url, "https://generativelanguage.googleapis.com/v1beta/batches/abc:cancel")
  assert.equal(calls[3].init.method, "POST")
})

test("rejects upload errors and unexpected upload destinations safely", async () => {
  const { createGeminiBatchClient } = await clientModule()
  const blob = new Blob(["x"], { type: "image/png" })
  for (const response of [
    json({ error: { message: "secret private detail" } }, 403),
    new Response(null, { status: 200 }),
    new Response(null, { status: 200, headers: { "X-Goog-Upload-URL": "https://evil.example/upload" } }),
  ]) {
    const { fetcher } = fakeFetch([response])
    await assert.rejects(
      createGeminiBatchClient("secret", fetcher).uploadFile(blob, "page.png"),
      (error) => !error.message.includes("secret"),
    )
  }
  const { fetcher } = fakeFetch([
    new Response(null, { status: 200, headers: { "X-Goog-Upload-URL": "https://generativelanguage.googleapis.com/upload/v1beta/files?id=x" } }),
    json({ file: { uri: "https://generativelanguage.googleapis.com/file/x" } }),
  ])
  await assert.rejects(createGeminiBatchClient("secret", fetcher).uploadFile(blob, "page.png"), /file/i)
})

test("rejects malformed resource names and unexpected batch bodies", async () => {
  const { createGeminiBatchClient } = await clientModule()
  const { calls, fetcher } = fakeFetch([json({ wrong: "shape" })])
  const client = createGeminiBatchClient("secret", fetcher)

  await assert.rejects(client.submitBatch("bad/model", "files/input"), /model/i)
  await assert.rejects(client.submitBatch("gemini-3.1-flash-image", "../../wrong"), /file/i)
  await assert.rejects(client.getBatch("batches/../../secret"), /batch/i)
  await assert.rejects(client.downloadResults("https://evil.example"), /file/i)
  await assert.rejects(client.submitBatch("gemini-3.1-flash-image", "files/input"), /batch/i)
  assert.equal(calls.length, 1)
})
