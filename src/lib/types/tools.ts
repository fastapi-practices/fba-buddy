import type { ForwardedProps } from "@/lib/types/chat"

export type WebSearchOption = {
  type: NonNullable<ForwardedProps["web_search"]>
  name: string
  status: 0 | 1
  key_status: 0 | 1
}

export type McpItem = {
  id: number
  name: string
  description: string | null
  type: number
  command?: string | null
  url?: string | null
  headers?: Record<string, string> | null
  args?: string[] | null
  env?: Record<string, string> | null
  timeout?: number
  read_timeout?: number
  tool_prefix?: string | null
  include_instructions?: boolean
  user_id?: number
}

export type McpWriteBody = {
  name: string
  type: number
  description?: string | null
  command?: string | null
  url?: string | null
  headers?: Record<string, string> | null
  args?: string[] | null
  env?: Record<string, string> | null
  timeout?: number
  read_timeout?: number
  tool_prefix?: string | null
  include_instructions?: boolean
}

export type QuickPhraseItem = {
  id: number
  title: string
  content: string
  sort: number
  user_id?: number
}

export type QuickPhraseWriteBody = {
  title: string
  content: string
  sort?: number
}
