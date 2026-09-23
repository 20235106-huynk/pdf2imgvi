// Edit this temporary instruction to change how Gemini translates each page.
export function translationPrompt(sourceLanguage: string, targetLanguage: string): string {
  return `Translate all text in the image from ${sourceLanguage} to ${targetLanguage}. Keep the original layout, use appropriate fonts and font sizes, and do not translate technical .`
}
