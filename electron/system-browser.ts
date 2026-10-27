export async function openSystemBrowser(
  input: unknown,
  launch: (url: string) => Promise<void>
): Promise<void> {
  if (typeof input !== "string" || !/^https?:\/\//i.test(input)) {
    throw new Error("仅支持 HTTP 和 HTTPS 网页地址")
  }
  const url = new URL(input)
  const hasInvalidCharacter = [...input].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 32 || code === 127
  })
  if (url.username || url.password || hasInvalidCharacter) {
    throw new Error("无效的网页地址")
  }
  await launch(input)
}
