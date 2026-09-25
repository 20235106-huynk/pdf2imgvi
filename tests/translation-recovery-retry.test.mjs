import test from "node:test"
import assert from "node:assert/strict"

import { retryFailedPages } from "../src/features/translation/translation-retry.ts"

test("retry starts every upload in the configured batch while the first is pending", async () => {
  const controller = new AbortController()
  let releaseFirst
  const held = new Promise((resolve) => { releaseFirst = resolve })
  let fourthStarted
  const started = new Promise((resolve) => { fourthStarted = resolve })
  const pages = [1, 2, 3, 4].map((pageNumber) => ({ jobId: "j-concurrent", pageNumber, status: "failed" }))
  const retry = retryFailedPages({
    jobId: "j-concurrent", pdf: { numPages: 4 }, fileName: "paper.pdf", apiKey: "key",
    settings: { quality: "standard", geminiModel: "gemini-3.1-flash-image", sourceLanguage: "en", targetLanguage: "vi", batchSize: 4, pollingIntervalMs: 10 },
    signal: controller.signal,
    deps: {
      getJob: async () => ({ id: "j-concurrent", fileName: "paper.pdf", totalPages: 4 }),
      getPagesByJob: async () => pages,
      getBatchesByJob: async () => [],
      updatePageRecord: async (_jobId, pageNumber, patch) => Object.assign(pages[pageNumber - 1], patch),
      updateJobRecord: async () => {},
      renderPage: async (_pdf, pageNumber) => ({ pageNumber, blob: new Blob([String(pageNumber)], { type: "image/png" }) }),
      client: { uploadFile: async (_blob, name) => {
        if (name === "page-1.png") await held
        if (name === "page-4.png") { fourthStarted(); controller.abort() }
        return { name: `files/${name}`, uri: `https://gemini/${name}` }
      } },
    },
  })
  try {
    await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error("Fourth retry upload did not start")), 100))])
  } finally {
    controller.abort()
    releaseFirst()
  }
  await retry
})

test("retryFailedPages throws if PDF fileName does not match", async () => {
  const storedJob = {
    id: "j-mismatch",
    fileName: "original.pdf",
    totalPages: 5,
  }

  await assert.rejects(
    () =>
      retryFailedPages({
        jobId: "j-mismatch",
        pdf: { numPages: 5 },
        fileName: "wrong.pdf",
        apiKey: "key",
        settings: { quality: "standard", geminiModel: "model", sourceLanguage: "en", targetLanguage: "vi", batchSize: 5, pollingIntervalMs: 100 },
        deps: {
          getJob: async () => storedJob,
          getPagesByJob: async () => [],
        },
      }),
    /Original PDF does not match/,
  )
})

test("retryFailedPages throws if PDF page count does not match", async () => {
  const storedJob = {
    id: "j-pages-mismatch",
    fileName: "original.pdf",
    totalPages: 5,
  }

  await assert.rejects(
    () =>
      retryFailedPages({
        jobId: "j-pages-mismatch",
        pdf: { numPages: 10 },
        fileName: "original.pdf",
        apiKey: "key",
        settings: { quality: "standard", geminiModel: "model", sourceLanguage: "en", targetLanguage: "vi", batchSize: 5, pollingIntervalMs: 100 },
        deps: {
          getJob: async () => storedJob,
          getPagesByJob: async () => [],
        },
      }),
    /Original PDF does not match/,
  )
})

test("retryFailedPages throws if PDF fileSize does not match", async () => {
  const storedJob = {
    id: "j-size-mismatch",
    fileName: "original.pdf",
    totalPages: 5,
    fileSize: 1024,
  }

  await assert.rejects(
    () =>
      retryFailedPages({
        jobId: "j-size-mismatch",
        pdf: { numPages: 5 },
        fileName: "original.pdf",
        fileSize: 2048,
        apiKey: "key",
        settings: { quality: "standard", geminiModel: "model", sourceLanguage: "en", targetLanguage: "vi", batchSize: 5, pollingIntervalMs: 100 },
        deps: {
          getJob: async () => storedJob,
          getPagesByJob: async () => [],
        },
      }),
    /Original PDF does not match/,
  )
})

