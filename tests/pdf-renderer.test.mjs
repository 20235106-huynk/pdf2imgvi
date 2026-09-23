import assert from "node:assert/strict"
import test from "node:test"

import { renderPdfPage } from "../src/services/pdf-renderer.ts"

function fakePdf(pageWidth = 100, pageHeight = 200) {
  const calls = []
  const page = {
    getViewport: ({ scale }) => ({ width: pageWidth * scale, height: pageHeight * scale }),
    render: ({ canvas, viewport }) => {
      calls.push({ canvas, viewport })
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

test("renders only the requested page to a Blob and releases the canvas", async () => {
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
    assert.equal(result.width, 200)
    assert.equal(result.height, 400)
    assert.deepEqual(calls.map((call) => call.pageNumber).filter(Boolean), [2])
    assert.equal(calls.length, 2)
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
