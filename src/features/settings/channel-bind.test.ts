import { describe, expect, it } from "vitest"

import {
  boundChannelForType,
  channelBindSchema,
  CHANNEL_TYPE_META,
  channelQrcodeStatusKey,
  configFromFields,
  DiscordChannelAccessError,
  discordChannelAccessFromConfig,
  EMPTY_CHANNEL_BIND,
  isValidDiscordChannelIds,
  isChannelType,
  normalizeChannelBindOptions,
  qrcodeImageSrc,
  qrcodePageUrl,
  resolveChannelBindMeta,
  toChannelWriteBody,
  valuesFromConfig,
  withDiscordChannelAccessConfig,
} from "@/features/settings/channel-bind"

describe("channel-bind", () => {
  it("keeps product bind types without assistant_id", () => {
    expect(CHANNEL_TYPE_META.map((item) => item.type)).toEqual([
      "feishu",
      "wechat",
      "wecom",
      "dingtalk",
      "qq",
      "telegram",
      "discord",
    ])
    expect(isChannelType("feishu")).toBe(true)
    expect(isChannelType("assistant")).toBe(false)
    expect(CHANNEL_TYPE_META[0]?.qrcode).toBe(true)
    expect(
      CHANNEL_TYPE_META.find((item) => item.type === "telegram")?.qrcode
    ).toBe(false)
  })

  it("uses backend bind-option config keys", () => {
    const fields = CHANNEL_TYPE_META[0]?.fields ?? []
    expect(fields.map((item) => item.key)).toEqual(["app_id", "app_secret"])
    expect(
      configFromFields(fields, {
        app_id: " cli ",
        app_secret: "  ",
      })
    ).toEqual({ app_id: "cli" })
    expect(valuesFromConfig(fields, { app_id: "cli" })).toEqual({
      app_id: "cli",
      app_secret: "",
    })
  })

  it("falls back when bind-options are empty or invalid", () => {
    expect(normalizeChannelBindOptions([])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "feishu", qrcode: true }),
      ])
    )
    expect(
      normalizeChannelBindOptions(undefined).map((item) => item.type)
    ).toEqual(CHANNEL_TYPE_META.map((item) => item.type))
  })

  it("merges bind-option keys with field labels", () => {
    const meta = resolveChannelBindMeta({
      type: "wecom",
      qrcode: true,
      config_keys: ["bot_id", "secret"],
    })
    expect(meta.fields).toEqual([
      { key: "bot_id", label: "Bot ID", secret: undefined },
      { key: "secret", label: "Secret", secret: true },
    ])
  })

  it("keeps Discord access options separate from credential inputs", () => {
    const meta = resolveChannelBindMeta({
      type: "discord",
      qrcode: false,
      config_keys: [
        "bot_token",
        "allow_all_channels",
        "allowed_channel_ids",
        "allowed_user_ids",
      ],
    })
    expect(meta.fields).toEqual([
      { key: "bot_token", label: "Bot Token", secret: true },
    ])
  })

  it("defaults Discord bindings without access options to all channels and no DMs", () => {
    const form = channelBindSchema.parse({
      ...EMPTY_CHANNEL_BIND,
      type: "discord",
      values: { bot_token: " token " },
    })
    const access = discordChannelAccessFromConfig({ bot_token: "token" })
    expect(form.discordAccess).toEqual(access)
    expect(
      withDiscordChannelAccessConfig({ bot_token: "token" }, access)
    ).toEqual({
      bot_token: "token",
      allow_all_channels: true,
      allowed_channel_ids: [],
      allowed_user_ids: [],
    })
  })

  it("parses Discord ID lists without losing Snowflake precision or other config", () => {
    const config = {
      bot_token: "secret",
      bot_id: "1234567890123456789",
      relay: { signature: "existing-setting" },
      allow_all_channels: false,
      allowed_channel_ids: ["1234567890123456789", "2234567890123456789"],
      allowed_user_ids: ["3234567890123456789"],
    }
    expect(discordChannelAccessFromConfig(config)).toEqual({
      allowAllChannels: false,
      allowedChannelIds: "1234567890123456789\n2234567890123456789",
      allowedUserIds: "3234567890123456789",
    })
    expect(
      withDiscordChannelAccessConfig(config, {
        allowAllChannels: false,
        allowedChannelIds:
          " 1234567890123456789，2234567890123456789\n1234567890123456789,\r\n ",
        allowedUserIds:
          "3234567890123456789, 4234567890123456789\n3234567890123456789",
      })
    ).toEqual({
      ...config,
      allowed_channel_ids: ["1234567890123456789", "2234567890123456789"],
      allowed_user_ids: ["3234567890123456789", "4234567890123456789"],
    })
  })

  it("rejects Discord IDs outside ASCII digits before submitting config", () => {
    const empty = discordChannelAccessFromConfig(null)
    expect(isValidDiscordChannelIds("\n,， ")).toBe(true)
    for (const invalid of ["123 abc", "-123", "1.2", "１２３", "abc"]) {
      expect(isValidDiscordChannelIds(invalid)).toBe(false)
      expect(() =>
        withDiscordChannelAccessConfig(
          {},
          {
            ...empty,
            allowedChannelIds: `123,${invalid}`,
          }
        )
      ).toThrow(DiscordChannelAccessError)
      expect(() =>
        withDiscordChannelAccessConfig(
          {},
          {
            ...empty,
            allowedUserIds: invalid,
          }
        )
      ).toThrow("channels.discordIdsInvalid")
    }
  })

  it("writes channel updates with thinking and tool hint flags", () => {
    expect(
      toChannelWriteBody({
        name: "飞书",
        type: "feishu",
        config: { app_id: "cli" },
        status: 1,
      })
    ).toEqual({
      name: "飞书",
      type: "feishu",
      config: { app_id: "cli" },
      status: 1,
      show_thinking: true,
      show_tool_hints: true,
    })
    expect(
      toChannelWriteBody(
        {
          name: "飞书",
          type: "feishu",
          config: { app_id: "cli" },
          status: 1,
          show_thinking: true,
          show_tool_hints: true,
        },
        { status: 0, show_thinking: false }
      )
    ).toMatchObject({ status: 0, show_thinking: false, show_tool_hints: true })
    expect(
      toChannelWriteBody(
        {
          name: "Discord",
          type: "discord",
          config: { bot_token: "token" },
          status: 1,
          show_thinking: false,
          show_tool_hints: true,
        },
        {
          config: {
            bot_token: "token",
            allow_all_channels: false,
            allowed_channel_ids: ["1234567890123456789"],
            allowed_user_ids: [],
          },
        }
      )
    ).toEqual({
      name: "Discord",
      type: "discord",
      config: {
        bot_token: "token",
        allow_all_channels: false,
        allowed_channel_ids: ["1234567890123456789"],
        allowed_user_ids: [],
      },
      status: 1,
      show_thinking: false,
      show_tool_hints: true,
    })
    expect(
      toChannelWriteBody({
        name: "x",
        type: "assistant",
        config: null,
        status: 1,
      })
    ).toBeNull()
  })

  it("treats image payloads as img src and leaves scan URLs for QR encoding", () => {
    expect(qrcodeImageSrc("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    )
    expect(qrcodeImageSrc("https://cdn.example/qr.png")).toBe(
      "https://cdn.example/qr.png"
    )
    expect(qrcodeImageSrc("https://weixin.qq.com/x/demo")).toBeNull()
    expect(
      qrcodeImageSrc(
        "https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=NXHA-4PKH-PETX&source=OPEN_CLAW"
      )
    ).toBeNull()
    expect(
      qrcodeImageSrc(
        "https://q.qq.com/qqbot/openclaw/connect.html?task_id=700bfffc-763f-4aff-8b57-251d5f55b4e0&source=ai-buddy&_wv=2"
      )
    ).toBeNull()
    expect(qrcodeImageSrc("a".repeat(80))).toMatch(/^data:image\/png;base64,/)
    expect(
      qrcodePageUrl(
        "https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=NXHA-4PKH-PETX&source=OPEN_CLAW"
      )
    ).toBe(
      "https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=NXHA-4PKH-PETX&source=OPEN_CLAW"
    )
    expect(qrcodePageUrl("https://cdn.example/qr.png")).toBeNull()
  })

  it("finds the bound channel for a bind-option type", () => {
    expect(
      boundChannelForType(
        [
          {
            id: 2,
            name: "钉钉",
            type: "dingtalk",
            config: {},
            status: 1,
          },
          {
            id: 1,
            name: "飞书",
            type: "feishu",
            config: { app_id: "cli" },
            status: 1,
          },
        ],
        "feishu"
      )?.id
    ).toBe(1)
    expect(boundChannelForType([], "wechat")).toBeUndefined()
  })

  it("maps qrcode poll status to copy keys", () => {
    expect(channelQrcodeStatusKey("wait")).toBe("common.scanWithTheMatchingApp")
    expect(channelQrcodeStatusKey("scanned")).toBe(
      "common.scannedConfirmOnYourPhone"
    )
    expect(channelQrcodeStatusKey("confirmed")).toBe(
      "common.scanBindingSucceeded"
    )
    expect(channelQrcodeStatusKey("expired")).toBe("common.qrCodeExpired")
    expect(channelQrcodeStatusKey("error")).toBe("common.couldNotGetTheQrCode")
  })
})
