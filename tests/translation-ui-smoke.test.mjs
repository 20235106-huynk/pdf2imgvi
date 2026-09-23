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

test("translation progress labels distinguish preparation, submission, polling, and completion", async () => {
  const { translationProgressLabel } = await import("../src/workspace/translation-start.ts")
  const job = { status: "running", stage: "preparing" }
  assert.equal(translationProgressLabel(job), "Preparing pages…")
  assert.equal(translationProgressLabel({ ...job, stage: "submitted" }), "Batch submitted")
  assert.equal(translationProgressLabel({ ...job, stage: "waiting" }), "Waiting for Gemini…")
  assert.equal(translationProgressLabel({ status: "completed", stage: "finished" }), "Translation completed")
  assert.equal(translationProgressLabel({ status: "failed", stage: "finished" }), "Translation finished with errors")
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
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: ({ onChange }) => {
      onChange({ completedPages: 0, status: "running", batches: [], pages: [] })
      onChange({ completedPages: 1, status: "running", batches: [], pages: [] })
      return { finished, cancel: async () => {} }
    },
    resumeJob: async () => {},
    retryFailedPages: async () => {},
    getApiKey: async () => "key",
    getSettings: async () => ({}),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => { refreshes += 1; return [] },
    createJob: async () => {},
    getJob: async () => undefined,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Preparing pages…",
    createBatchRecord: async () => {},
    updateBatch: async () => {},
    exportTranslatedPdf: async () => ({ filename: "test.pdf", blob: new Blob([]), pageCount: 1 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }
  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)
  const tree = context.Panel({ pdf: { numPages: 1 }, fileName: "book.pdf", fileSize: 1024, selectedPages: [1], onRunningChange: () => {} })
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

test("renders Download PDF button for saved job with completed pages and triggers export", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  let exportedJobId = null
  let downloadedFilename = null

  const savedJob = {
    id: "job-completed-1",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "completed",
    completedPages: 3,
    failedPages: 0,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const initial = typeof value === "function" ? value() : value
      if (Array.isArray(initial) && initial.length === 0) return [[savedJob], () => {}]
      return [initial, () => {}]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async () => {},
    retryFailedPages: async () => {},
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Completed",
    exportTranslatedPdf: async ({ jobId }) => {
      exportedJobId = jobId
      return { filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 3 }
    },
    downloadPdfBlob: async (_blob, filename) => {
      downloadedFilename = filename
    },
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)
  const tree = context.Panel({ pdf: null, fileName: "", fileSize: 0, selectedPages: null, onRunningChange: () => {} })

  const findDownloadBtn = (node) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map(findDownloadBtn).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (node.props?.children === "Download PDF") return node
    return findDownloadBtn(node.props?.children)
  }

  const downloadBtn = findDownloadBtn(tree)
  assert.ok(downloadBtn, "Download PDF button should be rendered")
  downloadBtn.props.onClick()
  for (let i = 0; i < 5; i++) await new Promise(setImmediate)
  assert.equal(exportedJobId, "job-completed-1")
  assert.equal(downloadedFilename, "doc_vi.pdf")
})

test("shows partial export confirmation before exporting job with failed pages", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  let exported = false
  const stateMap = new Map()

  const savedJob = {
    id: "job-errors-1",
    fileName: "report.pdf",
    fileSize: 2048,
    totalPages: 5,
    selectedPages: [1, 2, 3, 4, 5],
    status: "completed_with_errors",
    completedPages: 3,
    failedPages: 2,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  let stateIndex = 0
  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const idx = stateIndex++
      const initial = typeof value === "function" ? value() : value
      if (!stateMap.has(idx)) {
        if (Array.isArray(initial) && initial.length === 0) {
          stateMap.set(idx, [savedJob])
        } else {
          stateMap.set(idx, initial)
        }
      }
      const val = stateMap.get(idx)
      const setter = (next) => {
        const resolved = typeof next === "function" ? next(stateMap.get(idx)) : next
        stateMap.set(idx, resolved)
      }
      return [val, setter]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async () => {},
    retryFailedPages: async () => {},
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Completed with errors",
    exportTranslatedPdf: async () => {
      exported = true
      return { filename: "report_vi.pdf", blob: new Blob([]), pageCount: 3 }
    },
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)

  const render = () => {
    stateIndex = 0
    return context.Panel({ pdf: null, fileName: "", fileSize: 0, selectedPages: null, onRunningChange: () => {} })
  }

  let tree = render()

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const downloadBtn = findBtnByText(tree, "Download PDF")
  assert.ok(downloadBtn, "Download PDF button should be present")

  // Click Download PDF -> Should show confirmation prompt, NOT export immediately
  downloadBtn.props.onClick()
  tree = render()

  assert.equal(exported, false, "Should not export immediately when failed pages exist")

  const confirmBtn = findBtnByText(tree, "Export 3 pages")
  assert.ok(confirmBtn, "Partial export confirmation button should appear")

  // Click confirm button -> Should now trigger export
  confirmBtn.props.onClick()
  for (let i = 0; i < 5; i++) await new Promise(setImmediate)
  assert.equal(exported, true, "Should export after confirmation")
})

