import type { ChildProcessWithoutNullStreams } from "node:child_process"
import spawn from "cross-spawn"
import { access, mkdir, realpath, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { beginWorkspaceRun, workspaceRevision } from "./workspace-run"
import {
  validateWorkspaceWorktree,
  type WorkspaceWorktreeBinding,
} from "./workspace-worktree"
import type { DesktopAcpLaunch } from "../src/shared/desktop"

const MAX_BUFFER = 8 * 1024 * 1024
const preparing = new Map<string, { owner: number; cancelled: boolean }>()
const active = new Map<string, { owner: number; stop: () => Promise<void> }>()
type PreparedAcp = {
  owner: number
  account: string
  expires: number
  config: DesktopAcpLaunch["config"]
  checkpointDirectory?: string
  worktree?: WorkspaceWorktreeBinding
  workspaceRevision: number
}
const prepared = new Map<string, PreparedAcp>()

export function prepareLocalAcp(
  value: Omit<PreparedAcp, "expires" | "workspaceRevision">
) {
  for (const [id, item] of prepared)
    if (item.expires < Date.now()) prepared.delete(id)
  if (prepared.size >= 64) throw new Error("待启动的本地 Agent 过多")
  const preparationId = randomUUID()
  prepared.set(preparationId, {
    ...value,
    expires: Date.now() + 300_000,
    workspaceRevision: workspaceRevision(value.config.cwd!),
  })
  return { ...value.config, preparationId }
}

let workspaceDir: string | undefined

export function setAcpWorkspaceDir(dir: string | undefined) {
  workspaceDir = dir
}

export async function ensureAcpWorkspace(): Promise<string> {
  if (!workspaceDir || !path.isAbsolute(workspaceDir))
    throw new Error("ACP 工作目录未初始化")
  await mkdir(workspaceDir, { recursive: true })
  const cwd = await realpath(workspaceDir)
  if (!(await stat(cwd)).isDirectory()) throw new Error("本地工作目录不存在")
  return cwd
}

export async function resolveLocalLaunch(
  config: DesktopAcpLaunch["config"],
  cwd: string
) {
  if (
    !config ||
    typeof config.command !== "string" ||
    !config.command.trim() ||
    config.command.length > 512 ||
    /[\r\n\0]/.test(config.command)
  ) {
    throw new Error("请输入有效的本地启动命令")
  }
  if (
    !Array.isArray(config.args) ||
    config.args.length > 64 ||
    config.args.some(
      (arg) =>
        typeof arg !== "string" || arg.length > 4096 || arg.includes("\0")
    )
  ) {
    throw new Error("启动参数无效，请每行填写一个")
  }
  if (!cwd || !path.isAbsolute(cwd)) throw new Error("本地工作目录无效")
  const workspace = await realpath(cwd)
  if (!(await stat(workspace)).isDirectory())
    throw new Error("本地工作目录不存在")
  const searchPath = [
    process.env.PATH ?? "",
    path.join(homedir(), ".local/bin"),
    path.join(homedir(), ".npm-global/bin"),
    ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "npm")] : []),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].join(path.delimiter)
  const command = config.command.trim()
  const candidates = path.isAbsolute(command)
    ? [command]
    : searchPath
        .split(path.delimiter)
        .filter(Boolean)
        .map((dir) => path.join(dir, command))
  for (const candidate of candidates) {
    for (const suffix of process.platform === "win32"
      ? ["", ".exe", ".cmd", ".bat"]
      : [""]) {
      try {
        const executable = candidate + suffix
        await access(executable, constants.X_OK)
        if (!(await stat(executable)).isFile()) continue
        return {
          command: executable,
          args: config.args,
          cwd: workspace,
          env: { ...process.env, PATH: searchPath },
        }
      } catch {
        /* 继续检查 PATH */
      }
    }
  }
  throw new Error("本机未找到启动程序，请先安装 Agent 或填写可执行文件路径")
}

export async function stopLocalAcp(bridgeId: string, owner?: number) {
  const pending = preparing.get(bridgeId)
  if (pending && (owner === undefined || pending.owner === owner))
    pending.cancelled = true
  const item = active.get(bridgeId)
  if (item && (owner === undefined || item.owner === owner)) await item.stop()
}

export async function stopLocalAcps(owner?: number) {
  for (const [id, item] of prepared) {
    if (owner === undefined || item.owner === owner) prepared.delete(id)
  }
  for (const pending of preparing.values()) {
    if (owner === undefined || pending.owner === owner) pending.cancelled = true
  }
  await Promise.allSettled(
    [...active.keys()].map((id) => stopLocalAcp(id, owner))
  )
}

async function killTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid) return
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { windowsHide: true }
      )
      const timer = setTimeout(() => {
        killer.kill()
        child.kill()
        resolve()
      }, 3000)
      killer.on("error", () => {
        clearTimeout(timer)
        child.kill()
        resolve()
      })
      killer.on("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return
  }
  const pid = child.pid
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    return
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 1500))
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    /* 进程组已退出 */
  }
}

