import assert from "node:assert/strict"
import test from "node:test"

async function moduleUnderTest() {
  return import("../src/services/gemini-jsonl.ts")
}

test("splits page numbers into bounded sequential batches", async () => {
  const { splitIntoBatches } = await moduleUnderTest()
  assert.deepEqual(splitIntoBatches([1, 2, 3, 4, 5, 6], 5), [[1, 2, 3, 4, 5], [6]])
  assert.deepEqual(splitIntoBatches([], 5), [])
  assert.throws(() => splitIntoBatches([1], 0), /batch size/i)
})

test("builds Gemini image requests with stable page keys and file URIs", async () => {
  const { buildBatchJsonl } = await moduleUnderTest()
  const input = [
    { pageNumber: 5, fileUri: "https://files.example/5", mimeType: "image/png" },
    { pageNumber: 8, fileUri: "https://files.example/8", mimeType: "image/png" },
  ]
  const blob = buildBatchJsonl("job-7", input, "en", "vi")
  const rows = (await blob.text()).trim().split("\n").map(JSON.parse)

  assert.equal(blob.type, "application/jsonl")
  assert.deepEqual(rows.map((row) => row.key), ["job-7:page:5", "job-7:page:8"])
  assert.equal(rows[0].request.contents[0].parts[1].file_data.file_uri, "https://files.example/5")
  assert.equal(rows[0].request.contents[0].parts[1].file_data.mime_type, "image/png")
  assert.deepEqual(rows[0].request.generation_config.responseModalities, ["TEXT", "IMAGE"])
  assert.deepEqual(rows[0].request.generation_config.imageConfig, { aspectRatio: "9:16", imageSize: "1K" })
  assert.match(rows[0].request.contents[0].parts[0].text, /English/)
  assert.match(rows[0].request.contents[0].parts[0].text, /Vietnamese/)
})

test("buildBatchJsonl generates matching imageSize for standard, high, and very-high", async () => {
  const { buildBatchJsonl } = await moduleUnderTest()
  const input = [{ pageNumber: 1, fileUri: "https://files.example/1", mimeType: "image/png" }]

  const standard = JSON.parse((await (await buildBatchJsonl("j", input, "en", "vi", "standard")).text()).trim())
  assert.equal(standard.request.generation_config.imageConfig.imageSize, "1K")

  const high = JSON.parse((await (await buildBatchJsonl("j", input, "en", "vi", "high")).text()).trim())
  assert.equal(high.request.generation_config.imageConfig.imageSize, "2K")

  const veryHigh = JSON.parse((await (await buildBatchJsonl("j", input, "en", "vi", "very-high")).text()).trim())
  assert.equal(veryHigh.request.generation_config.imageConfig.imageSize, "4K")
})

test("maps reversed image results by key and isolates keyed failures", async () => {
  const { parseBatchResults } = await moduleUnderTest()
  const response = (key, content) => JSON.stringify({ key, ...content })
  const jsonl = [
    response("job-7:page:3", { response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("three") } }] } }] } }),
    response("job-7:page:2", { error: { message: "blocked" } }),
    response("job-7:page:1", { response: { candidates: [{ content: { parts: [{ text: "No image" }] } }] } }),
  ].join("\n")

  const results = await parseBatchResults(jsonl, "job-7", [1, 2, 3, 4])
  assert.deepEqual(results.map((result) => result.pageNumber), [1, 2, 3, 4])
  assert.ok(results[0].error)
  assert.ok(results[1].error)
  assert.equal(await results[2].image.text(), "three")
  assert.equal(results[2].image.type, "image/png")
  assert.ok(results[3].error)
})

test("duplicate, unknown, malformed keys and bad rows cannot misattribute images", async () => {
  const { parseBatchResults } = await moduleUnderTest()
  const image = { response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("ok") } }] } }] } }
  const duplicate = [
    JSON.stringify({ key: "job-7:page:1", ...image }),
    JSON.stringify({ key: "job-7:page:1", ...image }),
  ].join("\n")
  const result = await parseBatchResults(duplicate, "job-7", [1, 2])
  assert.ok(result[0].error)
  assert.equal(result[0].image, undefined)
  assert.ok(result[1].error)

  const mixed = [
    JSON.stringify({ key: "job-7:page:1", ...image }),
    "not JSON",
    JSON.stringify({ key: "job-7:page:99", ...image }),
    JSON.stringify({ key: "job-7:page:02", ...image }),
    JSON.stringify({ key: "job-7:page:2e0", ...image }),
    JSON.stringify({ key: "job-7:page:+2", ...image }),
    JSON.stringify({ key: "job-7:page: 2", ...image }),
  ].join("\n")
  const preserved = await parseBatchResults(mixed, "job-7", [1, 2])
  assert.equal(await preserved[0].image.text(), "ok")
  assert.equal(preserved[1].image, undefined)
  assert.match(preserved[1].error, /no result/i)
})
