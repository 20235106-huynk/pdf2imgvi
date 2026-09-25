import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { transformWithOxc } from "vite"

test("preview fits an A4 page without zoom controls", async () => {
  const source = await readFile(new URL("../src/features/pdf/PdfViewport.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "PdfViewport.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function PdfViewport", "function PdfViewport")
  const element = (type, props) => ({ type, props })
  const context = {
    _jsx: element, _jsxs: element,
    useI18n: () => ({ t: (key) => key }),
    Button: "button",
  }
  for (const name of ["FileText", "X", "ChevronLeft", "ChevronRight", "ZoomIn", "ZoomOut", "RotateCcw", "Sparkles", "Columns", "Layers", "Loader2"]) {
    context[name] = name
  }
  vm.runInNewContext(`${code}\nglobalThis.Viewport = PdfViewport`, context)
  const root = context.Viewport({ pdf: { numPages: 1 }, fileName: "a.pdf", fileSize: 1, pageNumber: 1,
    viewMode: "original", zoomLevel: 1, rendering: false, loadingTranslatedImage: false,
    translatedImageUrl: null, translationRunning: false, canvasRef: {}, sideCanvasRef: {},
    setViewMode() {}, setZoomLevel() {}, setPageNumber() {}, removeFile() {} })
  const nodes = []
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node || typeof node !== "object") return
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(root)
  assert.ok(nodes.some((node) => node.props?.className?.includes("aspect-[210/297]")))
  assert.ok(nodes.some((node) => node.type === "canvas" && node.props?.className?.includes("object-contain")))
  assert.equal(nodes.some((node) => ["zoomIn", "zoomOut", "resetZoom"].includes(node.props?.title)), false)
})
