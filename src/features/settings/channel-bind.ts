import type { TranslationKey } from "@/lib/i18n"
import { z } from "zod"

import {
  CHANNEL_TYPES,
  type ChannelBindOption,
  type ChannelItem,
  type ChannelType,
  type ChannelQrcodeStatus,
  type ChannelWriteBody,
  type ResourceStatus,
} from "@/lib/types"

export const channelBindSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  name: z.string(),
  values: z.record(z.string(), z.string()),
  discordAccess: z.object({
    allowAllChannels: z.boolean(),
    allowedChannelIds: z.string(),
    allowedUserIds: z.string(),
  }),
})

export const EMPTY_CHANNEL_BIND = {
  type: "feishu" as const,
  name: "",
  values: {} as Record<string, string>,
  discordAccess: discordChannelAccessFromConfig(null),
}

export type DiscordChannelAccessValues = {
  allowAllChannels: boolean
  allowedChannelIds: string
  allowedUserIds: string
}

export class DiscordChannelAccessError extends Error {
  constructor() {
    super("channels.discordIdsInvalid")
    this.name = "DiscordChannelAccessError"
  }
}

const DISCORD_ACCESS_CONFIG_KEYS = new Set([
  "allow_all_channels",
  "allowed_channel_ids",
  "allowed_user_ids",
])

export type ChannelConfigField = {
  key: string
  label: string
  secret?: boolean
}

export type ChannelTypeMeta = {
  type: ChannelType
  label: TranslationKey
  hint: TranslationKey
  qrcode: boolean
  fields: ChannelConfigField[]
}

const CHANNEL_TYPE_DISPLAY: Record<
  ChannelType,
  { label: TranslationKey; hint: TranslationKey }
> = {
  feishu: {
    label: "common.feishu",
    hint: "channels.feishuSetupHint",
  },
  wechat: {
    label: "common.wechat",
    hint: "channels.wechatSetupHint",
  },
  wecom: {
    label: "common.wecom",
    hint: "channels.wecomSetupHint",
  },
  dingtalk: {
    label: "common.dingtalk",
    hint: "channels.dingtalkSetupHint",
  },
  qq: {
    label: "common.qq",
    hint: "channels.qqSetupHint",
  },
  telegram: {
    label: "common.telegram",
    hint: "channels.telegramSetupHint",
  },
  discord: {
    label: "common.discord",
    hint: "channels.discordSetupHint",
  },
}

const CHANNEL_CONFIG_FIELD_META: Record<
  string,
  { label: string; secret?: boolean }
> = {
  app_id: { label: "App ID" },
  app_secret: { label: "App Secret", secret: true },
  app_key: { label: "App Key" },
  token: { label: "Token", secret: true },
  bot_token: { label: "Bot Token", secret: true },
  bot_id: { label: "Bot ID" },
  secret: { label: "Secret", secret: true },
}

/* 兜底字段对齐后端原生网关的 CHANNEL_BIND_OPTIONS */
export const FALLBACK_CHANNEL_BIND_OPTIONS: readonly ChannelBindOption[] = [
  { type: "feishu", qrcode: true, config_keys: ["app_id", "app_secret"] },
  {
    type: "wechat",
    qrcode: true,
    config_keys: ["bot_token"],
  },
  { type: "wecom", qrcode: true, config_keys: ["bot_id", "secret"] },
  { type: "dingtalk", qrcode: true, config_keys: ["app_key", "app_secret"] },
  { type: "qq", qrcode: true, config_keys: ["app_id", "app_secret"] },
  { type: "telegram", qrcode: false, config_keys: ["bot_token"] },
  { type: "discord", qrcode: false, config_keys: ["bot_token"] },
]

export function isChannelType(value: string): value is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(value)
}

function isChannelBindOption(
  value: unknown
): value is ChannelBindOption {
  if (!value || typeof value !== "object") {
    return false
  }
  const item = value as Partial<ChannelBindOption>
  return (
    typeof item.type === "string" &&
    isChannelType(item.type) &&
    typeof item.qrcode === "boolean" &&
    Array.isArray(item.config_keys) &&
    item.config_keys.every((key) => typeof key === "string")
  )
}

export function normalizeChannelBindOptions(
  options: readonly ChannelBindOption[] | null | undefined
): ChannelBindOption[] {
  const valid = (options ?? []).filter(isChannelBindOption)
  return valid.length > 0 ? valid : [...FALLBACK_CHANNEL_BIND_OPTIONS]
}

