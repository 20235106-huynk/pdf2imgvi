import { normalizeSettings, type AppSettings } from "./settings.ts"

const SETTINGS_KEY = "appSettings"

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  return normalizeSettings(result[SETTINGS_KEY])
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) })
}

export async function resetSettings(): Promise<void> {
  await chrome.storage.local.remove(SETTINGS_KEY)
}
