import { spawn } from "node:child_process"

export type ExecutionProcessResult = {
  code: number
  exitCode: number | null
  stdout: string
  stderr: string
  reason?: "cancelled" | "deadline" | "output-limit"
}

export type ExecutionProcess = {
  readonly pid: number | undefined
  started: Promise<void>
  result: Promise<ExecutionProcessResult>
  stop: () => Promise<void>
}

export type ExecutionProcessOptions = {
  executable: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  input?: string
  deadlineMs: number
  maxOutputBytes: number
  signal?: AbortSignal
  cleanup?: () => Promise<void>
}

function signalProcess(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}

async function descendants(root: number): Promise<number[]> {
  if (process.platform === "win32") return []
  return new Promise((resolve) => {
    const child = spawn("/bin/ps", ["-axo", "pid=,ppid="], {
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
      stdio: ["ignore", "pipe", "ignore"],
    })
    let text = ""
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000)
    child.stdout.on("data", (chunk: Buffer) => {
      if (text.length < 1024 * 1024) text += chunk.toString()
      else child.kill("SIGKILL")
    })
    child.on("error", () => {
      clearTimeout(timer)
      resolve([])
    })
    child.on("close", () => {
      clearTimeout(timer)
      const rows = text
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/).map(Number))
      const found = new Set([root])
      for (let changed = true; changed;) {
        changed = false
        for (const [pid, parent] of rows) {
          if (pid && parent && found.has(parent) && !found.has(pid)) {
            found.add(pid)
            changed = true
          }
        }
      }
      found.delete(root)
      resolve([...found].reverse())
    })
  })
}

export function launchExecutionProcess(
  options: ExecutionProcessOptions
): ExecutionProcess {
  if (options.signal?.aborted) throw new Error("Execution cancelled")
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: "pipe",
    shell: false,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let bytes = 0
  let reason: ExecutionProcessResult["reason"]
  let stopping: Promise<void> | undefined
  let resolveResult: (result: ExecutionProcessResult) => void
  let rejectResult: (error: Error) => void
  let tracking: Promise<void> | undefined
  const knownChildren = new Set<number>()
  const result = new Promise<ExecutionProcessResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  // A background command may fail before its caller observes the result.
  void result.catch(() => {})
  const started = new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve)
    child.once("error", reject)
  })
  void started.catch(() => {})
  const track = (): Promise<void> => {
    if (!child.pid) return Promise.resolve()
    if (tracking) return tracking
    tracking = descendants(child.pid)
      .then((pids) => {
        for (const pid of pids) knownChildren.add(pid)
      })
      .finally(() => {
        tracking = undefined
      })
    return tracking
  }
  const monitor = setInterval(() => void track(), 200)
  monitor.unref()
  const stop = (): Promise<void> => {
    if (stopping) return stopping
    clearInterval(monitor)
    clearTimeout(deadline)
    options.signal?.removeEventListener("abort", cancel)
    stopping = (async () => {
      await track()
      const pid = child.pid
      if (pid) {
        const targets = [-pid, ...knownChildren]
        for (const target of targets) signalProcess(target, "SIGTERM")
        let alive = false
        for (const target of targets) {
          try {
            process.kill(target, 0)
            alive = true
          } catch {
            /* The process has already exited. */
          }
        }
        if (alive) {
          await new Promise<void>((resolve) => setTimeout(resolve, 200))
          for (const target of targets) signalProcess(target, "SIGKILL")
        }
      }
      await options.cleanup?.()
    })()
    return stopping
  }
  const cancel = () => {
    reason ??= "cancelled"
    void stop().catch(rejectResult)
  }
  const deadline = setTimeout(() => {
    reason ??= "deadline"
    void stop().catch(rejectResult)
  }, options.deadlineMs)
  deadline.unref()
  options.signal?.addEventListener("abort", cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
    const available = Math.max(0, options.maxOutputBytes - bytes)
    bytes = Math.min(options.maxOutputBytes + 1, bytes + chunk.length)
    if (available)
      (stream === "stdout" ? stdout : stderr).push(chunk.subarray(0, available))
    if (bytes > options.maxOutputBytes) {
      reason ??= "output-limit"
      void stop().catch(rejectResult)
    }
  }
  child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk))
  child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk))
  child.stdin.on("error", () => {})
  child.stdin.end(options.input)
  child.once("error", (error) => {
    void stop().then(() => rejectResult(error), rejectResult)
  })
  child.once("exit", () => {
    void stop().catch(rejectResult)
  })
  child.once("close", (code) => {
    void stop().then(() => {
      resolveResult({
        code: code ?? -1,
        exitCode: code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        ...(reason ? { reason } : {}),
      })
    }, rejectResult)
  })
  return {
    get pid() {
      return child.pid
    },
    started,
    result,
    stop: () => {
      reason ??= "cancelled"
      return stop()
    },
  }
}

export async function executeBounded(options: ExecutionProcessOptions) {
  const child = launchExecutionProcess(options)
  return child.result
}
