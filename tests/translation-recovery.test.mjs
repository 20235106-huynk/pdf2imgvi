import test from "node:test"
import assert from "node:assert/strict"

import {
  mapGeminiBatchState,
  reconcileBatch,
  recalculateJobProgress,
  resumeJob,
} from "../src/services/translation-recovery.service.ts"

test("mapGeminiBatchState maps every Gemini state to LocalBatchStatus", () => {
  assert.equal(mapGeminiBatchState("JOB_STATE_QUEUED"), "pending")
  assert.equal(mapGeminiBatchState("JOB_STATE_PENDING"), "pending")
  assert.equal(mapGeminiBatchState("JOB_STATE_RUNNING"), "running")
  assert.equal(mapGeminiBatchState("JOB_STATE_CANCELLING"), "running")
  assert.equal(mapGeminiBatchState("JOB_STATE_SUCCEEDED"), "succeeded")
  assert.equal(mapGeminiBatchState("JOB_STATE_FAILED"), "failed")
  assert.equal(mapGeminiBatchState("JOB_STATE_EXPIRED"), "expired")
  assert.equal(mapGeminiBatchState("JOB_STATE_CANCELLED"), "cancelled")
  assert.equal(mapGeminiBatchState(undefined), "pending")
})

test("reconcileBatch processes succeeded batch, downloads images, and marks succeeded", async () => {
  const savedImages = []
  const updatedBatches = []
  const updatedPages = []

  const batch = {
    id: "b1",
    jobId: "j1",
    batchName: "batches/batch1",
    model: "gemini-3.1-flash-image",
    pageNumbers: [1, 2],
    status: "submitted",
    createdAt: 1000,
    updatedAt: 1000,
  }

  const client = {
    getBatch: async () => ({
      name: "batches/batch1",
      state: "completed",
      rawState: "JOB_STATE_SUCCEEDED",
      responseFile: "files/res1",
    }),
    downloadResults: async () => [
      JSON.stringify({
        key: "j1:page:1",
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("img1") } }] } }] },
      }),
      JSON.stringify({
        key: "j1:page:2",
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("img2") } }] } }] },
      }),
    ].join("\n"),
  }

  const resultStatus = await reconcileBatch(batch, client, {
    fileName: "doc.pdf",
    deps: {
      getPagesByJob: async () => [
        { jobId: "j1", pageNumber: 1, status: "queued", createdAt: 0, updatedAt: 0 },
        { jobId: "j1", pageNumber: 2, status: "queued", createdAt: 0, updatedAt: 0 },
      ],
      saveCompletedPage: async (jId, fName, pNum, img) => {
        savedImages.push({ jId, fName, pNum, img })
      },
      updateBatch: async (bId, patch) => {
        updatedBatches.push({ bId, patch })
      },
      updatePage: async (key, patch) => {
        updatedPages.push({ key, patch })
      },
    },
  })

  assert.equal(resultStatus, "succeeded")
  assert.equal(savedImages.length, 2)
  assert.equal(savedImages[0].pNum, 1)
  assert.equal(savedImages[1].pNum, 2)
  assert.equal(updatedBatches.length, 1)
  assert.equal(updatedBatches[0].patch.status, "succeeded")
})

test("reconcileBatch marks unresolved pages as failed when batch expired", async () => {
  const updatedBatches = []
  const updatedPages = []

  const batch = {
    id: "b2",
    jobId: "j2",
    batchName: "batches/batch2",
    model: "gemini-3.1-flash-image",
    pageNumbers: [3],
    status: "running",
    createdAt: 1000,
    updatedAt: 1000,
  }

  const client = {
    getBatch: async () => ({
      name: "batches/batch2",
      state: "failed",
      rawState: "JOB_STATE_EXPIRED",
    }),
  }

  const resultStatus = await reconcileBatch(batch, client, {
    fileName: "doc.pdf",
    deps: {
      getPagesByJob: async () => [
        { jobId: "j2", pageNumber: 3, status: "processing", createdAt: 0, updatedAt: 0 },
      ],
      saveCompletedPage: async () => {},
      updateBatch: async (bId, patch) => {
        updatedBatches.push({ bId, patch })
      },
      updatePage: async (key, patch) => {
        updatedPages.push({ key, patch })
      },
    },
  })

  assert.equal(resultStatus, "expired")
  assert.equal(updatedBatches.length, 1)
  assert.equal(updatedBatches[0].patch.status, "expired")
  assert.equal(updatedPages.length, 1)
  assert.equal(updatedPages[0].patch.status, "failed")
})

test("recalculateJobProgress recalculates counts and status from actual page records", async () => {
  let updatedJob = null
  const pages = [
    { jobId: "j3", pageNumber: 1, status: "completed", createdAt: 0, updatedAt: 0 },
    { jobId: "j3", pageNumber: 2, status: "failed", error: "Gemini error", createdAt: 0, updatedAt: 0 },
    { jobId: "j3", pageNumber: 3, status: "completed", createdAt: 0, updatedAt: 0 },
  ]

  const storedJob = {
    id: "j3",
    fileName: "file.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "processing",
    completedPages: 0,
    failedPages: 0,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }

  const result = await recalculateJobProgress("j3", {
    getJob: async () => storedJob,
    getPagesByJob: async () => pages,
    getBatchesByJob: async () => [],
    updateJob: async (_id, patch) => {
      updatedJob = { ...storedJob, ...patch }
    },
  })

  assert.equal(result.completedPages, 2)
  assert.equal(result.failedPages, 1)
  assert.equal(result.status, "completed_with_errors")
  assert.equal(updatedJob.completedPages, 2)
  assert.equal(updatedJob.failedPages, 1)
  assert.equal(updatedJob.status, "completed_with_errors")
})
