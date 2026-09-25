import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { transformWithOxc } from "vite"

test("saved translation preview fits an A4 frame", async () => {
  const source = await readFile(new URL("../src/features/translation/TranslationHistory.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationHistory.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationHistory", "function TranslationHistory")
  const element = (type, props) => ({ type, props })
  const context = { _jsx: element, _jsxs: element, Button: "button" }
  vm.runInNewContext(`${code}\nglobalThis.History = TranslationHistory`, context)
  const root = context.History({ savedJobs: [], viewed: { job: { fileName: "a.pdf", failedPages: 0 }, pages: [] },
    selectedPage: 1, resultUrl: "blob:result", running: false, exportingJobId: null,
    renderJobActions: () => null, onSelectPage() {}, onRegenerate: async () => {} })
  const nodes = []
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node || typeof node !== "object") return
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(root)
  assert.ok(nodes.some((node) => node.props?.className?.includes("aspect-[210/297]")))
  assert.ok(nodes.some((node) => node.type === "img" && node.props?.className?.includes("object-contain")))
})

test("large translation uses page navigation and marks only the viewed page", async () => {
  const source = await readFile(new URL("../src/features/translation/TranslationHistory.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationHistory.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationHistory", "function TranslationHistory")
  const element = (type, props) => ({ type, props })
  const context = { _jsx: element, _jsxs: element, Button: "button" }
  vm.runInNewContext(`${code}\nglobalThis.History = TranslationHistory`, context)
  const pages = Array.from({ length: 300 }, (_, index) => ({ pageNumber: index + 1, status: index === 199 ? "failed" : "completed" }))
  let selected = null
  let marked = null
  const root = context.History({ savedJobs: [], viewed: { job: { fileName: "large.pdf", totalPages: 300, failedPages: 1 }, pages },
    selectedPage: 100, resultUrl: "blob:result", running: false, exportingJobId: null,
    renderJobActions: () => null, onSelectPage: (page) => { selected = page }, onRegenerate: async (page) => { marked = page } })
  const nodes = []
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node || typeof node !== "object") return
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(root)
  assert.ok(nodes.length < 100, "page navigation should not render one button per page")
  const mark = nodes.find((node) => node.props?.["aria-label"] === "Mark page 100 for regeneration")
  assert.ok(mark)
  await mark.props.onClick()
  assert.equal(marked, 100)
  const attention = nodes.find((node) => Array.isArray(node.props?.children) && node.props.children[0] === "Next needing attention (")
  assert.ok(attention)
  attention.props.onClick()
  assert.equal(selected, 200)

  pages[99].retryRequested = true
  nodes.length = 0
  visit(context.History({ savedJobs: [], viewed: { job: { fileName: "large.pdf", totalPages: 300, failedPages: 1 }, pages },
    selectedPage: 100, resultUrl: "blob:result", running: false, exportingJobId: null,
    renderJobActions: () => null, onSelectPage: () => {}, onRegenerate: async (page) => { marked = page } }))
  const unmark = nodes.find((node) => node.props?.["aria-label"] === "Unmark page 100 for regeneration")
  assert.ok(unmark)
  await unmark.props.onClick()
  assert.equal(marked, 100)
})
