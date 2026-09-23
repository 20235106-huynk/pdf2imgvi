import { useState } from "react"

import { Button } from "@/components/ui/button"
import { SettingsPage } from "@/settings/SettingsPage"

export function App() {
  const [view, setView] = useState<"translator" | "settings">("translator")

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-lg font-semibold">pdf2imgvi</span>
          <nav className="flex gap-2" aria-label="Workspace navigation">
            <Button
              type="button"
              variant={view === "translator" ? "default" : "ghost"}
              aria-current={view === "translator" ? "page" : undefined}
              onClick={() => setView("translator")}
            >
              Translator
            </Button>
            <Button
              type="button"
              variant={view === "settings" ? "default" : "ghost"}
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => setView("settings")}
            >
              Settings
            </Button>
          </nav>
        </div>
      </header>

      {view === "settings" ? (
        <SettingsPage />
      ) : (
        <main className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-3xl font-semibold">pdf2imgvi</h1>
          <p className="text-muted-foreground">Translate PDFs to Vietnamese</p>
          <Button type="button">Choose PDF</Button>
        </main>
      )}
    </div>
  )
}
