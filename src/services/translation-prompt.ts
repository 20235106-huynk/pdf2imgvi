// Edit this temporary instruction to change how Gemini translates each page.
export function translationPrompt(sourceLanguage: string, targetLanguage: string): string {
  return `Translate text in this PDF page image from ${sourceLanguage} to ${targetLanguage}. Return the complete translated page image.`
}
