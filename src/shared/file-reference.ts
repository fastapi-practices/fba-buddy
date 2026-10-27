export type FileReference = { path: string; line?: number; column?: number }

const extensionless =
  /^(?:makefile|dockerfile|containerfile|justfile|rakefile|gemfile|procfile|brewfile|caddyfile|vagrantfile|jenkinsfile|podfile|build|workspace|licen[cs]e|readme|changelog|codeowners)$/i
const webDomain = /\.(?:com|org|net|io|cn|dev|app|ai|edu|gov)(?:\/|$)/i

export function parseFileReference(value?: string): FileReference | null {
  if (!value) return null
  let path = value.trim().replace(/^<([\s\S]*)>$/, "$1")
  if (!path || /[\0\r\n]/.test(path)) return null
  if (
    /^(?:https?|data|javascript|mailto|blob|fba-citation|fba-thread|t3-thread):/i.test(
      path
    ) ||
    path.startsWith("#")
  )
    return null
  try {
    if (/^file:/i.test(path)) {
      const url = new URL(path)
      if (url.username || url.password || url.port || url.search) return null
      path = `${url.hostname && url.hostname !== "localhost" ? `//${url.hostname}` : ""}${decodeURIComponent(url.pathname)}${url.hash}`
      path = path.replace(/^\/([A-Za-z]:\/)/, "$1")
    } else path = decodeURIComponent(path)
  } catch {
    return null
  }
  const position =
    /(?:#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?|:(\d+)(?::(\d+))?(?:-\d+)?)$/.exec(
      path
    )
  if (position) path = path.slice(0, position.index)
  const absolute = /^(?:[A-Za-z]:[\\/]|[\\/])/.test(path)
  if (!absolute && /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) return null
  if (!absolute && webDomain.test(path)) return null
  const name = path.split(/[\\/]/).at(-1) ?? ""
  if (!name || /[?#]/.test(path)) return null
  if (
    !absolute &&
    !/[\\/]/.test(path) &&
    !position &&
    !extensionless.test(name) &&
    !/^[^.].*\.[A-Za-z\d_-]{1,16}$/.test(name) &&
    !/^\.[\w.-]+$/.test(name)
  )
    return null
  const line = Number(position?.[1] ?? position?.[3])
  const column = Number(position?.[2] ?? position?.[4])
  return {
    path,
    ...(Number.isSafeInteger(line) && line > 0 ? { line } : {}),
    ...(Number.isSafeInteger(column) && column > 0 ? { column } : {}),
  }
}

export function resolveReferencePath(path: string, baseDir?: string) {
  if (!baseDir || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(path)) return path
  return `${baseDir.replace(/[\\/]+$/, "")}/${path}`
}

export function fileMimeType(path: string) {
  const extension =
    path.split(/[?#]/)[0]!.split(".").at(-1)?.toLowerCase() ?? ""
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        avif: "image/avif",
        bmp: "image/bmp",
        ico: "image/x-icon",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        m4v: "video/mp4",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        m4a: "audio/mp4",
        flac: "audio/flac",
        pdf: "application/pdf",
        html: "text/html",
        htm: "text/html",
        md: "text/markdown",
        markdown: "text/markdown",
        csv: "text/csv",
        tsv: "text/tab-separated-values",
      } as Record<string, string>
    )[extension] ?? "text/plain"
  )
}

export function mediaKind(value: string): "image" | "video" | "audio" | null {
  const mime = fileMimeType(value)
  return mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : null
}
