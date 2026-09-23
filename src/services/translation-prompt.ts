import { SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from "../types/settings.ts"

const LANGUAGE_OPTIONS = [...SOURCE_LANGUAGE_OPTIONS, ...TARGET_LANGUAGE_OPTIONS]

// Edit this temporary instruction to change how Gemini translates each page.
export function translationPrompt(sourceLanguage: string, targetLanguage: string): string {
  const source = LANGUAGE_OPTIONS.find(({ value }) => value === sourceLanguage)?.label ?? sourceLanguage
  const target = LANGUAGE_OPTIONS.find(({ value }) => value === targetLanguage)?.label ?? targetLanguage
  return `Render an updated image of the original image with all visible ${source} text translated into ${target}. Preserve the original layout, style, colors, text positions, images, tables, diagrams and formulas. Keep specialized vocabulary, proper nouns, abbreviations, code, symbols, and units unchanged. Output only the translated image.`
}
