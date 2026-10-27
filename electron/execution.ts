import { realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { checkpointBefore, recordCheckpoint } from "./workspace-checkpoints"
import { diffLines } from "diff"
import { beginWorkspaceRun } from "./workspace-run"
import type { ExecutionCommandResult } from "../src/shared/execution"
import { readWorkspaceGitDiff, readWorkspaceGitStatus } from "./workspace-git"
import { validateWorkspaceWorktree } from "./workspace-worktree"
import type { WorkspaceWorktreeBinding } from "./workspace-worktree"
import {
  EXECUTION_FILE_HELPER,
  EXECUTION_MAX_FILE_BYTES,
  EXECUTION_MAX_OUTPUT_BYTES,
} from "./execution-files"
import {
  containsPath,
  createLocalLaunch,
  findExecutable,
  resolveExecutionPath,
  resolveLocalIsolation,
  validateExecutionEnvironment,
  validateExecutionWorkspace,
} from "./execution-isolation"
import type {
  ExecutionBackend,
  ExecutionPermissionMode,
} from "./execution-isolation"
import { executeBounded, launchExecutionProcess } from "./execution-process"
import type {
  ExecutionProcess,
  ExecutionProcessResult,
} from "./execution-process"

const COMMAND_MAX_OUTPUT_BYTES = 512 * 1024
export { workspaceExecutionActive } from "./workspace-run"

export { getExecutionCapabilities } from "./execution-isolation"


export type ExecutionSessionOptions = {
  backend: ExecutionBackend
  workspaceDir: string
  permissionMode: ExecutionPermissionMode
  runtimeDirectory: string
  checkpointDirectory?: string
  worktree?: WorkspaceWorktreeBinding
  signal?: AbortSignal
  workspaceRevision?: number
}
type ExecutionFileEntry = {
  path: string
  is_dir: boolean
  size: number | null
}
export type ExecutionResult =
  | string
  | ExecutionCommandResult
  | ExecutionFileEntry[]
  | { url: string; headers: Record<string, string> }
  | null
export type ExecutionSession = {
  cwd: string
  handle: (
    method: string,
    params?: Record<string, unknown>
  ) => Promise<ExecutionResult>
  stop: () => Promise<void>
}

function stringParam(params: Record<string, unknown>, key: string) {
  const value = params[key]
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error(`Invalid ${key}`)
  return value
}
function integerParam(value: unknown, fallback: number, maximum: number) {
  if (value === undefined || value === null) return fallback
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  )
    throw new Error("Invalid numeric parameter")
  return value
}
function validPort(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1024 ||
    value > 65535
  )
    throw new Error("Endpoint port must be between 1024 and 65535")
  return value
}

