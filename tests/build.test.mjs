import assert from "node:assert/strict"
import { access, readFile, readdir } from "node:fs/promises"
import test from "node:test"

const dist = (path) => new URL(`../dist/${path}`, import.meta.url)

test("dist contains every extension entry", async () => {
  for (const path of [
    "manifest.json",
    "popup.html",
    "workspace.html",
    "service-worker.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
  ]) {
    await access(dist(path))
  }

  const manifest = JSON.parse(await readFile(dist("manifest.json"), "utf8"))
  assert.equal(manifest.name, "pdf2imgvi")
  assert.deepEqual(manifest.permissions, ["storage", "downloads"])

  for (const page of ["popup.html", "workspace.html"]) {
    const html = await readFile(dist(page), "utf8")
    assert.match(html, /<title>pdf2imgvi<\/title>/)
    assert.match(html, /<script[^>]+src="\/assets\/.+\.js"/)
  }

  const assetNames = await readdir(dist("assets"))
  const scripts = await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(dist(`assets/${name}`), "utf8")),
  )
  const javascript = scripts.join("\n")
  const workerAsset = assetNames.find((name) => /^pdf\.worker\.min-.+\.mjs$/.test(name))
  assert.ok(workerAsset, "PDF.js worker must be emitted locally")
  assert.ok(javascript.includes(workerAsset), "workspace bundle must reference the local worker")
  for (const text of [
    "pdf2imgvi",
    "Open Translator",
    "Settings",
    "Translate PDFs to Vietnamese",
    "Choose PDF",
    "Previous",
    "Next",
    "Save Changes",
    "Reset to Defaults",
    "Session only",
    "Clear Translation Cache",
  ]) {
    assert.match(javascript, new RegExp(text))
  }

  const popupScript = assetNames.find((name) => /^popup-.+\.js$/.test(name))
  assert.ok(popupScript)
  assert.doesNotMatch(await readFile(dist(`assets/${popupScript}`), "utf8"), /Settings/)
})

test("declared PNG icons have their advertised dimensions", async () => {
  for (const size of [16, 32, 48, 128]) {
    const png = await readFile(dist(`icons/icon-${size}.png`))
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})
