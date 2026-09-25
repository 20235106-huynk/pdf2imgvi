import assert from "node:assert/strict"
import test from "node:test"

import { cropImageToA4 } from "../src/features/pdf/a4-image.ts"

test("crops a 2:3 result equally from top and bottom into an A4 JPEG", async () => {
  const previousBitmap = globalThis.createImageBitmap
  const previousDocument = globalThis.document
  const draws = []
  const encodings = []
  let closed = false
  globalThis.createImageBitmap = async () => ({ width: 800, height: 1200, close() { closed = true } })
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: (...args) => draws.push(args), fillRect() {} }),
      toBlob(callback, type, quality) {
        encodings.push([type, quality])
        callback(new Blob(["cropped"], { type }))
      },
    }),
  }
  try {
    const result = await cropImageToA4(new Blob(["input"], { type: "image/png" }))
    assert.equal(result.type, "image/jpeg")
    assert.equal(await result.text(), "cropped")
    assert.equal(draws.length, 1)
    assert.deepEqual(draws[0].slice(1), [0, 34.5, 800, 1131, 0, 0, 800, 1131])
    assert.equal(closed, true)
    assert.deepEqual(encodings, [["image/jpeg", 0.9]])
  } finally {
    globalThis.createImageBitmap = previousBitmap
    globalThis.document = previousDocument
  }
})
