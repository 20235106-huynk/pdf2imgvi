import test from "node:test"
import assert from "node:assert/strict"

import { retryFailedPages } from "../src/services/translation-recovery.service.ts"

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

test("retryFailedPages only re-renders failed pages and creates batch under same jobId", async () => {
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
    { jobId: "job-retry-1", pageNumber: 1, status: "completed", createdAt: 0, updatedAt: 0 },
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
    downloadResults: async () =>
      JSON.stringify({
        key: "job-retry-1:page:2",
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("page2") } }] } }] },
      }),
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

  // Only page 2 was failed, so only page 2 should be rendered
  assert.deepEqual(renderedPages, [2])
  assert.equal(createdBatches.length, 1)
  assert.equal(createdBatches[0].jobId, "job-retry-1")
  assert.equal(createdBatches[0].batchName, "batches/retry-batch-1")
  assert.deepEqual(createdBatches[0].pageNumbers, [2])
  assert.equal(createdBatches[0].status, "succeeded")
  assert.equal(savedImages.length, 1)
  assert.equal(savedImages[0].pNum, 2)
})
