# pdf2imgvi Chrome Extension Skeleton Design

## Goal

Create the initial `pdf2imgvi` Chrome Extension project. It must build into a Manifest V3 extension that Chrome can load unpacked, while deliberately omitting PDF and translation business logic.

## Scope

The project uses React, TypeScript strict mode, Vite, shadcn/ui, and Chrome Extension Manifest V3. It includes:

- a popup page;
- a full-tab workspace page;
- a background service worker that opens the workspace;
- the requested empty source directories;
- extension icons;
- production and development scripts;
- installed future-use dependencies: `pdfjs-dist`, `pdf-lib`, and `dexie`.

It does not implement PDF parsing, rendering, translation, API integration, credentials, IndexedDB behavior, scheduling, queues, retries, pause/resume, exporting, web workers, a backend, or authentication.

## Naming

Use the exact lowercase name `pdf2imgvi` for the npm package, extension name, HTML titles, and visible application headings.

## Architecture

Vite builds three independent entries:

- `popup.html` loads `src/popup/main.tsx` and renders `Popup.tsx`.
- `workspace.html` loads `src/workspace/main.tsx` and renders `App.tsx`.
- `src/background/service-worker.ts` builds as the Manifest V3 background service worker.

The Vite configuration uses explicit Rollup inputs. Static files in `public/`, including `manifest.json` and icons, are copied to `dist/`. No Chrome-extension-specific build plugin is added.

## User Interface

The popup displays:

```text
pdf2imgvi

[ Open Translator ]
[ Settings ]
```

`Open Translator` sends a typed runtime message. The service worker handles that message and opens `workspace.html` in a new tab with `chrome.tabs.create` and `chrome.runtime.getURL`. `Settings` has no behavior because settings are outside the current scope.

The workspace displays:

```text
pdf2imgvi

Translate PDFs to Vietnamese

[ Choose PDF ]
```

`Choose PDF` has no behavior because file processing is outside the current scope.

The UI uses the shadcn/ui `Button` component and a shared Tailwind stylesheet. Only the components required by these screens are included.

## Manifest and Permissions

The manifest uses version 3 and declares only these permissions:

- `storage`
- `downloads`

It has no host permissions and does not declare `<all_urls>`. The action points to `popup.html`, and the background entry points to the built service worker.

## Dependencies

Runtime dependencies are React, React DOM, `pdfjs-dist`, `pdf-lib`, `dexie`, and the small packages required by the generated shadcn `Button` implementation. Development dependencies are TypeScript, Vite, the React Vite plugin, Chrome/React/Node type declarations, Tailwind CSS, and its Vite plugin.

No test framework, extension build framework, state library, router, or backend dependency is added.

## Error Handling

Failure to send the open-workspace message is logged with `console.error`. The service worker does not retry or queue requests. Buttons whose behavior is out of scope remain inert.

## Verification

- Run TypeScript checking as part of `npm run build`.
- Run the Vite production build and require exit code zero.
- Inspect `dist/` for the manifest, popup page, workspace page, service worker, bundled assets, and icons.
- Validate the built manifest fields and permissions with a small Node standard-library check, without adding a test framework.
- Load `dist/` unpacked in Chrome and manually confirm the icon, popup rendering, workspace rendering, and new-tab behavior.

## Development Workflow

`npm run dev` starts Vite for page-level UI development. `npm run build` creates the complete unpacked extension in `dist/`. Chrome should load the `dist/` directory, not the source root.
