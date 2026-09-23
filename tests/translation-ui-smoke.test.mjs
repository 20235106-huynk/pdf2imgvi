import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { transformWithOxc } from "vite"

test("translation start requires a PDF, valid page range, and Gemini API key", async () => {
  const { translationStartError } = await import("../src/workspace/translation-start.ts")
  assert.match(translationStartError(null, [1], "key"), /PDF/i)
  assert.match(translationStartError({}, null, "key"), /page range/i)
  assert.match(translationStartError({}, [], "key"), /page range/i)
  assert.match(translationStartError({}, [1], null), /Settings/)
  assert.equal(translationStartError({}, [1], "key"), null)
})

test("a newly completed page refreshes saved images before the whole run finishes", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })
  let refreshes = 0
  let finish
  const finished = new Promise((resolve) => { finish = resolve })
  const context = {
    useEffect: () => {},
    useRef: (current) => ({ current }),
    useState: (value) => [value, () => {}],
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: ({ onChange }) => {
      onChange({ completedPages: 0, status: "running", batches: [], pages: [] })
      onChange({ completedPages: 1, status: "running", batches: [], pages: [] })
      return { finished, cancel: async () => {} }
    },
    getApiKey: async () => "key",
    getSettings: async () => ({}),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listCompletedPages: async () => { refreshes += 1; return [] },
    removeResults: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    setTimeout,
  }
  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)
  const tree = context.Panel({ pdf: {}, fileName: "book.pdf", selectedPages: [1], onRunningChange: () => {} })
  const findStart = (node) => {
    if (!node || typeof node !== "object") return null
    if (node.props?.children === "Start Translation") return node
    const children = node.props?.children
    return (Array.isArray(children) ? children : [children]).map(findStart).find(Boolean) ?? null
  }
  findStart(tree).props.onClick()
  await new Promise(setImmediate)
  assert.equal(refreshes, 1)
  finish()
  await new Promise(setImmediate)
})
