import { EventEmitter } from "node:events"
import { beforeEach, expect, it, vi } from "vitest"
import { net } from "electron"
import { runtimeDownloadFetch } from "./runtime-network"

vi.mock("electron", () => ({ net: { request: vi.fn() } }))

class TestRequest extends EventEmitter {
  setHeader = vi.fn()
  end = vi.fn()
  abort = vi.fn()
}

let request: TestRequest
beforeEach(() => {
  vi.clearAllMocks()
  request = new TestRequest()
  vi.mocked(net.request).mockReturnValue(
    request as unknown as ReturnType<typeof net.request>
  )
})

function response(statusCode = 200) {
  return Object.assign(new EventEmitter(), {
    statusCode,
    headers: { "content-type": "application/octet-stream" },
  })
}

it("uses the Electron session without cookies and exposes redirects for origin checking", async () => {
  const pending = runtimeDownloadFetch("https://github.com/example/archive", {
    headers: { Accept: "application/octet-stream" },
  })
  expect(net.request).toHaveBeenCalledWith({
    url: "https://github.com/example/archive",
    method: "GET",
    redirect: "manual",
    useSessionCookies: false,
  })
  expect(request.setHeader).toHaveBeenCalledWith(
    "accept",
    "application/octet-stream"
  )
  request.emit(
    "redirect",
    302,
    "GET",
    "https://release-assets.githubusercontent.com/archive",
    {}
  )
  const redirected = await pending
  expect(redirected.status).toBe(302)
  expect(redirected.headers.get("location")).toBe(
    "https://release-assets.githubusercontent.com/archive"
  )
  expect(request.abort).toHaveBeenCalledOnce()
  request.emit("close")
})

it("streams bytes and finishes before the request closes", async () => {
  const pending = runtimeDownloadFetch("https://nodejs.org/archive")
  const incoming = response()
  request.emit("response", incoming)
  const result = await pending
  incoming.emit("data", Buffer.from("verified archive"))
  incoming.emit("end")
  request.emit("close")
  expect(await result.text()).toBe("verified archive")
})

it("keeps receiving the response after the request write stream closes", async () => {
  const pending = runtimeDownloadFetch("https://nodejs.org/archive")
  request.emit("close")
  const incoming = response()
  request.emit("response", incoming)
  const result = await pending
  incoming.emit("data", Buffer.from("verified archive"))
  request.emit("close")
  incoming.emit("end")
  incoming.emit("close")
  expect(await result.text()).toBe("verified archive")
})

it("propagates interrupted responses and disconnects to consumers", async () => {
  for (const event of ["aborted", "error"] as const) {
    request = new TestRequest()
    vi.mocked(net.request).mockReturnValue(
      request as unknown as ReturnType<typeof net.request>
    )
    const pending = runtimeDownloadFetch("https://nodejs.org/archive")
    const incoming = response()
    request.emit("response", incoming)
    const result = await pending
    incoming.emit("data", Buffer.from("partial"))
    incoming.emit(event, new Error("connection closed"))
    await expect(result.text()).rejects.toThrow(/interrupted|closed/)
  }
})

it("aborts on cancellation before and after response headers", async () => {
  const before = new AbortController()
  before.abort()
  await expect(
    runtimeDownloadFetch("https://nodejs.org/archive", {
      signal: before.signal,
    })
  ).rejects.toThrow()
  expect(net.request).not.toHaveBeenCalled()
  const controller = new AbortController()
  const pending = runtimeDownloadFetch("https://nodejs.org/archive", {
    signal: controller.signal,
  })
  request.emit("response", response())
  const result = await pending
  controller.abort()
  await expect(result.text()).rejects.toThrow("cancelled")
  expect(request.abort).toHaveBeenCalledOnce()
})

it("rejects request errors and invalid transport before starting a download", async () => {
  await expect(
    runtimeDownloadFetch("http://nodejs.org/archive")
  ).rejects.toThrow("HTTPS")
  await expect(
    runtimeDownloadFetch("https://nodejs.org/archive", { method: "POST" })
  ).rejects.toThrow("GET")
  const pending = runtimeDownloadFetch("https://nodejs.org/archive")
  request.emit("error", new Error("network failed"))
  await expect(pending).rejects.toThrow("network failed")
})

it("supports empty HTTP responses without constructing an invalid body", async () => {
  const pending = runtimeDownloadFetch("https://nodejs.org/archive")
  request.emit("response", response(204))
  const result = await pending
  expect(result.status).toBe(204)
  expect(result.body).toBeNull()
})
