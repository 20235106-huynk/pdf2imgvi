# pdf2imgvi Settings Design

## Goal

Add a Settings view inside the existing workspace. The feature provides editable settings, local persistence, and separate API-key storage without implementing translation or PDF behavior.

## Navigation

The popup contains only **Open Translator**. The workspace header provides **Translator** and **Settings** controls and switches views with local React state. No router, separate settings HTML entry, manifest options page, or service-worker message is added.

The Translator view keeps the existing placeholder content. The Settings view occupies the workspace content area and remains usable on normal extension-page widths.

## Data Model

Create `src/types/settings.ts` with:

- `ApiKeyStorageMode`: `"local" | "session"`;
- `OutputQuality`: `"standard" | "high" | "very-high"`;
- `AppSettings` containing `providerId`, `modelId`, source and target languages, quality, concurrency, retry fields, output filename template, and API-key storage mode;
- option arrays for models, source languages, target languages, and quality;
- `MIN_CONCURRENCY = 1`, `MAX_CONCURRENCY = 20`, and `DEFAULT_CONCURRENCY = 10`;
- one `DEFAULT_SETTINGS` object.

Defaults are:

```ts
{
  providerId: "gemini",
  modelId: "nano-banana-lite-2",
  sourceLanguage: "en",
  targetLanguage: "vi",
  quality: "standard",
  concurrency: 10,
  autoRetry: true,
  maxRetries: 3,
  outputFilenameTemplate: "{original}_vi.pdf",
  apiKeyStorageMode: "local",
}
```

The API key is never part of `AppSettings`.

## Validation

Create one normalizer for settings loaded from storage or submitted by the UI. It:

- merges missing values with `DEFAULT_SETTINGS`;
- accepts only known model, language, quality, and storage-mode values;
- clamps concurrency to `MIN_CONCURRENCY..MAX_CONCURRENCY`;
- converts negative or invalid retry counts to the default;
- replaces an empty filename template with the default.

API keys are trimmed before storage. No provider-specific API-key format is enforced.

## Storage

`src/storage/settings.storage.ts` owns the `appSettings` key in `chrome.storage.local` and exports:

```ts
getSettings(): Promise<AppSettings>
saveSettings(settings: AppSettings): Promise<void>
resetSettings(): Promise<void>
```

`getSettings` returns normalized defaults when no saved value exists. `saveSettings` normalizes before writing. `resetSettings` removes the saved key, so the next read returns defaults.

`src/storage/api-key.storage.ts` owns the `apiKey` key and exports:

```ts
getApiKey(): Promise<string | null>
saveApiKey(apiKey: string, mode: ApiKeyStorageMode): Promise<void>
removeApiKey(): Promise<void>
```

`getApiKey` checks session storage first, then local storage. `saveApiKey` trims the value, writes it to the selected storage area, and removes it from the other area. An empty value removes both copies. Writing the new copy before deleting the old one avoids losing a valid key if the write fails. `removeApiKey` removes both copies. No API-key value is logged.

## Settings UI

The Settings view contains:

- Translate Engine: model selector, masked API-key field with Show/Hide, and local/session storage radio controls.
- Translation Settings: source and target language selectors.
- Output Quality: standard, high, and very-high radio controls.
- Performance: decrement/increment concurrency controls using the shared constants.
- Retry: auto-retry checkbox and non-negative maximum-retries number input, disabled when auto-retry is off.
- Output: required filename-template input.
- Local Storage: explanatory copy and **Clear Translation Cache** placeholder. The handler contains a clear TODO and performs no cache operation because no cache repository exists.
- Privacy: informational text only.
- Advanced Settings: native collapsed `<details>` containing disabled placeholders for model, custom prompt, render resolution, and request timeout.
- Footer actions: **Reset to Defaults** and **Save Changes**.

Use the existing shadcn `Button` and styled native form elements. Do not add dependencies or copy unused shadcn components.

## UI State and Save Flow

When the Settings view first mounts, load settings and API key concurrently. Keep edits in component state; do not write on every field change.

**Reset to Defaults** replaces the draft settings with `DEFAULT_SETTINGS` but keeps the loaded API-key value. Saving afterward migrates that key to the default local storage mode.

**Save Changes**:

1. normalizes the draft settings;
2. saves ordinary settings through `settings.storage.ts`;
3. saves, migrates, or removes the trimmed API key through `api-key.storage.ts`;
4. updates the draft with normalized values;
5. displays `Settings saved`.

While loading or saving, disable relevant actions. Storage failures show a short error message without including the API key.

## Testing

Use the existing Node test runner without adding a framework.

- Test defaults and normalization boundaries.
- Test settings load/save/reset using a small in-memory `chrome.storage` fake.
- Test API-key local/session storage, migration, trimming, and removal.
- Extend the build test to require the Settings UI copy in emitted assets.
- Run the complete test suite, TypeScript check, and production build.

Manual extension verification covers opening the workspace, switching to Settings, saving/reloading values, API-key Show/Hide and storage modes, reset behavior, and confirming the existing Translator view still renders.

## Out of Scope

Do not add translation API calls, Gemini requests, PDF parsing/rendering/export, IndexedDB cache behavior, scheduler, queue, retry engine, Web Worker, OCR, backend, authentication, billing, or provider-specific key validation.
