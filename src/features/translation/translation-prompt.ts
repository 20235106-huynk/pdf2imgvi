import { SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from "../settings/settings.ts"

const LANGUAGE_OPTIONS = [...SOURCE_LANGUAGE_OPTIONS, ...TARGET_LANGUAGE_OPTIONS]

// Edit this temporary instruction to change how Gemini translates each page.
export function translationPrompt(sourceLanguage: string, targetLanguage: string): string {
  const source = LANGUAGE_OPTIONS.find(({ value }) => value === sourceLanguage)?.label ?? sourceLanguage
  const target = LANGUAGE_OPTIONS.find(({ value }) => value === targetLanguage)?.label ?? targetLanguage
  return `Render the original image with all visible paragraphs in ${source} translated into ${target}. Keep the layout, visual style, colors, text placement, images, tables, diagrams, and formulas unchanged. Do not translate field-specific terms, proper names, abbreviations, source code, symbols, or units. Output only the translated image.`
}
