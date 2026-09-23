import assert from "node:assert/strict"
import test from "node:test"

import { parsePageSelection } from "../src/workspace/page-selection.ts"

test("accepts ranges and individual pages in document order", () => {
  assert.deepEqual(parsePageSelection("1-3, 5, 8-10", 10), [1, 2, 3, 5, 8, 9, 10])
  assert.deepEqual(parsePageSelection("5, 2-4, 3", 5), [2, 3, 4, 5])
  assert.deepEqual(parsePageSelection("1-5", 5), [1, 2, 3, 4, 5])
})

test("rejects malformed or out-of-range page selections", () => {
  for (const input of ["", "1,", "0", "2-1", "1-6", "a", "1--3", "1.5", "9007199254740993"]) {
    assert.equal(parsePageSelection(input, 5), null, input)
  }
})
