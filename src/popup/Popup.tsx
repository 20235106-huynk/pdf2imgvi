import { Button } from "@/components/ui/button"

type OpenWorkspaceMessage = {
  type: "OPEN_WORKSPACE"
}

export function Popup() {
  const openTranslator = () => {
    const message = { type: "OPEN_WORKSPACE" } satisfies OpenWorkspaceMessage
    void chrome.runtime.sendMessage(message).catch(console.error)
  }

  return (
    <main className="flex w-80 flex-col gap-4 p-5">
      <h1 className="text-xl font-semibold">pdf2imgvi</h1>
      <Button type="button" onClick={openTranslator}>
        Open Translator
      </Button>
    </main>
  )
}
