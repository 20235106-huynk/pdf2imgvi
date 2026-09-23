import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("manifest exposes only the requested MV3 capabilities", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"),
  )

  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.name, "pdf2imgvi")
  assert.deepEqual(manifest.permissions, ["storage", "downloads"])
  assert.deepEqual(manifest.host_permissions, ["https://generativelanguage.googleapis.com/*"])
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false)
  assert.equal(manifest.action.default_popup, "popup.html")
  assert.equal(manifest.background.service_worker, "service-worker.js")
  assert.deepEqual(manifest.icons, {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  })
})
