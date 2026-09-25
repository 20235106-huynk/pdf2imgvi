export const MAX_PREVIEW_PIXELS = 8_000_000

export function getPreviewScales(width: number, height: number, devicePixelRatio: number) {
  const pageWidth = Math.max(1, width)
  const pageHeight = Math.max(1, height)
  const cssScale = Math.min(2, 900 / pageWidth)
  const pixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.min(2, Math.max(1, devicePixelRatio))
    : 1
  const renderScale = Math.min(
    cssScale * pixelRatio,
    Math.sqrt(MAX_PREVIEW_PIXELS / (pageWidth * pageHeight)),
  )
  return { cssScale, renderScale }
}
