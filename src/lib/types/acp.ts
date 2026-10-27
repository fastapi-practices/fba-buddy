export type AcpLaunchConfig = {
  command: string
  args: string[]
  cwd?: string
}

export type AcpCheckResult = {
  available: boolean
  message: string
  code: string
  latency_ms: number
}