export async function startLocalAcp(
  payload: DesktopAcpLaunch,
  owner: number,
  account: string
) {
  const preparation = prepared.get(payload.preparationId ?? "")
  if (
    !preparation ||
    preparation.owner !== owner ||
    preparation.account !== account ||
    preparation.expires < Date.now() ||
    preparation.workspaceRevision !== workspaceRevision(preparation.config.cwd!)
  )
    throw new Error("本地 Agent 准备已过期，请重新发送")
  // Recheck the authorized linked worktree before consuming the preparation or
  // starting a bridge. Handoff can replace its Git metadata after preparation
  if (preparation.worktree)
    await validateWorkspaceWorktree(
      preparation.config.cwd!,
      preparation.worktree
    )
  prepared.delete(payload.preparationId!)
  if (
    !/^[a-f0-9]{32}$/.test(payload.bridgeId) ||
    typeof payload.ticket !== "string" ||
    payload.ticket.length < 32
  )
    throw new Error("无效的本地连接凭证")
  const url = new URL(payload.url)
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    !url.pathname.endsWith(`/acp/bridges/${payload.bridgeId}`) ||
    url.username ||
    url.password
  )
    throw new Error("无效的 ACP 连接地址")
  if (active.has(payload.bridgeId) || preparing.has(payload.bridgeId))
    throw new Error("本地 ACP 连接已启动")
  if (active.size + preparing.size >= 8)
    throw new Error("本地 ACP 并发连接已达上限")
  const pending = { owner, cancelled: false }
  preparing.set(payload.bridgeId, pending)
  let launch: Awaited<ReturnType<typeof resolveLocalLaunch>>
  let workspaceRun: Awaited<ReturnType<typeof beginWorkspaceRun>> | undefined
  try {
    launch = await resolveLocalLaunch(
      preparation.config,
      preparation.config.cwd!
    )
    if (preparation.worktree)
      await validateWorkspaceWorktree(launch.cwd, preparation.worktree)
    if (pending.cancelled) throw new Error("本地 ACP 启动已取消")
    workspaceRun = await beginWorkspaceRun(
      launch.cwd,
      preparation.checkpointDirectory,
      preparation.workspaceRevision
    )
    if (pending.cancelled) throw new Error("本地 ACP 启动已取消")
    if (active.has(payload.bridgeId) || active.size >= 8)
      throw new Error("本地 ACP 连接已启动或达到并发上限")
  } catch (error) {
    await workspaceRun?.finish()
    throw error
  } finally {
    preparing.delete(payload.bridgeId)
  }
  const socket = new WebSocket(url)
  let child: ChildProcessWithoutNullStreams | undefined
  let stopped = false
  let lastMessage = Date.now()
  let rejectStart: (error: Error) => void = () => {}
  const watchdog = setInterval(() => {
    if (Date.now() - lastMessage > 30_000) void stop().catch(() => {})
  }, 1000)
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    stopped = true
    clearInterval(watchdog)
    socket.close()
    rejectStart(new Error("本地 ACP 连接已关闭"))
    stopping = (child ? killTree(child) : Promise.resolve())
      .finally(async () => {
        await workspaceRun?.finish()
      })
      .finally(() => active.delete(payload.bridgeId))
    return stopping
  }
  active.set(payload.bridgeId, { owner, stop })
  try {
    await new Promise<void>((resolve, reject) => {
      rejectStart = reject
      socket.onopen = () =>
        socket.send(JSON.stringify({ ticket: payload.ticket }))
      socket.onerror = () => {
        reject(new Error("无法连接 ACP 服务"))
        void stop().catch(() => {})
      }
      socket.onclose = () => {
        void stop().catch(() => {})
      }
      socket.onmessage = (message) => {
        if (stopped) return
        lastMessage = Date.now()
        try {
          if (
            typeof message.data !== "string" ||
            Buffer.byteLength(message.data, "utf8") > MAX_BUFFER
          )
            throw new Error("无效的 ACP 数据帧")
          const event = JSON.parse(message.data) as {
            type: string
            data?: string
          }
          if (event.type === "ready" && !child) {
            child = spawn(launch.command, launch.args, {
              cwd: launch.cwd,
              env: launch.env,
              shell: false,
              detached: process.platform !== "win32",
              windowsHide: true,
              stdio: "pipe",
            }) as ChildProcessWithoutNullStreams
            child.on("spawn", resolve)
            child.on("error", () => {
              reject(new Error("本地 Agent 启动失败"))
              void stop().catch(() => {})
            })
            child.on("close", (code) => {
              if (socket.readyState === WebSocket.OPEN)
                socket.send(JSON.stringify({ type: "exit", code }))
              void stop().catch(() => {})
            })
            child.stdout.setEncoding("utf8")
            child.stdout.on("data", (data: string) => {
              if (
                socket.readyState !== WebSocket.OPEN ||
                socket.bufferedAmount > MAX_BUFFER
              ) {
                void stop().catch(() => {})
                return
              }
              socket.send(JSON.stringify({ type: "stdout", data }))
            })
            child.stderr.resume()
            child.stdin.on("error", () => {
              void stop().catch(() => {})
            })
          } else if (
            event.type === "stdin" &&
            child &&
            typeof event.data === "string"
          ) {
            if (child.stdin.writableLength > MAX_BUFFER)
              throw new Error("ACP 输入积压过多")
            child.stdin.write(event.data)
          } else if (event.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }))
          } else if (event.type === "close") void stop().catch(() => {})
          else throw new Error("无效的 ACP 控制消息")
        } catch {
          reject(new Error("ACP 连接中断"))
          void stop().catch(() => {})
        }
      }
    })
  } catch (error) {
    await stop()
    throw error
  }
}