export function mapWorkspaceCommand(command: string, cwd: string) {
  let quote = ""
  let result = ""
  for (let index = 0; index < command.length; index++) {
    const char = command[index]
    if (char === "\\" && quote !== "'") {
      result += command.slice(index, index + 2)
      index++
      continue
    }
    if ((char === "'" || char === '"') && (!quote || quote === char))
      quote = quote ? "" : char
    const before = index === 0 ? " " : command[index - 1]
    const after = command[index + 10] ?? " "
    if (
      command.startsWith("/workspace", index) &&
      /[\s'"=(:;<>]/.test(before) &&
      /[\s/'";):<>]/.test(after)
    ) {
      if (quote === "'") result += cwd.replace(/'/g, "'\\''")
      else if (quote === '"') result += cwd.replace(/[\\"$`]/g, "\\$&")
      else result += `'${cwd.replace(/'/g, "'\\''")}'`
      index += "/workspace".length - 1
    } else result += char
  }
  return result
}

function commandText(result: ExecutionProcessResult) {
  const note = result.reason ? `\n[${result.reason}]` : ""
  return `exit ${result.code}\n${result.stdout}${result.stderr}${note}`.trimEnd()
}

async function localPortOwned(port: number, pid: number, cwd: string) {
  const lsof = await findExecutable("lsof", ["/usr/sbin/lsof", "/usr/bin/lsof"])
  if (!lsof) throw new Error("Cannot verify local endpoint ownership")
  const env = { PATH: "/usr/bin:/bin:/usr/sbin", LANG: "C" }
  const listeners = await executeBounded({
    executable: lsof,
    args: ["-nP", "-a", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpn"],
    cwd,
    env,
    deadlineMs: 3000,
    maxOutputBytes: 64 * 1024,
  })
  if (listeners.code !== 0) return false
  const owned = new Set<number>()
  let listenerPid = 0
  for (const line of listeners.stdout.split("\n")) {
    if (line.startsWith("p")) listenerPid = Number(line.slice(1))
    if (
      line.startsWith("n") &&
      [`n127.0.0.1:${port}`, `n[::1]:${port}`].includes(line)
    )
      owned.add(listenerPid)
  }
  if (!owned.size) return false
  const processInfo = await executeBounded({
    executable: "/bin/ps",
    args: ["-axo", "pid=,ppid=,pgid="],
    cwd,
    env,
    deadlineMs: 3000,
    maxOutputBytes: 1024 * 1024,
  })
  if (processInfo.code !== 0) return false
  const rows = processInfo.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
  const tree = new Set([pid])
  for (let changed = true; changed;) {
    changed = false
    for (const [id, parent, group] of rows) {
      if ((group === pid || tree.has(parent)) && !tree.has(id)) {
        tree.add(id)
        changed = true
      }
    }
  }
  return [...owned].some((owner) => tree.has(owner))
}

export async function createExecutionSession(
  options: ExecutionSessionOptions
): Promise<ExecutionSession> {
  if (
    !options ||
    options.backend !== "local" ||
    !["default", "full"].includes(options.permissionMode)
  )
    throw new Error("Invalid execution session options")
  if (options.signal?.aborted) throw new Error("Execution cancelled")
  const cwd = await validateExecutionWorkspace(options.workspaceDir)
  if (options.worktree) await validateWorkspaceWorktree(cwd, options.worktree)
  const isolation = await resolveLocalIsolation(options.runtimeDirectory)
  if (
    isolation.readRoots.some(
      (root) => containsPath(cwd, root) || containsPath(root, cwd)
    )
  )
    throw new Error("Workspace and managed runtimes must be separate")
  const workspaceRun = await beginWorkspaceRun(
    cwd,
    options.checkpointDirectory,
    options.workspaceRevision
  )
  let stopped = false
  let stopping: Promise<void> | undefined
  let preparing = 0
  const processes = new Set<ExecutionProcess>()
  const backgrounds = new Map<number, { process: ExecutionProcess }>()
  const ensureRunning = () => {
    if (stopped || options.signal?.aborted)
      throw new Error("Execution session stopped")
  }
  const launch = async (
    executable: string,
    args: string[],
    config: {
      input?: string
      env?: Record<string, string>
      deadlineMs: number
      maxOutputBytes?: number
    }
  ): Promise<{ process: ExecutionProcess }> => {
    ensureRunning()
    if (processes.size + preparing >= 8)
      throw new Error("Execution concurrency limit reached")
    preparing++
    try {
      if (options.worktree)
        await validateWorkspaceWorktree(cwd, options.worktree)
      const spec = await createLocalLaunch(
        isolation,
        cwd,
        options.permissionMode,
        executable,
        args,
        config.env,
        options.worktree
          ? [options.worktree.commonGitDir, options.worktree.gitDir]
          : []
      )
      ensureRunning()
      const proc = launchExecutionProcess({
        ...spec,
        input: config.input,
        deadlineMs: config.deadlineMs,
        maxOutputBytes: config.maxOutputBytes ?? EXECUTION_MAX_OUTPUT_BYTES,
        signal: options.signal,
      })
      processes.add(proc)
      void proc.result
        .finally(() => {
          processes.delete(proc)
          for (const [port, item] of backgrounds)
            if (item.process === proc) backgrounds.delete(port)
        })
        .catch(() => {})
      return { process: proc }
    } finally {
      preparing--
    }
  }
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    stopped = true
    options.signal?.removeEventListener("abort", onAbort)
    stopping = (async () => {
      const active = [...processes]
      await Promise.all(active.map((proc) => proc.stop()))
      await Promise.all(active.map((proc) => proc.result.catch(() => {})))
      backgrounds.clear()
    })().finally(async () => {
      await workspaceRun.finish()
    })
    return stopping
  }
  const onAbort = () => {
    void stop().catch(() => {})
  }
  options.signal?.addEventListener("abort", onAbort, { once: true })
  if (options.signal?.aborted) onAbort()
  const handle = async (
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<ExecutionResult> => {
    if (method === "stop") {
      await stop()
      return null
    }
    ensureRunning()
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new Error("Invalid execution parameters")
    if ((await realpath(options.workspaceDir)) !== cwd)
      throw new Error("Workspace directory changed")
    if (options.worktree) await validateWorkspaceWorktree(cwd, options.worktree)
    if (method === "write_input_file") {
      const inputPath = stringParam(params, "path")
      const data = stringParam(params, "content_base64")
      const sha256 = stringParam(params, "sha256")
      if (
        !/^inbound\/[a-f0-9]{64}-[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(
          inputPath
        ) ||
        !/^[a-f0-9]{64}$/.test(sha256) ||
        !inputPath.startsWith(`inbound/${sha256}-`) ||
        data.length > Math.ceil((10 * 1024 * 1024) / 3) * 4
      )
        throw new Error("Invalid input file")
      const bytes = Buffer.from(data, "base64")
      if (
        bytes.length > 10 * 1024 * 1024 ||
        bytes.toString("base64") !== data ||
        createHash("sha256").update(bytes).digest("hex") !== sha256
      )
        throw new Error("Invalid input file content")
      const helper = await launch(
        isolation.node,
        ["-e", EXECUTION_FILE_HELPER],
        {
          input: JSON.stringify({
            method,
            params: { path: inputPath, content_base64: data, sha256 },
          }),
          deadlineMs: 30000,
        }
      )
      const result = await helper.process.result
      if (result.reason) throw new Error(`Input file ${result.reason}`)
      const response = JSON.parse(result.stdout) as {
        ok?: boolean
        text?: string
        error?: string
      }
      if (
        !response.ok ||
        result.code !== 0 ||
        typeof response.text !== "string"
      )
        throw new Error(response.error || "Input file write failed")
      return response.text
    }
    if (method === "git_status" || method === "git_diff") {
      if (
        Object.keys(params).some(
          (key) => method !== "git_diff" || key !== "scope"
        )
      )
        throw new Error("Invalid Git query parameters")
      let text: string
      if (method === "git_status") {
        const status = await readWorkspaceGitStatus(cwd, options.worktree)
        if (!status.repository) return "当前工作区根目录没有 Git 仓库"
        text = [
          `分支：${status.branch ?? "HEAD (detached)"}`,
          `上游：${status.upstream ?? "无"}，领先 ${status.ahead}，落后 ${status.behind}`,
          ...status.entries.map(
            (entry) =>
              `${entry.index}${entry.worktree} ${JSON.stringify(entry.path)}` +
              (entry.renamedFrom
                ? ` <- ${JSON.stringify(entry.renamedFrom)}`
                : "")
          ),
        ].join("\n")
      } else {
        const scope = params.scope ?? "all"
        if (scope !== "all" && scope !== "staged" && scope !== "unstaged")
          throw new Error("Invalid Git diff scope")
        const scopes: ("staged" | "unstaged")[] =
          scope === "all" ? ["staged", "unstaged"] : [scope]
        const parts: string[] = []
        for (const selected of scopes) {
          ensureRunning()
          const result = await readWorkspaceGitDiff(
            cwd,
            undefined,
            options.worktree,
            selected
          )
          if (!result.repository) return "当前工作区根目录没有 Git 仓库"
          parts.push(
            `${selected === "staged" ? "已暂存差异" : "未暂存差异"}：\n${result.diff}` +
              (result.truncated ? "\n[Git 输出已截断]" : "")
          )
        }
        text = parts.join("\n")
      }
      ensureRunning()
      return text.length > 32000
        ? `${text.slice(0, 32000).replace(/[\uD800-\uDBFF]$/, "")}\n[Git 输出已截断]`
        : text
    }
    if (
      ["list_files", "read_file", "write_file", "edit_file"].includes(method)
    ) {
      const safe: Record<string, unknown> = {
        path: resolveExecutionPath(params.path ?? "."),
      }
      if (method === "read_file") {
        safe.offset = integerParam(params.offset, 0, 1000000)
        safe.limit =
          params.limit == null ? null : integerParam(params.limit, 0, 1000000)
        if (
          params.line_numbers !== undefined &&
          typeof params.line_numbers !== "boolean"
        )
          throw new Error("Invalid line_numbers")
        safe.line_numbers = params.line_numbers ?? true
      }
      if (method === "write_file") safe.content = stringParam(params, "content")
      if (method === "edit_file") {
        safe.old_text = stringParam(params, "old_text")
        safe.new_text = stringParam(params, "new_text")
        if (!safe.old_text) throw new Error("Edit text must not be empty")
      }
      for (const value of [safe.content, safe.old_text, safe.new_text]) {
        if (
          typeof value === "string" &&
          Buffer.byteLength(value) > EXECUTION_MAX_FILE_BYTES
        )
          throw new Error("Content exceeds file size limit")
      }
      const capture = Boolean(
        options.checkpointDirectory &&
        (method === "write_file" || method === "edit_file")
      )
      const before = capture
        ? await checkpointBefore(cwd, String(safe.path))
        : null
      const helper = await launch(
        isolation.node,
        ["-e", EXECUTION_FILE_HELPER],
        { input: JSON.stringify({ method, params: safe }), deadlineMs: 10000 }
      )
      const result = await helper.process.result
      if (result.reason) throw new Error(`File operation ${result.reason}`)
      let response: {
        ok?: boolean
        text?: string
        entries?: ExecutionFileEntry[]
        error?: string
      }
      try {
        response = JSON.parse(result.stdout)
      } catch {
        throw new Error(
          `Isolated file helper failed: ${result.stderr.slice(0, 4096)}`
        )
      }
      if (!response.ok || result.code !== 0)
        throw new Error(response.error || "Isolated file operation failed")
      if (method === "list_files") {
        if (!Array.isArray(response.entries))
          throw new Error("Invalid isolated directory response")
        return response.entries
      }
      if (typeof response.text !== "string")
        throw new Error("Invalid isolated file response")
      if (capture) {
        try {
          const checkpoint = await recordCheckpoint(
            options.checkpointDirectory!,
            cwd,
            String(safe.path),
            before
          )
          const changes = diffLines(before ?? "", checkpoint.after, {
            timeout: 1000,
            maxEditLength: 10000,
          })
          const additions = changes
            ?.filter((line) => line.added)
            .reduce((count, line) => count + line.count, 0)
          const deletions = changes
            ?.filter((line) => line.removed)
            .reduce((count, line) => count + line.count, 0)
          return JSON.stringify({
            output: response.text,
            checkpoint_id: checkpoint.id,
            path: checkpoint.path,
            additions,
            deletions,
          })
        } catch {
          return JSON.stringify({
            output: response.text,
            checkpoint_error: "文件已保存，但无法记录撤销快照",
          })
        }
      }
      return response.text
    }
    if (
      method === "run_bash" ||
      (method === "run_tests" || method === "run_command") ||
      method === "run_background"
    ) {
      let command = stringParam(params, "command").trim()
      if (!command || command.length > 64 * 1024)
        throw new Error("Command is empty or exceeds size limit")
      if (isolation.kind === "seatbelt")
        command = mapWorkspaceCommand(command, cwd)
      if (
        (method === "run_tests" || method === "run_command") &&
        Buffer.byteLength(command) > 64 * 1024
      )
        throw new Error("Mapped command exceeds size limit")
      const env = validateExecutionEnvironment(params.env)
      const rawPorts =
        params.ports ??
        (params.port !== undefined
          ? [params.port]
          : env.PORT
            ? [Number(env.PORT)]
            : [])
      if (!Array.isArray(rawPorts) || rawPorts.length > 16)
        throw new Error("Invalid registered ports")
      const ports = [...new Set(rawPorts.map(validPort))]
      if (ports.some((port) => backgrounds.has(port)))
        throw new Error("Endpoint port is already registered")
      const background = method === "run_background"
      if (!background && ports.length)
        throw new Error("Ports can only be registered for background commands")
      const deadlineMs = integerParam(
        params.timeout_ms,
        background ? 1800000 : 120000,
        background ? 1800000 : 120000
      )
      if (!deadlineMs) throw new Error("Command timeout must be positive")
      if (method === "run_tests" || method === "run_command") {
        const startedAt = new Date().toISOString()
        const started = performance.now()
        try {
          const running = await launch(
            isolation.shell,
            [
              "--noprofile",
              "--norc",
              "-c",
              `ulimit -c 0; ulimit -f 131072; ulimit -n 1024; ${command}`,
            ],
            {
              env,
              deadlineMs,
              // 为控制字符的 JSON 转义和命令元数据预留帧空间
              maxOutputBytes: Math.min(
                EXECUTION_MAX_OUTPUT_BYTES,
                COMMAND_MAX_OUTPUT_BYTES
              ),
            }
          )
          const result = await running.process.result
          const stdoutBytes = Buffer.from(result.stdout)
          const stderrBytes = Buffer.from(result.stderr)
          const decodedOverflow =
            stdoutBytes.length + stderrBytes.length > COMMAND_MAX_OUTPUT_BYTES
          // 无效 UTF-8 字节替换后可能膨胀，按传输文本重新限额并保留字符边界
          const stdout = decodedOverflow
            ? new TextDecoder().decode(
                stdoutBytes.subarray(0, COMMAND_MAX_OUTPUT_BYTES),
                { stream: true }
              )
            : result.stdout
          const stderr = decodedOverflow
            ? new TextDecoder().decode(
                stderrBytes.subarray(
                  0,
                  COMMAND_MAX_OUTPUT_BYTES - Buffer.byteLength(stdout)
                ),
                { stream: true }
              )
            : result.stderr
          const reason = decodedOverflow
            ? "output-limit"
            : (result.reason ??
              (result.exitCode === null ? "execution-error" : "completed"))
          return {
            command,
            exit_code: result.exitCode,
            stdout,
            stderr,
            reason,
            started_at: startedAt,
            duration_ms: Math.max(0, Math.round(performance.now() - started)),
            truncated: reason === "output-limit",
            output_complete: reason === "completed",
            result_available: true,
          }
        } catch (cause) {
          return {
            command,
            exit_code: null,
            stdout: "",
            stderr: (cause instanceof Error
              ? cause.message
              : String(cause)
            ).slice(0, 4096),
            reason:
              stopped || options.signal?.aborted
                ? "cancelled"
                : "execution-error",
            started_at: startedAt,
            duration_ms: Math.max(0, Math.round(performance.now() - started)),
            truncated: false,
            output_complete: false,
            result_available: false,
          }
        }
      }
      const running = await launch(
        isolation.shell,
        [
          "--noprofile",
          "--norc",
          "-c",
          `ulimit -c 0; ulimit -f 131072; ulimit -n 1024; ${command}`,
        ],
        { env, deadlineMs }
      )
      if (!background) return commandText(await running.process.result)
      try {
        await running.process.started
      } catch (error) {
        await running.process.stop()
        throw error
      }
      ensureRunning()
      if (!processes.has(running.process))
        throw new Error("Background command exited")
      for (const port of ports) backgrounds.set(port, running)
      return null
    }
    if (method === "get_endpoint") {
      const port = validPort(params.port)
      const running = backgrounds.get(port)
      if (!running || !processes.has(running.process))
        throw new Error(
          "Port is not registered by a running background command"
        )
      if (isolation.kind === "bubblewrap" && options.permissionMode !== "full")
        throw new Error(
          "Network-isolated Linux sessions do not expose host endpoints"
        )
      if (
        !running.process.pid ||
        !(await localPortOwned(port, running.process.pid, cwd))
      ) {
        throw new Error(
          "Registered loopback endpoint is not ready or is owned by another process"
        )
      }
      ensureRunning()
      if (!backgrounds.has(port)) throw new Error("Background command exited")
      return { url: `http://127.0.0.1:${port}`, headers: {} }
    }
    throw new Error(`Unsupported execution method: ${method}`)
  }
  try {
    const probe = await launch(
      isolation.shell,
      [
        "--noprofile",
        "--norc",
        "-c",
        `${`'${isolation.node.replace(/'/g, "'\\''")}'`} -e 'process.stdout.write("isolation-ok")'`,
      ],
      { deadlineMs: 10000 }
    )
    const result = await probe.process.result
    if (result.code !== 0 || result.stdout !== "isolation-ok" || result.reason)
      throw new Error(
        `OS isolation or standalone Node helper unavailable: ${result.stderr.slice(0, 4096)}`
      )
    ensureRunning()
    return { cwd, handle, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
