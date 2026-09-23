import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { SettingsPage } from "@/settings/SettingsPage"
import { PdfPreview } from "./PdfPreview"

export function App() {
  const [view, setView] = useState<"translator" | "settings">("translator")
  const [translationRunning, setTranslationRunning] = useState(false)

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

      <div hidden={view !== "translator"}>
        <PdfPreview
          onTranslationRunningChange={setTranslationRunning}
          onNavigateSettings={() => setView("settings")}
        />
      </div>
      {view === "settings" && <SettingsPage translationRunning={translationRunning} />}
    </div>
  )
}
