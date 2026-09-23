import Dexie, { type Table } from "dexie"

export interface CompletedPage {
  jobId: string
  fileName: string
  pageNumber: number
  image: Blob
}

class ResultsDatabase extends Dexie {
  pages!: Table<CompletedPage, [string, number]>

  constructor() {
    super("pdf2imgvi-results")
    this.version(1).stores({ pages: "[jobId+pageNumber],jobId" })
  }
}

const database = new ResultsDatabase()

export async function saveCompletedPage(
  jobId: string,
  fileName: string,
  pageNumber: number,
  image: Blob,
): Promise<void> {
  await database.pages.put({ jobId, fileName, pageNumber, image })
}

export async function listCompletedPages(): Promise<CompletedPage[]> {
  return database.pages.toArray()
}

export async function removeResults(jobId: string): Promise<void> {
  await database.pages.where("jobId").equals(jobId).delete()
}
