export type SlashEntry = "web" | "im"

export type SlashCommandItem = {
  name: string
  description: string
  entries: SlashEntry[]
}

export type SlashExecuteBody = {
  command: string
  conversation_id?: string | null
  args?: string | null
  origin?: SlashEntry
  draft?: string | null
}

export type SlashExecuteResult = {
  command: string
  message: string
  data?: Record<string, unknown> | null
}
