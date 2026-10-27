import { translateCurrent } from "@/lib/i18n"
import type { RuntimeName } from "@/shared/execution"

const RUNTIME_INSTALL_PATTERNS = [
  /(?:^|Error: )Install the managed (node|python) runtime before local execution$/,
  /请先在设置 → (?:常规|运行环境) → 编码运行时中下载并安装 (Node\.js|Python)$/,
  /请在设置 → 运行环境 → 运行组件中安装 (Node\.js|Python)$/,
  /Install (Node\.js|Python) in Settings → Runtime environment → Runtime components$/,
] as const

function normalizeRuntime(value: string): RuntimeName | undefined {
  if (value === "node" || value === "Node.js") return "node"
  if (value === "python" || value === "Python") return "python"
  return undefined
}

export function codingRuntimeFromMessage(
  message: string
): RuntimeName | undefined {
  for (const pattern of RUNTIME_INSTALL_PATTERNS) {
    const runtime = message.match(pattern)?.[1]
    if (runtime) return normalizeRuntime(runtime)
  }
  return undefined
}

export function codingRuntimeInstallHint(message: string): string | undefined {
  const runtime = codingRuntimeFromMessage(message)
  if (!runtime) return undefined
  return translateCurrent("common.installManagedRuntimeBeforeLocalExecution", {
    name: runtime === "node" ? "Node.js" : "Python",
  })
}
