import { Button } from "@/components/ui/button"

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">pdf2imgvi</h1>
      <p className="text-muted-foreground">Translate PDFs to Vietnamese</p>
      <Button type="button">Choose PDF</Button>
    </main>
  )
}
