import test from "node:test"
import assert from "node:assert/strict"
import { PDFDocument } from "pdf-lib"
import { exportTranslatedPdf, downloadPdfBlob } from "../src/services/pdf-export.service.ts"

const ONE_PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

const ONE_PIXEL_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9,
])

test("throws error if job is not found", async () => {
  await assert.rejects(
    () => exportTranslatedPdf({
      jobId: "missing-job",
      deps: {
        getJob: async () => undefined,
        getPagesByJob: async () => [],
        getPageImage: async () => undefined,
        getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
      },
    }),
    /Translation job not found/
  )
})

test("throws error if no completed pages exist", async () => {
  await assert.rejects(
    () => exportTranslatedPdf({
      jobId: "empty-job",
      deps: {
        getJob: async () => ({ id: "empty-job", fileName: "test.pdf" }),
        getPagesByJob: async () => [
          { pageNumber: 1, status: "failed", jobId: "empty-job", createdAt: 0, updatedAt: 0 },
        ],
        getPageImage: async () => undefined,
        getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
      },
    }),
    /No completed translated pages to export/
  )
})

test("throws error if page blob is missing", async () => {
  await assert.rejects(
    () => exportTranslatedPdf({
      jobId: "job-missing-blob",
      deps: {
        getJob: async () => ({ id: "job-missing-blob", fileName: "test.pdf" }),
        getPagesByJob: async () => [
          { pageNumber: 1, status: "completed", jobId: "job-missing-blob", createdAt: 0, updatedAt: 0 },
        ],
        getPageImage: async () => undefined,
        getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
      },
    }),
    /page 1 image is missing/
  )
})

test("sorts out-of-order pages and creates PDF with matching dimensions", async () => {
  const pagesMetadata = [
    { pageNumber: 7, status: "completed", width: 500, height: 700, jobId: "j1", createdAt: 0, updatedAt: 0 },
    { pageNumber: 2, status: "completed", width: 600, height: 800, jobId: "j1", createdAt: 0, updatedAt: 0 },
    { pageNumber: 5, status: "completed", width: 400, height: 600, jobId: "j1", createdAt: 0, updatedAt: 0 },
  ]

  const progressEvents = []

  const result = await exportTranslatedPdf({
    jobId: "j1",
    onProgress: (p) => progressEvents.push({ ...p }),
    deps: {
      getJob: async () => ({ id: "j1", fileName: "sample.pdf" }),
      getPagesByJob: async () => pagesMetadata,
      getPageImage: async (_j, pNum) => {
        // Return JPEG for page 5, PNG for others
        const bytes = pNum === 5 ? ONE_PIXEL_JPEG : ONE_PIXEL_PNG
        const mime = pNum === 5 ? "image/jpeg" : "image/png"
        return new Blob([bytes], { type: mime })
      },
      getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    },
  })

  assert.equal(result.filename, "sample_vi.pdf")
  assert.equal(result.pageCount, 3)

  const pdfBytes = new Uint8Array(await result.blob.arrayBuffer())
  const loadedPdf = await PDFDocument.load(pdfBytes)
  assert.equal(loadedPdf.getPageCount(), 3)

  const page1 = loadedPdf.getPage(0)
  assert.equal(page1.getWidth(), 600)
  assert.equal(page1.getHeight(), 800)

  const page2 = loadedPdf.getPage(1)
  assert.equal(page2.getWidth(), 400)
  assert.equal(page2.getHeight(), 600)

  const page3 = loadedPdf.getPage(2)
  assert.equal(page3.getWidth(), 500)
  assert.equal(page3.getHeight(), 700)

  // Verify progress callbacks
  assert.equal(progressEvents.length, 4)
  assert.equal(progressEvents[0].currentPage, 2)
  assert.equal(progressEvents[1].currentPage, 5)
  assert.equal(progressEvents[2].currentPage, 7)
  assert.equal(progressEvents[3].processedPages, 3)
})

test("downloadPdfBlob function is callable", async () => {
  assert.equal(typeof downloadPdfBlob, "function")
})
