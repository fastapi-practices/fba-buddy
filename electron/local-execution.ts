import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import type {
  ExecutionLaunch,
  PreparedExecution,
} from "../src/shared/execution"
import { EXECUTION_PROTOCOL_CAPABILITIES } from "../src/shared/execution"
import type { ConversationExecutionProfile } from "./desktop-execution-settings"
import { validateWorkspaceWorktree } from "./workspace-worktree"
import { createExecutionSession } from "./execution"
import { workspaceRevision, workspaceWriteActive } from "./workspace-run"

type Session = Awaited<ReturnType<typeof createExecutionSession>>
type Prepared = {
  owner: number
  config: ConversationExecutionProfile
  expires: number
  checkpointDirectory?: string
  workspaceRevision: number
}
const prepared = new Map<string, Prepared>()
const active = new Map<string, { owner: number; stop: () => Promise<void> }>()
const MAX_FRAME = 4 * 1024 * 1024
const MAX_INPUT_FRAME = 15 * 1024 * 1024
const METHODS = new Set([
  "stop",
  "list_files",
  "read_file",
  "write_file",
  "write_input_file",
  "edit_file",
  "run_bash",
  "run_command",
  "run_tests",
  "git_status",
  "git_diff",
  "run_background",
  "get_endpoint",
])

export async function prepareLocalExecution(
  config: ConversationExecutionProfile,
  owner: number,
  checkpointDirectory?: string
): Promise<PreparedExecution> {
  if (config.backend !== "local")
    throw new Error("本机连接仅支持 local 执行后端")
  for (const [id, item] of prepared)
    if (item.expires < Date.now()) prepared.delete(id)
  if (prepared.size >= 32) throw new Error("待连接的执行会话过多")
  const revision = workspaceRevision(config.workspaceDir)
  if (workspaceWriteActive(config.workspaceDir))
    throw new Error("工作区正在写入，请稍后重新准备执行")
  await mkdir(config.workspaceDir, { recursive: true })
  const { validateExecutionWorkspace } = await import("./execution-isolation")
  const cwd = await validateExecutionWorkspace(config.workspaceDir)
  if (config.worktree) await validateWorkspaceWorktree(cwd, config.worktree)
  if (workspaceWriteActive(cwd) || revision !== workspaceRevision(cwd))
    throw new Error("工作区已切换，请重新发送以准备执行")
  const preparationId = randomUUID()
  prepared.set(preparationId, {
    owner,
    config: { ...config, workspaceDir: cwd },
    expires: Date.now() + 120_000,
    checkpointDirectory,
    workspaceRevision: revision,
  })
  return {
    preparationId,
    backend: config.backend,
    cwd,
    capabilities: [...EXECUTION_PROTOCOL_CAPABILITIES],
  }
}

export async function stopLocalExecution(bridgeId: string, owner?: number) {
  const item = active.get(bridgeId)
  if (item && (owner === undefined || item.owner === owner)) await item.stop()
}

export async function stopLocalExecutions(owner?: number) {
  for (const [id, item] of prepared)
    if (owner === undefined || item.owner === owner) prepared.delete(id)
  await Promise.allSettled(
    [...active.keys()].map((id) => stopLocalExecution(id, owner))
  )
}

