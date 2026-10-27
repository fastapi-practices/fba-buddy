export type DevToolsKeyInput = {
  type: string
  key: string
  control: boolean
  alt: boolean
  meta: boolean
  shift: boolean
}

export function shouldToggleDevTools(
  input: DevToolsKeyInput,
  platform: NodeJS.Platform | string
): boolean {
  if (input.type !== "keyDown") {
    return false
  }
  if (input.key === "F12") {
    return true
  }
  if (input.key.toLowerCase() !== "i") {
    return false
  }
  if (platform === "darwin") {
    return input.meta && input.alt && !input.control && !input.shift
  }
  return input.control && input.shift && !input.alt && !input.meta
}
