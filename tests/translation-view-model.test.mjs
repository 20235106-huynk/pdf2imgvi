import assert from "node:assert/strict"
import test from "node:test"

import { toTranslationJob } from "../src/features/translation/translation-view-model.ts"

test("saved job maps to an in-progress translation view", () => {
  const job = toTranslationJob({ id: "j", selectedPages: [2], status: "submitted", completedPages: 0, failedPages: 0, cancelledPages: 0 }, [], [])
  assert.equal(job.status, "running")
  assert.equal(job.stage, "submitted")
  assert.deepEqual(job.pages.map((page) => page.pageNumber), [2])
})
