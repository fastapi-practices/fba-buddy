import path from "node:path"
import type {
  ExecutionSettings,
  ExecutionStatus,
  RuntimeStatus,
} from "../src/shared/execution"
import { getExecutionCapabilities } from "./execution-isolation"
import { createRuntimeManager } from "./runtimes"

export async function desktopExecutionStatus(
  config: ExecutionSettings,
  paths: { home: string; documents: string; runtimeDirectory: string }
): Promise<ExecutionStatus> {
  const [capabilities, managed] = await Promise.all([
    getExecutionCapabilities({
      runtimeDirectory: paths.runtimeDirectory,
    }),
    createRuntimeManager({ directory: paths.runtimeDirectory }).status(),
  ])
  const managedStatus = (name: "python" | "node"): RuntimeStatus => {
    const runtime = managed[name]
    return {
      available: runtime.installed,
      path: runtime.executable,
      version: runtime.installed ? (runtime.version ?? undefined) : undefined,
      reason: runtime.message,
      source: "managed",
    }
  }
  return {
    config,
    homeWorkspace: path.join(paths.home, ".fbabuddy"),
    documentsWorkspace: path.join(paths.documents, "FbaBuddy"),
    local: {
      available: capabilities.local.available,
      reason: capabilities.local.message,
      kind: capabilities.local.isolation ?? undefined,
    },
    runtimes: {
      python: managedStatus("python"),
      node: managedStatus("node"),
    },
  }
}
