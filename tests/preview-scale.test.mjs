import assert from "node:assert/strict"
import test from "node:test"

import { getPreviewScales, MAX_PREVIEW_PIXELS } from "../src/workspace/preview-scale.ts"

test("ordinary pages stay readable without exceeding the bitmap cap", () => {
  const { cssScale, renderScale } = getPreviewScales(612, 792, 2)
  assert.ok(Math.round(612 * cssScale) <= 900)
  assert.ok(renderScale >= cssScale)
  assert.ok(612 * 792 * renderScale ** 2 <= MAX_PREVIEW_PIXELS)
})

test("very tall pages and extreme device ratios stay bounded", () => {
  const { cssScale, renderScale } = getPreviewScales(612, 10000, 5)
  assert.ok(Math.round(612 * cssScale) <= 900)
  assert.ok(612 * 10000 * renderScale ** 2 <= MAX_PREVIEW_PIXELS)
  assert.ok(renderScale < cssScale * 5)
})