export async function startLocalExecution(
  payload: ExecutionLaunch,
  owner: number,
  runtimeDirectory: string
) {
  if (
    !payload ||
    !/^[a-f0-9]{32}$/.test(payload.bridgeId) ||
    typeof payload.ticket !== "string" ||
    payload.ticket.length < 32 ||
    !["ask", "auto", "full"].includes(payload.permissionMode)
  )
    throw new Error("无效的桌面执行连接参数")
  const configuration = prepared.get(payload.preparationId)
  if (
    !configuration ||
    configuration.owner !== owner ||
    configuration.expires < Date.now() ||
    configuration.workspaceRevision !==
      workspaceRevision(configuration.config.workspaceDir)
  )
    throw new Error("桌面执行准备已失效")
  // Recheck the binding immediately before opening the remote bridge. The
  // preparation may have outlived a worktree handoff or metadata replacement
  if (configuration.config.worktree)
    await validateWorkspaceWorktree(
      configuration.config.workspaceDir,
      configuration.config.worktree
    )
  if (
    prepared.get(payload.preparationId) !== configuration ||
    configuration.expires < Date.now() ||
    configuration.workspaceRevision !==
      workspaceRevision(configuration.config.workspaceDir)
  )
    throw new Error("桌面执行准备已失效")
  const url = new URL(payload.url)
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.pathname.endsWith(`/execution/bridges/${payload.bridgeId}`)
  )
    throw new Error("无效的执行服务地址")
  if (active.has(payload.bridgeId) || active.size >= 8)
    throw new Error("桌面执行连接已启动或达到上限")
  prepared.delete(payload.preparationId)
  const socket = new WebSocket(url)
  let executor: Session | undefined
  let creating: Promise<Session> | undefined
  let stopped = false
  let lastMessage = Date.now()
  let rejectStart: (cause: Error) => void = () => {}
  let stopping: Promise<void> | undefined
  let queue = Promise.resolve()
  let queued = 0
  let maxFileBytes = 1_000_000
  let bashTimeoutMs = 30_000
  let testsEnabled = false
  let commandEnabled = false
  let gitEnabled = false
  let inputFilesEnabled = false
  const watchdog = setInterval(() => {
    if (Date.now() - lastMessage > 30_000) void stop()
  }, 1000)
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    stopped = true
    clearInterval(watchdog)
    stopping = (
      creating ? creating.catch(() => undefined) : Promise.resolve(executor)
    )
      .then(async (session) => {
        await session?.stop()
      })
      .finally(() => active.delete(payload.bridgeId))
    socket.close()
    rejectStart(new Error("桌面执行连接已关闭"))
    return stopping
  }
  const send = (value: unknown) => {
    const text = JSON.stringify(value)
    if (
      new TextEncoder().encode(text).byteLength > MAX_FRAME ||
      socket.bufferedAmount > MAX_FRAME ||
      socket.readyState !== WebSocket.OPEN
    )
      throw new Error("桌面执行输出超过限制")
    socket.send(text)
  }
  active.set(payload.bridgeId, { owner, stop })
  try {
    await new Promise<void>((resolve, reject) => {
      rejectStart = reject
      const startup = setTimeout(() => {
        reject(new Error("桌面执行连接超时"))
        void stop()
      }, 15_000)
      const started = () => {
        clearTimeout(startup)
        resolve()
      }
      socket.onopen = () => send({ ticket: payload.ticket })
      socket.onerror = () => {
        clearTimeout(startup)
        reject(new Error("无法连接执行服务"))
        void stop()
      }
      socket.onclose = () => {
        clearTimeout(startup)
        void stop()
      }
      socket.onmessage = (message) => {
        if (stopped) return
        lastMessage = Date.now()
        try {
          if (
            typeof message.data !== "string" ||
            new TextEncoder().encode(message.data).byteLength >
              (inputFilesEnabled ? MAX_INPUT_FRAME : MAX_FRAME)
          )
            throw new Error("无效的桌面执行数据帧")
          const event = JSON.parse(message.data) as Record<string, unknown>
          if (event.type === "ping") {
            send({ type: "pong" })
            return
          }
          if (event.type === "close") {
            void stop()
            return
          }
          if (event.type === "ready" && !creating) {
            if (
              event.backend !== configuration.config.backend ||
              event.cwd !== configuration.config.workspaceDir ||
              event.permission_mode !== payload.permissionMode
            )
              throw new Error("执行服务返回的工作区或权限不匹配")
            const limits = event.limits as Record<string, unknown> | undefined
            if (
              !limits ||
              !Number.isSafeInteger(limits.max_file_bytes) ||
              !Number.isSafeInteger(limits.bash_timeout_seconds) ||
              Number(limits.max_file_bytes) < 1 ||
              Number(limits.bash_timeout_seconds) < 1
            )
              throw new Error("执行服务返回了无效的执行限额")
            maxFileBytes = Math.min(Number(limits.max_file_bytes), 1_000_000)
            bashTimeoutMs = Math.min(
              Number(limits.bash_timeout_seconds) * 1000,
              120_000
            )
            if (
              !Array.isArray(event.capabilities) ||
              event.capabilities.some(
                (capability) => typeof capability !== "string"
              )
            )
              throw new Error("执行服务返回了无效的协议能力")
            testsEnabled = event.capabilities.includes("run_tests_v1")
            commandEnabled = event.capabilities.includes("command_v1")
            gitEnabled = event.capabilities.includes("workspace_git_v1")
            inputFilesEnabled = event.capabilities.includes("input_files_v1")
            if (configuration.config.worktree && !gitEnabled)
              throw new Error("服务端尚未支持已授权工作树，请升级服务端后重试")
            creating = createExecutionSession({
              backend: "local",
              workspaceDir: configuration.config.workspaceDir,
              checkpointDirectory: configuration.checkpointDirectory,
              workspaceRevision: configuration.workspaceRevision,
              ...(configuration.config.worktree
                ? { worktree: configuration.config.worktree }
                : {}),
              permissionMode:
                payload.permissionMode === "full" ? "full" : "default",
              runtimeDirectory,
            })
            creating
              .then((session) => {
                executor = session
                if (stopped) void session.stop()
                else started()
              })
              .catch((cause: unknown) => {
                clearTimeout(startup)
                reject(cause)
                void stop()
              })
            return
          }
          if (
            !executor ||
            typeof event.id !== "string" ||
            !/^[a-f0-9]{32}$/.test(event.id) ||
            typeof event.method !== "string" ||
            !METHODS.has(event.method) ||
            (event.method === "run_tests" && !testsEnabled) ||
            (event.method === "run_command" && !commandEnabled) ||
            (event.method === "write_input_file" && !inputFilesEnabled) ||
            (["git_status", "git_diff"].includes(event.method) &&
              !gitEnabled) ||
            !event.params ||
            typeof event.params !== "object" ||
            Array.isArray(event.params) ||
            queued >= 32
          )
            throw new Error("无效的桌面执行请求")
          const id = event.id
          const method = event.method
          const params = event.params as Record<string, unknown>
          queued++
          queue = queue
            .then(async () => {
              if (stopped) return
              try {
                for (const field of [
                  params.content,
                  params.old_text,
                  params.new_text,
                ])
                  if (
                    typeof field === "string" &&
                    Buffer.byteLength(field) > maxFileBytes
                  )
                    throw new Error("文件内容超过服务端限额")
                const limitedParams =
                  method === "run_bash" ||
                  method === "run_tests" ||
                  method === "run_command"
                    ? {
                        ...params,
                        timeout_ms: Math.min(
                          typeof params.timeout_ms === "number"
                            ? params.timeout_ms
                            : bashTimeoutMs,
                          bashTimeoutMs
                        ),
                      }
                    : params
                const result = await executor!.handle(method, limitedParams)
                if (
                  method === "read_file" &&
                  typeof result === "string" &&
                  Buffer.byteLength(result) > maxFileBytes
                )
                  throw new Error("文件读取结果超过服务端限额")
                send({ id, result: result ?? null, error: null })
              } catch (cause) {
                send({
                  id,
                  result: null,
                  error: {
                    code: "EXECUTION_ERROR",
                    message: (cause instanceof Error
                      ? cause.message
                      : "Execution failed"
                    ).slice(0, 4096),
                  },
                })
              } finally {
                queued--
              }
            })
            .catch(() => {
              void stop()
            })
        } catch (cause) {
          clearTimeout(startup)
          reject(cause)
          void stop()
        }
      }
    })
  } catch (cause) {
    await stop()
    throw cause
  }
}
