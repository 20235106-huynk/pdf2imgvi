import assert from "node:assert/strict"
import test from "node:test"
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs"

// A 2×2 JPEG 2000 image encoded with OpenJPEG, embedded as a PDF image XObject.
const image = Buffer.from(
  "AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAAgAAAAIAAw8HAAAAAAAPY29scgEAAAAAABAAAACZanAyY/9P/1EALwAAAAAAAgAAAAIAAAAAAAAAAAAAAAIAAAACAAAAAAAAAAAAAw8BAQ8BAQ8BAf9SAAwAAAABAQEEBAAB/1wAB0CAiIiQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAHgAB/5PP/DAIB7eA3/iQEAE/gICA/9k=",
  "base64",
)

function scannedPdf() {
  const chunks = [Buffer.from("%PDF-1.7\n")]
  const offsets = [0]
  const add = (number, body) => {
    offsets[number] = Buffer.concat(chunks).length
    chunks.push(Buffer.from(`${number} 0 obj\n`), body, Buffer.from("\nendobj\n"))
  }
  add(1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"))
  add(2, Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"))
  add(3, Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2 2] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"))
  add(4, Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode /Length ${image.length} >>\nstream\n`),
    image,
    Buffer.from("\nendstream"),
  ]))
  const content = Buffer.from("q 2 0 0 2 0 0 cm /Im0 Do Q")
  add(5, Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
    content,
    Buffer.from("\nendstream"),
  ]))
  const xref = Buffer.concat(chunks).length
  chunks.push(Buffer.from(
    `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  ))
  return Uint8Array.from(Buffer.concat(chunks))
}

test("bundled OpenJPEG decoder handles an image-only PDF", { timeout: 10_000 }, async () => {
  const task = getDocument({
    data: scannedPdf(),
    wasmUrl: new URL("../dist/wasm/", import.meta.url).pathname,
  })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const operators = await page.getOperatorList()
    const index = operators.fnArray.indexOf(OPS.paintImageXObject)
    assert.ok(index >= 0, "image should be decoded for page rendering")
    const imageId = operators.argsArray[index][0]
    const decoded = await new Promise((resolve) => page.objs.get(imageId, resolve))
    assert.equal(decoded.width, 2)
    assert.equal(decoded.height, 2)
    assert.ok(decoded.data.length > 0)
  } finally {
    await task.destroy()
  }
})