test("stopping retry before submission leaves pages eligible for another retry", async () => {
  const controller = new AbortController()
  const pages = [1, 2].map((pageNumber) => ({ jobId: "j-stop", pageNumber, status: "failed" }))
  await retryFailedPages({
    jobId: "j-stop",
    pdf: { numPages: 2 },
    fileName: "paper.pdf",
    apiKey: "key",
    settings: { quality: "standard", geminiModel: "gemini-3.1-flash-image", sourceLanguage: "en", targetLanguage: "vi", batchSize: 2, pollingIntervalMs: 10 },
    signal: controller.signal,
    deps: {
      getJob: async () => ({ id: "j-stop", fileName: "paper.pdf", totalPages: 2 }),
      getPagesByJob: async () => pages,
      updatePageRecord: async (_jobId, pageNumber, patch) => {
        Object.assign(pages.find((page) => page.pageNumber === pageNumber), patch)
        controller.abort()
      },
      client: {},
    },
  })
  assert.deepEqual(pages.map((page) => page.status), ["failed", "failed"])
})

test("retryFailedPages batches failed and marked pages under the same jobId", async () => {
  const storedJob = {
    id: "job-retry-1",
    fileName: "paper.pdf",
    totalPages: 3,
    geminiModel: "gemini-3.1-flash-image",
    status: "completed_with_errors",
    completedPages: 2,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }

  const pages = [
    { jobId: "job-retry-1", pageNumber: 1, status: "completed", retryRequested: true, createdAt: 0, updatedAt: 0 },
    { jobId: "job-retry-1", pageNumber: 2, status: "failed", error: "Gemini error", createdAt: 0, updatedAt: 0 },
    { jobId: "job-retry-1", pageNumber: 3, status: "completed", createdAt: 0, updatedAt: 0 },
  ]

  const renderedPages = []
  const createdBatches = []
  const updatedPages = []
  const savedImages = []

  const client = {
    uploadFile: async (blob, name) => ({ name: `files/${name}`, uri: `https://gemini/${name}` }),
    submitBatch: async () => "batches/retry-batch-1",
    getBatch: async () => ({
      name: "batches/retry-batch-1",
      state: "completed",
      rawState: "JOB_STATE_SUCCEEDED",
      responseFile: "files/retry-res",
    }),
    downloadResults: async () => [1, 2].map((pageNumber) => JSON.stringify({
      key: `job-retry-1:page:${pageNumber}`,
      response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa(`page${pageNumber}`) } }] } }] },
    })).join("\n"),
  }

  await retryFailedPages({
    jobId: "job-retry-1",
    pdf: { numPages: 3 },
    fileName: "paper.pdf",
    apiKey: "key",
    settings: {
      quality: "standard",
      geminiModel: "gemini-3.1-flash-image",
      sourceLanguage: "en",
      targetLanguage: "vi",
      batchSize: 5,
      pollingIntervalMs: 10,
    },
    deps: {
      getJob: async () => storedJob,
      getPagesByJob: async () => pages,
      getBatchesByJob: async () => createdBatches,
      createBatchRecord: async (b) => { createdBatches.push(b) },
      updateBatch: async (id, patch) => {
        const b = createdBatches.find((item) => item.id === id)
        if (b) Object.assign(b, patch)
      },
      updatePageRecord: async (jobId, pageNumber, patch) => {
        updatedPages.push({ jobId, pageNumber, patch })
        const p = pages.find((item) => item.pageNumber === pageNumber)
        if (p) Object.assign(p, patch)
      },
      updateJobRecord: async () => {},
      saveCompletedPage: async (jId, fName, pNum, img) => {
        savedImages.push({ jId, fName, pNum, img })
        const p = pages.find((item) => item.pageNumber === pNum)
        if (p) p.status = "completed"
      },
      renderPage: async (_pdf, pNum) => {
        renderedPages.push(pNum)
        return { pageNumber: pNum, blob: new Blob(["img"], { type: "image/png" }), width: 10, height: 10 }
      },
      client,
    },
  })

  assert.deepEqual(renderedPages, [1, 2])
  assert.equal(createdBatches.length, 1)
  assert.equal(createdBatches[0].jobId, "job-retry-1")
  assert.equal(createdBatches[0].batchName, "batches/retry-batch-1")
  assert.deepEqual(createdBatches[0].pageNumbers, [1, 2])
  assert.equal(createdBatches[0].status, "succeeded")
  assert.deepEqual(savedImages.map((item) => item.pNum), [1, 2])
})

