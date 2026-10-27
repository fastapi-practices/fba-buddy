export async function openExternal(url: string): Promise<void> {
  try {
    if (window.buddyDesktop) {
      await window.buddyDesktop.openExternal(url)
      return
    }
    const opened = window.open(url, "_blank")
    if (!opened) throw new Error("oauth.browserFailed")
    opened.opener = null
  } catch {
    throw new Error("oauth.browserFailed")
  }
}
