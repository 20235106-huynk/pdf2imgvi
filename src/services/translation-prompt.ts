import { SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from "../types/settings.ts"

const LANGUAGE_OPTIONS = [...SOURCE_LANGUAGE_OPTIONS, ...TARGET_LANGUAGE_OPTIONS]

// Edit this temporary instruction to change how Gemini translates each page.
export function translationPrompt(sourceLanguage: string, targetLanguage: string): string {
  const source = LANGUAGE_OPTIONS.find(({ value }) => value === sourceLanguage)?.label ?? sourceLanguage
  const target = LANGUAGE_OPTIONS.find(({ value }) => value === targetLanguage)?.label ?? targetLanguage
  return `Translate all ${source} text to ${target}. Preserve the original layout, style, colors, text positions, images, tables, diagrams, formulas, and aspect ratio. Keep technical terms, proper nouns, abbreviations, code, symbols, and units unchanged. Fit translations within the original text areas. Output only the translated image.`
}
