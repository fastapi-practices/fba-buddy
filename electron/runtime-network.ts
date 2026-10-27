import { net } from "electron"

function responseHeaders(raw: Record<string, string | string[]>) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value])
      headers.append(name, item)
  }
  return headers
}

export const runtimeDownloadFetch: typeof globalThis.fetch = async (
  input,
  options = {}
) => {
  if (typeof input !== "string" && !(input instanceof URL))
    throw new Error("Runtime download requires a URL")
  const url = new URL(String(input))
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Runtime download requires HTTPS")
  if (options.method && options.method !== "GET")
    throw new Error("Runtime downloads only support GET")
  options.signal?.throwIfAborted()
  const request = net.request({
    url: url.href,
    method: "GET",
    redirect: "manual",
    useSessionCookies: false,
  })
  for (const [name, value] of new Headers(options.headers))
    request.setHeader(name, value)
  return new Promise<Response>((resolve, reject) => {
    let finished = false
    let failBody: (error: Error) => void = () => {}
    const cleanup = () => options.signal?.removeEventListener("abort", abort)
    const fail = (error: Error) => {
      if (finished) return
      finished = true
      cleanup()
      failBody(error)
      reject(error)
    }
    const abort = () => {
      fail(new Error("Runtime download cancelled"))
      request.abort()
    }
    options.signal?.addEventListener("abort", abort, { once: true })
    request.on("error", fail)
    // 请求流关闭可以早于响应到达，下载完成以响应 end 为准
    request.on("abort", () => fail(new Error("Runtime download interrupted")))
    request.on("redirect", (status, _method, destination, rawHeaders) => {
      if (finished) return
      try {
        const headers = responseHeaders(rawHeaders)
        headers.set("location", destination)
        resolve(new Response(null, { status, headers }))
        finished = true
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("Invalid runtime redirect", { cause: error })
        )
      } finally {
        cleanup()
        request.abort()
      }
    })
    request.on("response", (incoming) => {
      if (finished) return
      const empty = [204, 205, 304].includes(incoming.statusCode)
      const body = empty
        ? null
        : new ReadableStream<Uint8Array>(
            {
              start(controller) {
                failBody = (error) => controller.error(error)
                incoming.on("data", (chunk) => {
                  if (finished) return
                  controller.enqueue(new Uint8Array(chunk))
                  if ((controller.desiredSize ?? 0) < -128 * 1024 * 1024) {
                    fail(
                      new Error("Runtime download buffer exceeds size limit")
                    )
                    request.abort()
                  }
                })
                incoming.once("end", () => {
                  if (finished) return
                  finished = true
                  cleanup()
                  controller.close()
                })
                incoming.once("error", fail)
                incoming.once("aborted", () =>
                  fail(new Error("Runtime download interrupted"))
                )
              },
              cancel() {
                finished = true
                cleanup()
                request.abort()
              },
            },
            { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength }
          )
      try {
        resolve(
          new Response(body, {
            status: incoming.statusCode,
            headers: responseHeaders(incoming.headers),
          })
        )
        if (empty) {
          finished = true
          cleanup()
        }
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("Invalid runtime response", { cause: error })
        )
        request.abort()
      }
    })
    if (options.signal?.aborted) abort()
    else request.end()
  })
}
