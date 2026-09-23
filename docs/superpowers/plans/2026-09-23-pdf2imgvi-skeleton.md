# pdf2imgvi Chrome Extension Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the initial `pdf2imgvi` Manifest V3 Chrome extension with React popup/workspace pages, shadcn/ui controls, and a service worker that opens the workspace in a new tab.

**Architecture:** Vite builds `popup.html`, `workspace.html`, and `src/background/service-worker.ts` as explicit entries. Manifest and PNG icons live in `public/` and are copied unchanged to `dist/`; small Node standard-library tests verify source behavior and the unpacked build.

**Tech Stack:** React, TypeScript strict mode, Vite, Chrome Extension Manifest V3, shadcn/ui, Tailwind CSS, Node test runner, `pdfjs-dist`, `pdf-lib`, Dexie.

**Spec:** `docs/superpowers/specs/2026-09-23-pdf2imgvi-skeleton-design.md`

## Global Constraints

- Use the exact lowercase name `pdf2imgvi` for the npm package, extension name, HTML titles, and visible application headings.
- Manifest permissions are exactly `storage` and `downloads`; declare no host permissions and never declare `<all_urls>`.
- TypeScript must use strict mode and production source must not use `any`.
- Include only the shadcn/ui `Button` component required by the two screens.
- Install `pdfjs-dist`, `pdf-lib`, and `dexie`, but do not import them or implement PDF/storage behavior yet.
- Do not add PDF parsing/rendering, translation, API keys, IndexedDB behavior, schedulers, queues, retries, pause/resume, export, Web Worker logic, backend code, or authentication.
- `npm run dev` starts Vite; `npm run build` creates the unpacked extension in `dist/`.

## Review Focus

- Permission drift: `manifest.json` must contain exactly `storage` and `downloads`; Task 1 tests the exact array.
- Accidental host access: the manifest must omit `host_permissions` and `<all_urls>`; Task 1 tests both conditions.
- Missing or invalid extension icons: all declared 16/32/48/128 PNG files must exist with matching dimensions; Task 4 tests their PNG headers.
- Message routing mistakes: `OPEN_WORKSPACE` must open only `workspace.html`, while unrelated messages do nothing; Task 3 tests both paths.
- Incomplete unpacked build: popup, workspace, service worker, manifest, icons, and emitted page assets must exist in `dist/`; Task 4 tests every artifact.

---

