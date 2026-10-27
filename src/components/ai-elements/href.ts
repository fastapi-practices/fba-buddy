const relativeHref = /^(?:[/?#]|\.{1,2}\/)/
const allowedProtocols = new Set(["http:", "https:", "mailto:"])

export function safeHref(value: string | undefined): string | undefined {
  const href = value?.trim()
  if (!href) return undefined
  try {
    const url = new URL(href)
    return allowedProtocols.has(url.protocol) && !url.username && !url.password
      ? href
      : undefined
  } catch {
    return relativeHref.test(href) ? href : undefined
  }
}
