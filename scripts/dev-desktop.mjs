import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"
import electronPath from "electron"
import waitOn from "wait-on"
import { buildElectron } from "./build-electron.mjs"
import { buildWindowMaterialAddon } from "./build-window-material.mjs"
import {
  createDesktopRebuilder,
  watchDesktopSources,
} from "./desktop-dev-rebuild.mjs"

const HOST = "127.0.0.1"
const DEFAULT_PORT = 5173
const projectRoot = fileURLToPath(new URL("..", import.meta.url))

let electron = null
let vite = null
let rebuilder = null
let closeWatchers = () => {}
let shuttingDown = false
let shutdownPromise = null
const childStops = new WeakMap()

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  if (childStops.has(child)) return childStops.get(child)
  const stopped = new Promise((resolve) => {
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 5_000)
    child.once("close", () => {
      clearTimeout(forceStop)
      resolve()
    })
    child.kill("SIGTERM")
  })
  childStops.set(child, stopped)
  return stopped
}

function shutdown(code = 0) {
  if (shutdownPromise) return shutdownPromise
  shuttingDown = true
  closeWatchers()
  shutdownPromise = Promise.all([
    rebuilder?.dispose(),
    stopChild(electron),
    stopChild(vite),
  ]).then(() => process.exit(code))
  return shutdownPromise
}

process.on("SIGINT", () => void shutdown(0))
process.on("SIGTERM", () => void shutdown(0))

function canListen(host, port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once("error", () => resolve(false))
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findDevPort(startPort) {
  for (let port = startPort; port < startPort + 50; port++) {
    const wildcardFree = await canListen("0.0.0.0", port)
    const hostFree = await canListen(HOST, port)
    if (wildcardFree && hostFree) {
      return port
    }
  }
  throw new Error(`找不到可用的开发端口（${startPort}–${startPort + 49}）`)
}

let port
try {
  port = await findDevPort(DEFAULT_PORT)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const origin = `http://${HOST}:${port}`

try {
  await buildElectron()
  await buildWindowMaterialAddon({ quiet: true })
} catch (error) {
  console.error("Electron 主进程编译失败")
  console.error(error)
  await shutdown(1)
}

function launchElectron() {
  const child = spawn(electronPath, ["."], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: origin,
    },
  })
  electron = child
  child.on("error", (error) => {
    console.error("Electron 启动失败", error)
    void shutdown(1)
  })
  child.on("exit", (code) => {
    if (electron === child && !shuttingDown) void shutdown(code ?? 0)
  })
}

rebuilder = createDesktopRebuilder({
  build: async () => {
    console.info("Electron 源码已更新，正在重新编译")
    await buildElectron()
    await buildWindowMaterialAddon({ quiet: true })
  },
  restart: async () => {
    const previous = electron
    electron = null
    await stopChild(previous)
    if (shuttingDown) return
    launchElectron()
    console.info("Electron 已重新启动")
  },
  onError: (error) => {
    console.error("Electron 重新编译失败，当前桌面窗口继续运行", error)
  },
})

let pendingChange = false
let desktopReady = false
try {
  closeWatchers = watchDesktopSources({
    root: projectRoot,
    onChange: () => {
      if (desktopReady) rebuilder.request()
      else pendingChange = true
    },
    onError: (error) => {
      console.error("Electron 源码监听失败，请重新启动开发服务", error)
    },
  })
} catch (error) {
  console.error("Electron 源码监听启动失败", error)
  await shutdown(1)
}

vite = spawn(
  "pnpm",
  ["exec", "vite", "--host", HOST, "--port", String(port), "--strictPort"],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      BROWSER: "none",
    },
  }
)
vite.on("error", (error) => {
  console.error("Vite 开发服务启动失败", error)
  void shutdown(1)
})
vite.on("exit", (code) => {
  if (!shuttingDown) void shutdown(code ?? 0)
})

try {
  await waitOn({
    resources: [`http-get://${HOST}:${port}`],
    timeout: 60_000,
  })
} catch (error) {
  console.error("Vite 开发服务未能在 60 秒内就绪，已取消启动桌面窗口")
  console.error(error)
  await shutdown(1)
}

if (!shuttingDown) {
  launchElectron()
  desktopReady = true
  if (pendingChange) rebuilder.request()
}