test("retryFailedPages batches marked completed pages with failed pages", async () => {
  const controller = new AbortController()
  const pages = [
    { jobId: "job-marked", pageNumber: 1, status: "completed", retryRequested: true, translatedImage: new Blob(["old"]) },
    { jobId: "job-marked", pageNumber: 2, status: "failed" },
    { jobId: "job-marked", pageNumber: 3, status: "completed" },
  ]
  const rendered = []
  await retryFailedPages({
    jobId: "job-marked", pdf: { numPages: 3 }, fileName: "paper.pdf", apiKey: "key",
    settings: { quality: "standard", geminiModel: "gemini-3.1-flash-image", sourceLanguage: "en", targetLanguage: "vi", batchSize: 3, pollingIntervalMs: 10 },
    signal: controller.signal,
    deps: {
      getJob: async () => ({ id: "job-marked", fileName: "paper.pdf", totalPages: 3 }),
      getPagesByJob: async () => pages,
      getBatchesByJob: async () => [],
      updatePageRecord: async (_jobId, pageNumber, patch) => Object.assign(pages[pageNumber - 1], patch),
      updateJobRecord: async () => {},
      renderPage: async (_pdf, pageNumber) => {
        rendered.push(pageNumber)
        if (rendered.length === 2) controller.abort()
        return { pageNumber, blob: new Blob([String(pageNumber)], { type: "image/png" }) }
      },
      client: { uploadFile: async () => ({ name: "unused", uri: "unused" }) },
    },
  })
  assert.deepEqual(rendered, [1, 2])
  assert.equal(pages[0].translatedImage.size, 3)
  assert.equal(pages[2].status, "completed")
})

test("retry uses stored job's outputQuality and geminiModel instead of current settings", async () => {
  let renderedQuality = null
  let submittedModel = null
  const storedJob = {
    id: "job-retry-config",
    fileName: "doc.pdf",
    totalPages: 1,
    geminiModel: "gemini-3.1-flash-image",
    outputQuality: "very-high",
    status: "failed",
    completedPages: 0,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const pages = [{ jobId: "job-retry-config", pageNumber: 1, status: "failed", createdAt: 0, updatedAt: 0 }]
  const createdBatches = []

  const client = {
    uploadFile: async (_blob, name) => ({ name: `files/${name}`, uri: `https://gemini/${name}` }),
    submitBatch: async (model) => {
      submittedModel = model
      return "batches/retry-1"
    },
    getBatch: async () => ({
      name: "batches/retry-1",
      state: "completed",
      rawState: "JOB_STATE_SUCCEEDED",
      responseFile: "files/retry-res",
    }),
    downloadResults: async () =>
      JSON.stringify({
        key: "job-retry-config:page:1",
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("p1") } }] } }] },
      }),
  }

  await retryFailedPages({
    jobId: "job-retry-config",
    pdf: { numPages: 1 },
    fileName: "doc.pdf",
    apiKey: "key",
    settings: {
      quality: "standard",
      geminiModel: "gemini-2.5-flash-image",
      sourceLanguage: "en",
      targetLanguage: "vi",
      batchSize: 5,
      pollingIntervalMs: 10,
    },
    deps: {
      getJob: async () => storedJob,
      getPagesByJob: async () => pages,
      getBatchesByJob: async () => createdBatches,
      createBatchRecord: async (b) => { createdBatches.push(b) },
      updateBatch: async (id, patch) => {
        const b = createdBatches.find((item) => item.id === id)
        if (b) Object.assign(b, patch)
      },
      updatePageRecord: async () => {},
      updateJobRecord: async () => {},
      saveCompletedPage: async () => {},
      renderPage: async (_pdf, _pNum, quality) => {
        renderedQuality = quality
        return { pageNumber: 1, blob: new Blob(["img"], { type: "image/png" }), width: 10, height: 10 }
      },
      client,
    },
  })

  assert.equal(renderedQuality, "very-high")
  assert.equal(submittedModel, "gemini-3.1-flash-image")
})

