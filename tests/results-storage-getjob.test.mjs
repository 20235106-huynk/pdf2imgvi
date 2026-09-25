import test from "node:test"
import assert from "node:assert/strict"
import * as storage from "../src/features/translation/results.storage.ts"

test("results.storage exports getJob function", () => {
  assert.equal(typeof storage.getJob, "function")
})