export function resolveChannelBindMeta(
  option: ChannelBindOption
): ChannelTypeMeta {
  const display = CHANNEL_TYPE_DISPLAY[option.type]
  return {
    type: option.type,
    label: display.label,
    hint: display.hint,
    qrcode: option.qrcode,
    fields: option.config_keys
      .filter(
        (key) =>
          option.type !== "discord" || !DISCORD_ACCESS_CONFIG_KEYS.has(key)
      )
      .map((key) => {
        const field = CHANNEL_CONFIG_FIELD_META[key]
        return {
          key,
          label: field?.label ?? key,
          secret: field?.secret,
        }
      }),
  }
}

export const CHANNEL_TYPE_META: readonly ChannelTypeMeta[] =
  FALLBACK_CHANNEL_BIND_OPTIONS.map(resolveChannelBindMeta)

export function boundChannelForType(
  channels: readonly ChannelItem[],
  type: ChannelType
): ChannelItem | undefined {
  return channels.find((item) => item.type === type)
}

export function configFromFields(
  fields: readonly ChannelConfigField[],
  values: Record<string, string>
): Record<string, string> {
  const config: Record<string, string> = {}
  for (const field of fields) {
    const value = values[field.key]?.trim()
    if (value) {
      config[field.key] = value
    }
  }
  return config
}

export function valuesFromConfig(
  fields: readonly ChannelConfigField[],
  config: Record<string, unknown> | null | undefined
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    const raw = config?.[field.key]
    values[field.key] = typeof raw === "string" ? raw : ""
  }
  return values
}

function discordChannelIdTokens(value: string): string[] {
  return value
    .split(/[,，\r\n]+/)
    .map((id) => id.trim())
    .filter(Boolean)
}

export function isValidDiscordChannelIds(value: string): boolean {
  return discordChannelIdTokens(value).every((id) => /^[0-9]+$/.test(id))
}

function discordChannelIdsText(value: unknown): string {
  if (typeof value === "string") return value
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string").join("\n")
    : ""
}

export function discordChannelAccessFromConfig(
  config: Record<string, unknown> | null | undefined
): DiscordChannelAccessValues {
  return {
    allowAllChannels: config?.allow_all_channels !== false,
    allowedChannelIds: discordChannelIdsText(config?.allowed_channel_ids),
    allowedUserIds: discordChannelIdsText(config?.allowed_user_ids),
  }
}

export function withDiscordChannelAccessConfig(
  config: Record<string, unknown> | null | undefined,
  value: DiscordChannelAccessValues
): Record<string, unknown> {
  if (
    !isValidDiscordChannelIds(value.allowedChannelIds) ||
    !isValidDiscordChannelIds(value.allowedUserIds)
  ) {
    throw new DiscordChannelAccessError()
  }
  return {
    ...config,
    allow_all_channels: value.allowAllChannels,
    allowed_channel_ids: [
      ...new Set(discordChannelIdTokens(value.allowedChannelIds)),
    ],
    allowed_user_ids: [
      ...new Set(discordChannelIdTokens(value.allowedUserIds)),
    ],
  }
}

export function channelFlagEnabled(value: boolean | undefined): boolean {
  return value !== false
}

export function toChannelWriteBody(
  channel: Pick<
    ChannelItem,
    "name" | "type" | "config" | "status" | "show_thinking" | "show_tool_hints"
  >,
  patch: Partial<
    Pick<
      ChannelWriteBody,
      "config" | "status" | "show_thinking" | "show_tool_hints"
    >
  > = {}
): ChannelWriteBody | null {
  if (!isChannelType(channel.type)) {
    return null
  }
  return {
    name: channel.name,
    type: channel.type,
    config: patch.config ?? channel.config ?? {},
    status: (patch.status ?? channel.status) as ResourceStatus,
    show_thinking:
      patch.show_thinking ?? channelFlagEnabled(channel.show_thinking),
    show_tool_hints:
      patch.show_tool_hints ?? channelFlagEnabled(channel.show_tool_hints),
  }
}

export function channelQrcodeStatusKey(
  status: ChannelQrcodeStatus
): TranslationKey {
  if (status === "scanned") {
    return "common.scannedConfirmOnYourPhone"
  }
  if (status === "confirmed") {
    return "common.scanBindingSucceeded"
  }
  if (status === "expired") {
    return "common.qrCodeExpired"
  }
  if (status === "error") {
    return "common.couldNotGetTheQrCode"
  }
  return "common.scanWithTheMatchingApp"
}

export function qrcodeImageSrc(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(trimmed) ? trimmed : null
  }
  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length >= 80) {
    return `data:image/png;base64,${trimmed}`
  }
  return null
}

export function qrcodePageUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }
  return qrcodeImageSrc(trimmed) ? null : trimmed
}
