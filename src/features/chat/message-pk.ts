/** 消息落库后才有 pk，本地生成的 id 不能用于分支、重生成、删除等接口 */
export function isPersistedMessagePk(
  pk: number | null | undefined
): pk is number {
  return typeof pk === "number" && Number.isSafeInteger(pk) && pk > 0
}
