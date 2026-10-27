export type ResearchSource = {
  url: string
  title: string
  domain: string
  snippet?: string
  image?: string
  favicon?: string
  siteName?: string
}

export const RESEARCH_TOOL_NAMES = new Set([
  "web_search",
  "duckduckgo_search",
  "tavily_search",
  "exa_search",
  "exa_find_similar",
  "exa_get_contents",
  "exa_answer",
])

function previewAsset(value: unknown, base: URL) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    return undefined
  try {
    const url = new URL(value, base)
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function researchSources(value: unknown): ResearchSource[] {
  const sources = new Map<string, ResearchSource>()
  const visit = (input: unknown, depth: number) => {
    if (depth > 5 || sources.size >= 100) return
    if (typeof input === "string") {
      try {
        visit(JSON.parse(input), depth + 1)
      } catch {
        /* 非结构化正文不推测引用 */
      }
      return
    }
    if (Array.isArray(input)) {
      input.slice(0, 100).forEach((item) => visit(item, depth + 1))
      return
    }
    if (!input || typeof input !== "object") return
    const item = input as Record<string, unknown>
    const rawUrl = item.url ?? item.href ?? item.link ?? item.uri
    if (typeof rawUrl === "string" && rawUrl.length <= 4096) {
      try {
        const url = new URL(rawUrl)
        if (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password
        ) {
          const title = item.title ?? item.name ?? item.headline
          const snippet =
            item.snippet ??
            item.body ??
            item.text ??
            item.content ??
            item.description
          const image = previewAsset(item.image, url)
          const favicon = previewAsset(item.favicon, url)
          const siteName = item.siteName ?? item.site_name
          sources.set(url.href, {
            url: url.href,
            domain: url.hostname.replace(/^www\./, ""),
            title:
              typeof title === "string" && title.trim()
                ? title.slice(0, 512)
                : url.hostname,
            ...(typeof snippet === "string" && snippet.trim()
              ? { snippet: snippet.slice(0, 500) }
              : {}),
            ...(image ? { image } : {}),
            ...(favicon ? { favicon } : {}),
            ...(typeof siteName === "string" && siteName.trim()
              ? { siteName: siteName.slice(0, 100) }
              : {}),
          })
        }
      } catch {
        /* 忽略无效或危险链接 */
      }
    }
    for (const key of ["results", "items", "sources", "data", "citations"])
      visit(item[key], depth + 1)
  }
  visit(value, 0)
  return [...sources.values()]
}
