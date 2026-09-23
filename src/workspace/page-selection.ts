function parsePageSelection(input: string, totalPages: number): number[] | null {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) return null

  const pages = new Set<number>()
  for (const part of input.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if (!match) return null
    const first = Number(match[1])
    const last = match[2] === undefined ? first : Number(match[2])
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)
      || first < 1 || last < first || last > totalPages) return null
    for (let page = first; page <= last; page += 1) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}

export function parsePageRange(input: string, totalPages: number): number[] {
  const pages = parsePageSelection(input, totalPages)
  if (!pages) throw new Error(`Invalid page range. Use pages from 1 to ${totalPages}.`)
  return pages
}
