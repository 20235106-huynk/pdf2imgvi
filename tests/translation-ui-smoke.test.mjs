import assert from "node:assert/strict"
import test from "node:test"

test("translation start requires a PDF, valid page range, and Gemini API key", async () => {
  const { translationStartError } = await import("../src/workspace/translation-start.ts")
  assert.match(translationStartError(null, [1], "key"), /PDF/i)
  assert.match(translationStartError({}, null, "key"), /page range/i)
  assert.match(translationStartError({}, [], "key"), /page range/i)
  assert.match(translationStartError({}, [1], null), /Settings/)
  assert.equal(translationStartError({}, [1], "key"), null)
})
