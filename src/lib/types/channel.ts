export const CHANNEL_TYPES = [
  "feishu",
  "wechat",
  "wecom",
  "dingtalk",
  "qq",
  "telegram",
  "discord",
] as const

export type ChannelType = (typeof CHANNEL_TYPES)[number]

export type ResourceStatus = 0 | 1

export type ChannelQrcodeStatus =
  "wait" | "scanned" | "confirmed" | "expired" | "error"

export type ChannelItem = {
  id: number
  name: string
  type: ChannelType | string
  config: Record<string, unknown> | null
  status: ResourceStatus
  show_thinking?: boolean
  show_tool_hints?: boolean
  user_id?: number
  created_time?: string
  updated_time?: string | null
}

export type ChannelWriteBody = {
  name: string
  type: ChannelType
  config?: Record<string, unknown> | null
  status: ResourceStatus
  show_thinking?: boolean
  show_tool_hints?: boolean
}

export type ChannelBindOption = {
  type: ChannelType
  qrcode: boolean
  config_keys: string[]
}

export type ChannelQrcodePollBody = {
  session_id: string
}

export type ChannelQrcodeDetail = {
  session_id: string
  type: ChannelType
  status: ChannelQrcodeStatus
  qrcode_url: string | null
  expire_in: number | null
  channel: ChannelItem | null
  error: string | null
}
