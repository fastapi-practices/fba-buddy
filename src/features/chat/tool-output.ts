export function toolOutputImages(
  value: string
): { src: string; alt: string }[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  const images = new Map<string, { src: string; alt: string }>()
  const visit = (input: unknown, depth: number) => {
    if (depth > 5 || !input || typeof input !== "object") return
    if (Array.isArray(input)) {
      input.forEach((entry) => visit(entry, depth + 1))
      return
    }
    const item = input as Record<string, unknown>
    if (item.type === "image") {
      const source = item.source as Record<string, unknown> | undefined
      const url =
        typeof item.image_url === "string"
          ? item.image_url
          : (item.image_url as { url?: string } | undefined)?.url
      const direct =
        typeof item.image === "string"
          ? item.image
          : (url ??
            (source?.type === "url" ? (source.url ?? source.value) : undefined))
      const mime =
        source?.media_type ??
        source?.mimeType ??
        item.mimeType ??
        item.mime_type
      const data =
        source?.type === "base64" || source?.type === "data"
          ? (source.data ?? source.value)
          : item.data
      const src =
        typeof direct === "string"
          ? direct
          : typeof data === "string" &&
              typeof mime === "string" &&
              mime.startsWith("image/")
            ? `data:${mime};base64,${data}`
            : ""
      if (/^(https?:|data:image\/|blob:)/.test(src))
        images.set(src, {
          src,
          alt: typeof item.alt === "string" ? item.alt : "",
        })
    }
    for (const key of ["content", "images", "result", "data"])
      visit(item[key], depth + 1)
  }
  visit(parsed, 0)
  return Array.from(images.values())
}
