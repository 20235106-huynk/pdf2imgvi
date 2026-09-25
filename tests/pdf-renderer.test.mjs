import assert from "node:assert/strict"
import test from "node:test"

import { renderPdfPage } from "../src/features/pdf/pdf-renderer.ts"

test("PDF loading reports errors without noisy recoverable font warnings", async () => {
  const module = await import("../src/features/pdf/pdf-renderer.ts")
  assert.equal(typeof module.pdfDocumentOptions, "function")
  assert.deepEqual(
    module.pdfDocumentOptions("blob:document", "chrome-extension://extension/workspace.html"),
    {
      url: "blob:document",
      wasmUrl: "chrome-extension://extension/wasm/",
      verbosity: 0,
    },
  )
})

function fakePdf(pageWidth = 100, pageHeight = 200) {
  const calls = []
  const page = {
    getViewport: ({ scale }) => ({ width: pageWidth * scale, height: pageHeight * scale }),
    render: ({ canvas, viewport, transform, background }) => {
      calls.push({ canvas, viewport, transform, background })
      return { promise: Promise.resolve() }
    },
  }
  return {
    calls,
    pdf: {
      numPages: 3,
      getPage: async (number) => {
        calls.push({ pageNumber: number })
        return page
      },
    },
  }
}

test("renders the requested page at 240 DPI on a centered 9:16 canvas", async () => {
  const originalDocument = globalThis.document
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toBlob: (callback) => callback(new Blob(["image"], { type: "image/png" })),
  }
  globalThis.document = { createElement: () => canvas }
  try {
    const { pdf, calls } = fakePdf()
    const result = await renderPdfPage(pdf, 2, "high")
    assert.equal(result.pageNumber, 2)
    assert.ok(result.blob instanceof Blob)
    assert.equal(result.blob.type, "image/png")
    assert.equal(result.width, 378)
    assert.equal(result.height, 672)
    assert.deepEqual(calls.map((call) => call.pageNumber).filter(Boolean), [2])
    assert.equal(calls.length, 2)
    assert.ok(Math.abs(calls[1].viewport.width - 100 * 240 / 72) < 1e-9)
    assert.ok(Math.abs(calls[1].viewport.height - 200 * 240 / 72) < 1e-9)
    assert.ok(Math.abs(calls[1].transform[4] - (378 - 100 * 240 / 72) / 2) < 1e-9)
    assert.ok(Math.abs(calls[1].transform[5] - (672 - 200 * 240 / 72) / 2) < 1e-9)
    assert.equal(calls[1].background, "white")
    assert.equal(canvas.width, 0)
    assert.equal(canvas.height, 0)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test("rejects an invalid page without requesting it", async () => {
  const { pdf, calls } = fakePdf()
  await assert.rejects(renderPdfPage(pdf, 4, "standard"), /page/i)
  assert.equal(calls.length, 0)
})

test("releases the canvas if Blob export fails", async () => {
  const originalDocument = globalThis.document
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toBlob: (callback) => callback(null),
  }
  globalThis.document = { createElement: () => canvas }
  try {
    const { pdf } = fakePdf()
    await assert.rejects(renderPdfPage(pdf, 1, "standard"), /Blob/)
    assert.equal(canvas.width, 0)
    assert.equal(canvas.height, 0)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test("caps large page bitmaps even at very-high quality", async () => {
  const originalDocument = globalThis.document
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toBlob: (callback) => callback(new Blob(["image"], { type: "image/png" })),
  }
  globalThis.document = { createElement: () => canvas }
  try {
    const { pdf } = fakePdf(10_000, 10_000)
    const result = await renderPdfPage(pdf, 1, "very-high")
    assert.ok(result.width * result.height <= 16_000_000)
    assert.ok(result.width <= 8192)
    assert.ok(result.height <= 8192)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})
