chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (typeof message !== "object" || message === null || !("type" in message)) return
  if (message.type === "OPEN_WORKSPACE") {
    void chrome.tabs
      .create({ url: chrome.runtime.getURL("workspace.html") })
      .catch(console.error)
  } else if (message.type === "REGISTER_WORKSPACE") {
    sendResponse({ tabId: sender.tab?.id ?? null })
  }
})