### Task 1: Initialize the toolchain and Manifest V3 configuration

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json` through npm
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `public/manifest.json`
- Create: `tests/manifest.test.mjs`

**Interfaces:**
- Consumes: the approved design spec only.
- Produces: npm scripts `dev`, `typecheck`, `build`, and `test`; Vite entries named `popup`, `workspace`, and `service-worker`; Manifest V3 metadata consumed by Task 4.

- [ ] **Step 1: Initialize Git and preserve the approved spec**

Run:

```bash
git init
git add docs/superpowers/specs/2026-09-23-pdf2imgvi-skeleton-design.md docs/superpowers/plans/2026-09-23-pdf2imgvi-skeleton.md
git commit -m "docs: add pdf2imgvi extension design"
```

Expected: a new repository with the approved spec committed.

- [ ] **Step 2: Write the failing manifest test**

Create `tests/manifest.test.mjs`:

```js
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
  assert.equal("host_permissions" in manifest, false)
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
```

- [ ] **Step 3: Run the manifest test and verify RED**

Run:

```bash
node --test tests/manifest.test.mjs
```

Expected: FAIL with `ENOENT` for `public/manifest.json`.

- [ ] **Step 4: Create the npm package and install only required dependencies**

Run:

```bash
npm init -y
npm pkg set name=pdf2imgvi type=module
npm pkg set private=true --json
npm pkg set scripts.dev=vite scripts.typecheck="tsc -b" scripts.build="npm run typecheck && vite build" scripts.test="node --test"
npm install react react-dom pdfjs-dist pdf-lib dexie
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom @types/chrome @types/node tailwindcss @tailwindcss/vite
```

Expected: `package.json` is named `pdf2imgvi`, the requested future dependencies are under `dependencies`, build tooling is under `devDependencies`, and npm creates `package-lock.json`.

- [ ] **Step 5: Add TypeScript strict configuration**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Create `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["chrome"]
  },
  "include": ["src"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Add the Vite multi-entry build configuration**

Create `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fromRoot("./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: fromRoot("./popup.html"),
        workspace: fromRoot("./workspace.html"),
        "service-worker": fromRoot("./src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "service-worker"
            ? "service-worker.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
})
```

- [ ] **Step 7: Add the minimal manifest and ignore generated files**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "pdf2imgvi",
  "version": "0.1.0",
  "description": "Translate PDFs to Vietnamese.",
  "permissions": ["storage", "downloads"],
  "action": {
    "default_title": "pdf2imgvi",
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
```

- [ ] **Step 8: Run the manifest test and verify GREEN**

Run:

```bash
npm test -- tests/manifest.test.mjs
```

Expected: one test passes.

- [ ] **Step 9: Commit the toolchain foundation**

Run:

```bash
git add .gitignore package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts public/manifest.json tests/manifest.test.mjs
git commit -m "chore: initialize extension toolchain"
```

---

### Task 2: Add shadcn/ui and the React popup/workspace pages

**Files:**
- Create: `components.json` through shadcn CLI
- Create: `src/components/ui/button.tsx` through shadcn CLI
- Create: `src/lib/utils.ts` through shadcn CLI
- Create: `src/index.css`
- Create: `popup.html`
- Create: `workspace.html`
- Create: `src/popup/Popup.tsx`
- Create: `src/popup/main.tsx`
- Create: `src/workspace/App.tsx`
- Create: `src/workspace/main.tsx`
- Create: `src/providers/.gitkeep`
- Create: `src/services/.gitkeep`
- Create: `src/storage/.gitkeep`
- Create: `src/scheduler/.gitkeep`
- Create: `src/workers/.gitkeep`
- Create: `src/types/.gitkeep`
- Create: `src/shared/.gitkeep`
- Create: `tests/ui-source.test.mjs`
- Modify: `package.json` and `package-lock.json` through shadcn CLI

**Interfaces:**
- Consumes: the `@/*` alias and Tailwind Vite plugin from Task 1.
- Produces: `Popup`, `App`, and the popup `OPEN_WORKSPACE` runtime message consumed by the service worker in Task 3.

- [ ] **Step 1: Write the failing UI source test**

Create `tests/ui-source.test.mjs`:

```js
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("popup exposes only the requested initial actions", async () => {
  const popup = await source("src/popup/Popup.tsx")

  assert.match(popup, />pdf2imgvi</)
  assert.match(popup, />Open Translator</)
  assert.match(popup, />Settings</)
  assert.match(popup, /OPEN_WORKSPACE/)
  assert.match(popup, /@\/components\/ui\/button/)
})

test("workspace exposes the requested placeholder UI", async () => {
  const workspace = await source("src/workspace/App.tsx")

  assert.match(workspace, />pdf2imgvi</)
  assert.match(workspace, />Translate PDFs to Vietnamese</)
  assert.match(workspace, />Choose PDF</)
  assert.match(workspace, /@\/components\/ui\/button/)
  assert.doesNotMatch(workspace, /type=["']file["']/)
})
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
node --test tests/ui-source.test.mjs
```

Expected: FAIL with `ENOENT` for `src/popup/Popup.tsx`.

- [ ] **Step 3: Create the Tailwind entry stylesheet**

Create `src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Initialize shadcn/ui and add only Button**

Run:

```bash
npx shadcn@latest init -y --base radix
npx shadcn@latest add button -y
```

Expected: the CLI creates `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, updates `src/index.css`, and installs only dependencies needed by the selected shadcn base and Button.

- [ ] **Step 5: Extend the shared stylesheet with the minimal extension layout**

Keep the shadcn imports and theme variables produced by the CLI in `src/index.css`, then append:

```css
body {
  margin: 0;
  min-width: 320px;
}

button {
  cursor: pointer;
}
```

- [ ] **Step 6: Add the two HTML entry pages**

Create `popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>pdf2imgvi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/popup/main.tsx"></script>
  </body>
</html>
```

Create `workspace.html` with the same document structure and title, replacing the script path with `/src/workspace/main.tsx`.

- [ ] **Step 7: Implement the minimal popup**

Create `src/popup/Popup.tsx`:

```tsx
import { Button } from "@/components/ui/button"

type OpenWorkspaceMessage = {
  type: "OPEN_WORKSPACE"
}

export function Popup() {
  const openTranslator = () => {
    const message = { type: "OPEN_WORKSPACE" } satisfies OpenWorkspaceMessage
    void chrome.runtime.sendMessage(message).catch(console.error)
  }

  return (
    <main className="flex w-80 flex-col gap-4 p-5">
      <h1 className="text-xl font-semibold">pdf2imgvi</h1>
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={openTranslator}>
          Open Translator
        </Button>
        <Button type="button" variant="outline">
          Settings
        </Button>
      </div>
    </main>
  )
}
```

Create `src/popup/main.tsx`:

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Popup } from "./Popup"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
```

- [ ] **Step 8: Implement the minimal workspace**

Create `src/workspace/App.tsx`:

```tsx
import { Button } from "@/components/ui/button"

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">pdf2imgvi</h1>
      <p className="text-muted-foreground">Translate PDFs to Vietnamese</p>
      <Button type="button">Choose PDF</Button>
    </main>
  )
}
```

Create `src/workspace/main.tsx`:

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Add the requested empty module directories**

Create empty `.gitkeep` files in:

```text
src/providers/
src/services/
src/storage/
src/scheduler/
src/workers/
src/types/
src/shared/
```

- [ ] **Step 10: Run UI tests and type checking**

Run:

```bash
npm test -- tests/ui-source.test.mjs
npm run typecheck
```

Expected: two UI tests pass and TypeScript exits zero.

- [ ] **Step 11: Commit the two shadcn React pages**

Run:

```bash
git add components.json package.json package-lock.json popup.html workspace.html src tests/ui-source.test.mjs
git commit -m "feat: add popup and workspace shells"
```

---

### Task 3: Implement and test workspace tab opening

**Files:**
- Create: `src/background/service-worker.ts`
- Create: `tests/service-worker.test.mjs`

**Interfaces:**
- Consumes: runtime messages shaped as `{ type: "OPEN_WORKSPACE" }` from `Popup`.
- Produces: one `chrome.tabs.create({ url: chrome.runtime.getURL("workspace.html") })` call for the recognized message and no action for other messages.

- [ ] **Step 1: Write the failing service-worker behavior tests**

Create `tests/service-worker.test.mjs`:

```js
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"

async function loadWorker() {
  const source = await readFile(
    new URL("../src/background/service-worker.ts", import.meta.url),
    "utf8",
  )
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const opened = []
  let listener
  const errors = []
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (value) => { listener = value } },
    },
    tabs: {
      create: async (options) => {
        opened.push(options)
        return {}
      },
    },
  }

  vm.runInNewContext(javascript, {
    chrome,
    console: { error: (error) => errors.push(error) },
  })
  assert.equal(typeof listener, "function")
  return { listener, opened, errors, chrome }
}

test("OPEN_WORKSPACE opens the extension workspace in a new tab", async () => {
  const { listener, opened } = await loadWorker()

  listener({ type: "OPEN_WORKSPACE" })
  await new Promise(setImmediate)

  assert.equal(opened.length, 1)
  assert.equal(opened[0].url, "chrome-extension://test/workspace.html")
})

test("unrelated messages do not open tabs", async () => {
  const { listener, opened } = await loadWorker()

  for (const message of [{ type: "OTHER_MESSAGE" }, null, "OPEN_WORKSPACE"]) {
    listener(message)
  }
  await new Promise(setImmediate)

  assert.deepEqual(opened, [])
})
```

- [ ] **Step 2: Run the worker tests and verify RED**

Run:

```bash
node --test tests/service-worker.test.mjs
```

Expected: both tests FAIL with `ENOENT` for `src/background/service-worker.ts`.

- [ ] **Step 3: Implement the service worker**

Create `src/background/service-worker.ts`:

```ts
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "OPEN_WORKSPACE"
  ) {
    return
  }

  void chrome.tabs
    .create({ url: chrome.runtime.getURL("workspace.html") })
    .catch(console.error)
})
```

- [ ] **Step 4: Run the worker tests and verify GREEN**

Run:

```bash
npm test -- tests/service-worker.test.mjs
npm run typecheck
```

Expected: both worker tests pass and TypeScript exits zero.

- [ ] **Step 5: Commit workspace opening behavior**

Run:

```bash
git add src/background/service-worker.ts tests/service-worker.test.mjs
git commit -m "feat: open workspace from popup"
```

---

### Task 4: Add raster icons and verify the unpacked build

**Files:**
- Create: `public/icons/icon-source.svg`
- Create: `public/icons/icon-16.png`
- Create: `public/icons/icon-32.png`
- Create: `public/icons/icon-48.png`
- Create: `public/icons/icon-128.png`
- Create: `tests/build.test.mjs`

**Interfaces:**
- Consumes: Vite inputs from Task 1, pages from Task 2, worker from Task 3, and icon paths from the manifest.
- Produces: a verified `dist/` directory suitable for Chrome's **Load unpacked** action.

- [ ] **Step 1: Write the failing unpacked-build test**

Create `tests/build.test.mjs`:

```js
import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
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
})

test("declared PNG icons have their advertised dimensions", async () => {
  for (const size of [16, 32, 48, 128]) {
    const png = await readFile(dist(`icons/icon-${size}.png`))
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})
```

- [ ] **Step 2: Run the build test and verify RED**

Run:

```bash
node --test tests/build.test.mjs
```

Expected: FAIL with `ENOENT` because `dist/` does not exist.

- [ ] **Step 3: Create one simple source icon**

Create `public/icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#18181b"/>
  <path d="M38 24h38l18 18v62H38z" fill="#fff"/>
  <path d="M76 24v20h18" fill="#d4d4d8"/>
  <path d="M52 61h28M52 74h28M52 87h18" stroke="#18181b" stroke-width="6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Generate the required PNG sizes**

Run with the available ImageMagick binary:

```bash
convert -background none public/icons/icon-source.svg -resize 16x16 public/icons/icon-16.png
convert -background none public/icons/icon-source.svg -resize 32x32 public/icons/icon-32.png
convert -background none public/icons/icon-source.svg -resize 48x48 public/icons/icon-48.png
convert -background none public/icons/icon-source.svg -resize 128x128 public/icons/icon-128.png
```

Expected: four square PNG files whose dimensions match their filenames. The SVG remains a design source only and is not referenced by the manifest.

- [ ] **Step 5: Build and run the full test suite**

Run:

```bash
npm run build
npm test
```

Expected: TypeScript and Vite exit zero; all manifest, UI, worker, and build tests pass.

- [ ] **Step 6: Inspect the unpacked extension output**

Run:

```bash
find dist -maxdepth 3 -type f | sort
```

Expected output includes `dist/manifest.json`, `dist/popup.html`, `dist/workspace.html`, `dist/service-worker.js`, all four icons, and hashed files under `dist/assets/`.

- [ ] **Step 7: Smoke-test the development command**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local development URL without startup errors. Stop the server after confirming startup.

- [ ] **Step 8: Perform the Chrome manual check**

In `chrome://extensions` with Developer mode enabled, choose **Load unpacked** and select the absolute `dist/` directory. Confirm:

1. the generated icon appears;
2. the popup renders `pdf2imgvi`, `Open Translator`, and `Settings`;
3. `Open Translator` opens one new extension tab;
4. the workspace renders `pdf2imgvi`, `Translate PDFs to Vietnamese`, and `Choose PDF`;
5. Chrome reports no manifest or service-worker errors.

- [ ] **Step 9: Commit the verified skeleton**

Run:

```bash
git add public/icons tests/build.test.mjs
git commit -m "test: verify unpacked extension build"
```

---

## Final Verification

Run fresh from the repository root:

```bash
npm install
npm run build
npm test
git status --short
```

Expected:

- all commands exit zero;
- the full test suite has zero failures;
- `dist/` is loadable as an unpacked Chrome extension;
- `git status --short` is empty because generated `dist/` and `node_modules/` are ignored;
- no excluded business logic or extra application dependency was added.
