import type { ResourceStatus } from "@/lib/types/channel"

export type CronItem = {
  id: number
  name: string
  conversation_id: string
  trigger: string
  prompt: string
  fresh_thread?: boolean
  provider_id?: number | null
  model_id?: string | null
  mcp_ids?: number[]
  status: ResourceStatus
  user_id?: number
  last_run_time?: string | null
  last_status?: "ok" | "error" | null
  last_error?: string | null
  created_time?: string
  updated_time?: string | null
}

export type CronWriteBody = {
  name?: string | null
  conversation_id: string
  trigger: string
  prompt: string
  fresh_thread: boolean
  provider_id?: number | null
  model_id?: string | null
  mcp_ids: number[]
  status: ResourceStatus
}
