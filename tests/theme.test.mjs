import assert from "node:assert/strict"
import test from "node:test"
import { getTheme, setTheme, toggleTheme } from "../src/lib/theme.ts"

test("theme helper toggles between light and dark", () => {
  setTheme("light")
  assert.equal(getTheme(), "light")
  const next = toggleTheme()
  assert.equal(next, "dark")
  assert.equal(getTheme(), "dark")
  const back = toggleTheme()
  assert.equal(back, "light")
  assert.equal(getTheme(), "light")
})
