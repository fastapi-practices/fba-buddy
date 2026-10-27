import { watch } from "node:fs"
import path from "node:path"

export function isDesktopSource(filePath) {
  const normalized = filePath.replaceAll("\\", "/")
  if (!/^(electron|src\/shared)\//.test(normalized)) return false
  if (
    normalized
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          ["dist", "node_modules", "__tests__", "__mocks__"].includes(part)
      )
  )
    return false
  return (
    /\.(?:[cm]?[jt]sx?|json|m)$/.test(normalized) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  )
}

export function watchDesktopSources({ root, onChange, onError }) {
  const watchers = []
  try {
    for (const directory of ["electron", "src/shared"]) {
      const watcher = watch(
        path.join(root, directory),
        { recursive: true },
        (_event, filename) => {
          if (filename && isDesktopSource(`${directory}/${filename}`))
            onChange()
        }
      )
      watcher.on("error", onError)
      watchers.push(watcher)
    }
  } catch (error) {
    for (const watcher of watchers) watcher.close()
    throw error
  }
  return () => {
    for (const watcher of watchers) watcher.close()
  }
}

export function createDesktopRebuilder({
  build,
  restart,
  onError,
  debounceMs = 200,
}) {
  let timer = null
  let running = null
  let queued = false
  let revision = 0
  let disposed = false

  async function flush() {
    if (disposed || running || !queued || timer) return
    queued = false
    const builtRevision = revision
    running = (async () => {
      try {
        await build()
        if (!disposed && builtRevision === revision) await restart()
      } catch (error) {
        if (!disposed) onError(error)
      }
    })()
    await running
    running = null
    if (queued && !timer) void flush()
  }

  return {
    request() {
      if (disposed) return
      revision += 1
      queued = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, debounceMs)
    },
    async dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      await running
    },
  }
}
