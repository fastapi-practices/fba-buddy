export function checkpointId(result: unknown): string | null {
  try {
    const value =
      typeof result === "string" ? (JSON.parse(result) as unknown) : result
    if (
      value &&
      typeof value === "object" &&
      "checkpoint_id" in value &&
      typeof value.checkpoint_id === "string"
    )
      return value.checkpoint_id
  } catch {
    /* 旧工具结果保留原始记录 */
  }
  return null
}
