chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "OPEN_WORKSPACE"
  ) {
    return
  }

  void chrome.tabs
    .create({ url: chrome.runtime.getURL("workspace.html") })
    .catch(console.error)
})
