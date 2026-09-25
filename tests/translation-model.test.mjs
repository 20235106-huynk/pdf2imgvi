import assert from "node:assert/strict"
import test from "node:test"

import { jobStatus } from "../src/features/translation/model.ts"

test("stored job status follows page and batch progress", () => {
  assert.equal(jobStatus({ pages: [{ status: "pending" }], completedPages: 0 }), "preparing")
  assert.equal(jobStatus({ pages: [{ status: "queued" }], completedPages: 0 }), "submitted")
  assert.equal(jobStatus({ pages: [{ status: "processing" }], completedPages: 0 }), "processing")
  assert.equal(jobStatus({ pages: [{ status: "completed" }, { status: "failed" }], completedPages: 1 }), "completed_with_errors")
})
