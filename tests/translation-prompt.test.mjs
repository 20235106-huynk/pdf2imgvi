import assert from "node:assert/strict"
import test from "node:test"

import { translationPrompt } from "../src/features/translation/translation-prompt.ts"

test("translation prompt uses language names instead of language codes", () => {
  const prompt = translationPrompt("en", "vi")

  assert.match(prompt, /English/)
  assert.match(prompt, /Vietnamese/)
  assert.doesNotMatch(prompt, /\b(?:en|vi)\b/)
})