test("incomplete or submitted job renders Resume button and triggers resumeJob", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  let resumedJobId = null
  const savedJob = {
    id: "job-submitted-1",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "submitted",
    completedPages: 1,
    failedPages: 0,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const initial = typeof value === "function" ? value() : value
      if (Array.isArray(initial) && initial.length === 0) return [[savedJob], () => {}]
      return [initial, () => {}]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async ({ jobId }) => { resumedJobId = jobId },
    retryFailedPages: async () => {},
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Submitted",
    exportTranslatedPdf: async () => ({ filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 3 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)
  const tree = context.Panel({ pdf: null, fileName: "", fileSize: 0, selectedPages: null, onRunningChange: () => {} })

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const resumeBtn = findBtnByText(tree, "Resume")
  assert.ok(resumeBtn, "Resume button should be rendered for submitted job")
  resumeBtn.props.onClick()
  for (let i = 0; i < 5; i++) await new Promise(setImmediate)
  assert.equal(resumedJobId, "job-submitted-1")
})

test("resuming when API key is missing prompts to open Settings without marking job failed", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  let resumedJobId = null
  let jobMarkedFailed = false
  const stateMap = new Map()
  let stateIndex = 0

  const savedJob = {
    id: "job-submitted-2",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "submitted",
    completedPages: 1,
    failedPages: 0,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const idx = stateIndex++
      const initial = typeof value === "function" ? value() : value
      if (!stateMap.has(idx)) {
        if (Array.isArray(initial) && initial.length === 0) {
          stateMap.set(idx, [savedJob])
        } else {
          stateMap.set(idx, initial)
        }
      }
      const val = stateMap.get(idx)
      const setter = (next) => {
        const resolved = typeof next === "function" ? next(stateMap.get(idx)) : next
        stateMap.set(idx, resolved)
      }
      return [val, setter]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async ({ jobId }) => { resumedJobId = jobId },
    retryFailedPages: async () => {},
    getApiKey: async () => "", // Empty key
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    updateJobRecord: async (_id, patch) => {
      if (patch.status === "failed") jobMarkedFailed = true
    },
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Submitted",
    exportTranslatedPdf: async () => ({ filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 3 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)

  const render = () => {
    stateIndex = 0
    return context.Panel({ pdf: null, fileName: "", fileSize: 0, selectedPages: null, onRunningChange: () => {} })
  }

  let tree = render()

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const resumeBtn = findBtnByText(tree, "Resume")
  assert.ok(resumeBtn, "Resume button should be present")
  resumeBtn.props.onClick()
  for (let i = 0; i < 5; i++) await new Promise(setImmediate)
  tree = render()

  assert.equal(resumedJobId, null, "Should not invoke resumeJob without API key")
  assert.equal(jobMarkedFailed, false, "Should not mark job as failed when API key is missing")

  const openSettingsBtn = findBtnByText(tree, "Open Settings")
  assert.ok(openSettingsBtn, "Prompt to Open Settings should be rendered")
})

test("job with failed pages renders Retry Failed Pages button and triggers retryFailedPages", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  let retriedJobId = null
  const savedJob = {
    id: "job-failed-1",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "completed_with_errors",
    completedPages: 2,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const initial = typeof value === "function" ? value() : value
      if (Array.isArray(initial) && initial.length === 0) return [[savedJob], () => {}]
      return [initial, () => {}]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async () => {},
    retryFailedPages: async ({ jobId }) => { retriedJobId = jobId },
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Completed with errors",
    exportTranslatedPdf: async () => ({ filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 3 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)
  // Matching PDF: doc.pdf, numPages: 3
  const tree = context.Panel({
    pdf: { numPages: 3 },
    fileName: "doc.pdf",
    fileSize: 1024,
    selectedPages: [1, 2, 3],
    onRunningChange: () => {},
  })

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const retryBtn = findBtnByText(tree, "Retry Failed Pages")
  assert.ok(retryBtn, "Retry Failed Pages button should be rendered")
  retryBtn.props.onClick()
  for (let i = 0; i < 5; i++) await new Promise(setImmediate)
  assert.equal(retriedJobId, "job-failed-1")
})

test("job with failed pages prompts for original PDF when no matching PDF is loaded", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  const stateMap = new Map()
  let stateIndex = 0

  const savedJob = {
    id: "job-failed-2",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 3,
    selectedPages: [1, 2, 3],
    status: "completed_with_errors",
    completedPages: 2,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => {
      const idx = stateIndex++
      const initial = typeof value === "function" ? value() : value
      if (!stateMap.has(idx)) {
        if (Array.isArray(initial) && initial.length === 0) {
          stateMap.set(idx, [savedJob])
        } else {
          stateMap.set(idx, initial)
        }
      }
      const val = stateMap.get(idx)
      const setter = (next) => {
        const resolved = typeof next === "function" ? next(stateMap.get(idx)) : next
        stateMap.set(idx, resolved)
      }
      return [val, setter]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async () => {},
    retryFailedPages: async () => {},
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf" }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [savedJob],
    createJob: async () => {},
    getJob: async () => savedJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => [],
    getBatchesByJob: async () => [],
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: () => "Completed with errors",
    exportTranslatedPdf: async () => ({ filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 3 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)

  const render = () => {
    stateIndex = 0
    return context.Panel({ pdf: null, fileName: "", fileSize: 0, selectedPages: null, onRunningChange: () => {} })
  }

  let tree = render()

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const findTextInTree = (node, pattern) => {
    if (!node) return false
    if (Array.isArray(node)) return node.some((n) => findTextInTree(n, pattern))
    if (typeof node !== "object") return false
    if (typeof node.props?.children === "string" && pattern.test(node.props.children)) return true
    if (Array.isArray(node.props?.children)) {
      if (pattern.test(node.props.children.map(String).join(""))) return true
    }
    return findTextInTree(node.props?.children, pattern)
  }

  const retryBtn = findBtnByText(tree, "Retry Failed Pages")
  assert.ok(retryBtn, "Retry Failed Pages button should be rendered")
  retryBtn.props.onClick()
  tree = render()

  assert.ok(
    findTextInTree(tree, /select the original PDF/i),
    "Should prompt to select the original PDF when no matching PDF is open",
  )
})

test("retrying failed pages automatically updates active job box to completed when retry finishes", async () => {
  const source = await readFile(new URL("../src/workspace/TranslationPanel.tsx", import.meta.url), "utf8")
  const transformed = await transformWithOxc(source, "TranslationPanel.tsx", { jsx: { runtime: "automatic" } })
  const code = transformed.code.replace(/^import .*$/gm, "").replace("export function TranslationPanel", "function TranslationPanel")
  const elements = (type, props) => ({ type, props })

  const stateMap = new Map()
  let stateIndex = 0

  const initialJob = {
    id: "job-retry-update",
    pages: [
      { pageNumber: 1, status: "completed" },
      { pageNumber: 2, status: "failed", error: "Gemini error" },
    ],
    batches: [{ id: "b1", pageNumbers: [1, 2], state: "failed" }],
    completedPages: 1,
    failedPages: 1,
    cancelledPages: 0,
    status: "failed",
    stage: "finished",
    geminiModel: "gemini-3.1-flash-image",
  }

  let dbStoredJob = {
    id: "job-retry-update",
    fileName: "doc.pdf",
    fileSize: 1024,
    totalPages: 2,
    selectedPages: [1, 2],
    status: "completed_with_errors",
    completedPages: 1,
    failedPages: 1,
    cancelledPages: 0,
    createdAt: 1000,
    updatedAt: 2000,
  }

  let dbPages = [
    { jobId: "job-retry-update", pageNumber: 1, status: "completed", createdAt: 0, updatedAt: 0 },
    { jobId: "job-retry-update", pageNumber: 2, status: "failed", error: "Gemini error", createdAt: 0, updatedAt: 0 },
  ]

  let dbBatches = [
    { id: "b1", jobId: "job-retry-update", batchName: "batches/b1", model: "gemini-3.1-flash-image", pageNumbers: [1, 2], status: "failed", createdAt: 0, updatedAt: 0 },
  ]

  const context = {
    useEffect: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (initial) => {
      const idx = stateIndex++
      if (!stateMap.has(idx)) {
        // Index 0 is `job` state in TranslationPanel
        const val = idx === 0 ? initialJob : typeof initial === "function" ? initial() : initial
        stateMap.set(idx, val)
      }
      return [
        stateMap.get(idx),
        (next) => {
          const val = typeof next === "function" ? next(stateMap.get(idx)) : next
          stateMap.set(idx, val)
        },
      ]
    },
    _jsx: elements,
    _jsxs: elements,
    Button: "Button",
    AbortController: globalThis.AbortController,
    abortableDelay: async () => {},
    createGeminiBatchClient: () => ({}),
    renderPdfPage: () => {},
    startTranslation: () => ({ finished: Promise.resolve(), cancel: async () => {} }),
    resumeJob: async () => {},
    retryFailedPages: async () => {
      // Simulate successful retry of page 2
      dbStoredJob = { ...dbStoredJob, status: "completed", completedPages: 2, failedPages: 0 }
      dbPages = [
        { jobId: "job-retry-update", pageNumber: 1, status: "completed", createdAt: 0, updatedAt: 0 },
        { jobId: "job-retry-update", pageNumber: 2, status: "completed", createdAt: 0, updatedAt: 0 },
      ]
      dbBatches = [
        { id: "b1", jobId: "job-retry-update", batchName: "batches/b1", model: "gemini-3.1-flash-image", pageNumbers: [1, 2], status: "succeeded", createdAt: 0, updatedAt: 0 },
      ]
    },
    getApiKey: async () => "key",
    getSettings: async () => ({ outputFilenameTemplate: "{original}_vi.pdf", pollingIntervalMs: 120000 }),
    registerBatch: async () => {},
    unregisterBatch: async () => {},
    listJobs: async () => [dbStoredJob],
    createJob: async () => {},
    getJob: async () => dbStoredJob,
    deleteJob: async () => {},
    getPageImage: async () => undefined,
    getPagesByJob: async () => dbPages,
    getBatchesByJob: async () => dbBatches,
    saveJobSnapshot: async () => {},
    saveCompletedPage: async () => {},
    translationStartError: () => null,
    translationProgressLabel: (j) => j.status === "completed" ? "Translation completed" : "Translation finished with errors",
    exportTranslatedPdf: async () => ({ filename: "doc_vi.pdf", blob: new Blob([]), pageCount: 2 }),
    downloadPdfBlob: async () => {},
    chrome: { runtime: { sendMessage: async () => ({ tabId: 12 }) } },
    window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} },
    setTimeout,
  }

  vm.runInNewContext(`${code}\nglobalThis.Panel = TranslationPanel`, context)

  const render = () => {
    stateIndex = 0
    return context.Panel({ pdf: { numPages: 2 }, fileName: "doc.pdf", fileSize: 1024, selectedPages: [1, 2], onRunningChange: () => {} })
  }

  const findBtnByText = (node, text) => {
    if (!node) return null
    if (Array.isArray(node)) return node.map((n) => findBtnByText(n, text)).find(Boolean) ?? null
    if (typeof node !== "object") return null
    if (typeof node.props?.children === "string" && node.props.children.includes(text)) return node
    if (Array.isArray(node.props?.children)) {
      if (node.props.children.map(String).join("").includes(text)) return node
    }
    return findBtnByText(node.props?.children, text)
  }

  const findTextInTree = (node, pattern) => {
    if (!node) return false
    if (Array.isArray(node)) return node.some((n) => findTextInTree(n, pattern))
    if (typeof node !== "object") return false
    if (typeof node.props?.children === "string" && pattern.test(node.props.children)) return true
    if (Array.isArray(node.props?.children)) {
      if (pattern.test(node.props.children.map(String).join(""))) return true
    }
    return findTextInTree(node.props?.children, pattern)
  }

  let tree = render()

  // Initially shows "Translation finished with errors"
  assert.ok(findTextInTree(tree, /Translation finished with errors/), "Active box should initially show errors")
  assert.ok(findTextInTree(tree, /1 failed/), "Should show 1 failed")

  const retryBtn = findBtnByText(tree, "Retry Failed Pages")
  assert.ok(retryBtn, "Retry Failed Pages button should be rendered")

  // Trigger retry
  retryBtn.props.onClick()
  for (let i = 0; i < 10; i++) await new Promise(setImmediate)

  tree = render()

  // Active box must now show "Translation completed"!
  assert.ok(findTextInTree(tree, /Translation completed/), "Active box should update to Translation completed")
  assert.ok(findTextInTree(tree, /2 completed · 0 failed/), "Should show 2 completed and 0 failed")
  assert.equal(stateMap.get(0).status, "completed")
  assert.equal(stateMap.get(0).failedPages, 0)
})