test("retry uses stored job's sourceLanguage and targetLanguage instead of current settings", async () => {
  let uploadedBatchText = null
  const storedJob = {
    id: "job-lang-config",
    fileName: "doc.pdf",
    totalPages: 1,
    sourceLanguage: "ja",
    targetLanguage: "fr",
    geminiModel: "gemini-3.1-flash-image",
    outputQuality: "standard",
    status: "failed",
    completedPages: 0,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const pages = [{ jobId: "job-lang-config", pageNumber: 1, status: "failed", createdAt: 0, updatedAt: 0 }]
  const createdBatches = []

  const client = {
    uploadFile: async (blob, name) => {
      if (name.endsWith(".jsonl")) uploadedBatchText = await blob.text()
      return { name: `files/${name}`, uri: `https://gemini/${name}` }
    },
    submitBatch: async () => "batches/retry-lang",
    getBatch: async () => ({
      name: "batches/retry-lang",
      state: "completed",
      rawState: "JOB_STATE_SUCCEEDED",
      responseFile: "files/retry-res",
    }),
    downloadResults: async () =>
      JSON.stringify({
        key: "job-lang-config:page:1",
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("p1") } }] } }] },
      }),
  }

  await retryFailedPages({
    jobId: "job-lang-config",
    pdf: { numPages: 1 },
    fileName: "doc.pdf",
    apiKey: "key",
    settings: {
      quality: "standard",
      geminiModel: "gemini-3.1-flash-image",
      sourceLanguage: "en",
      targetLanguage: "vi",
      batchSize: 5,
      pollingIntervalMs: 10,
    },
    deps: {
      getJob: async () => storedJob,
      getPagesByJob: async () => pages,
      getBatchesByJob: async () => createdBatches,
      createBatchRecord: async (b) => { createdBatches.push(b) },
      updateBatch: async (id, patch) => {
        const b = createdBatches.find((item) => item.id === id)
        if (b) Object.assign(b, patch)
      },
      updatePageRecord: async () => {},
      updateJobRecord: async () => {},
      saveCompletedPage: async () => {},
      renderPage: async () => ({ pageNumber: 1, blob: new Blob(["img"], { type: "image/png" }), width: 10, height: 10 }),
      client,
    },
  })

  assert.match(uploadedBatchText, /Japanese|ja/i)
  assert.match(uploadedBatchText, /French|fr/i)
  assert.doesNotMatch(uploadedBatchText, /Vietnamese|\bvi\b/i)
})

test("retry cancels submitted remote batch if local batch registration fails", async () => {
  const cancelledBatches = []
  const storedJob = {
    id: "job-cancel-test",
    fileName: "doc.pdf",
    totalPages: 1,
    sourceLanguage: "en",
    targetLanguage: "vi",
    geminiModel: "gemini-3.1-flash-image",
    outputQuality: "standard",
    status: "failed",
    completedPages: 0,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const pages = [{ jobId: "job-cancel-test", pageNumber: 1, status: "failed", createdAt: 0, updatedAt: 0 }]

  const client = {
    uploadFile: async (_blob, name) => ({ name: `files/${name}`, uri: `https://gemini/${name}` }),
    submitBatch: async () => "batches/retry-remote-b1",
    cancelBatch: async (name) => { cancelledBatches.push(name) },
  }

  await assert.rejects(
    () =>
      retryFailedPages({
        jobId: "job-cancel-test",
        pdf: { numPages: 1 },
        fileName: "doc.pdf",
        apiKey: "key",
        settings: {
          quality: "standard",
          geminiModel: "gemini-3.1-flash-image",
          sourceLanguage: "en",
          targetLanguage: "vi",
          batchSize: 5,
          pollingIntervalMs: 10,
        },
        deps: {
          getJob: async () => storedJob,
          getPagesByJob: async () => pages,
          getBatchesByJob: async () => [],
          createBatchRecord: async () => { throw new Error("IDB storage failed") },
          updatePageRecord: async (_jId, pNum, patch) => {
            const p = pages.find((item) => item.pageNumber === pNum)
            if (p) Object.assign(p, patch)
          },
          renderPage: async () => ({ pageNumber: 1, blob: new Blob(["img"], { type: "image/png" }), width: 10, height: 10 }),
          client,
        },
      }),
    /Gemini batch was submitted but could not be saved locally/i,
  )

  assert.deepEqual(cancelledBatches, ["batches/retry-remote-b1"])
  assert.equal(pages[0].status, "failed")
})
