import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plug2Icon, UnplugIcon } from "lucide-react"
import { useState } from "react"

import {
  channelInboundUrl,
  deleteChannel,
  listChannelBindOptions,
  listChannels,
  updateChannel,
} from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { BindChannelDialog } from "@/features/settings/channel-bind-dialog"
import {
  boundChannelForType,
  channelFlagEnabled,
  DiscordChannelAccessError,
  discordChannelAccessFromConfig,
  normalizeChannelBindOptions,
  resolveChannelBindMeta,
  toChannelWriteBody,
  withDiscordChannelAccessConfig,
} from "@/features/settings/channel-bind"
import { ChannelLogo } from "@/features/settings/channel-logos"
import { DiscordChannelAccessFields } from "@/features/settings/discord-channel-access"
import { SettingsPageHeader } from "@/features/settings/settings-card"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type { TranslationKey } from "@/lib/i18n"
import type {
  ChannelBindOption,
  ChannelItem,
  ChannelType,
  ChannelWriteBody,
} from "@/lib/types"

const CHANNEL_PLATFORM_ORDER: ChannelType[] = [
  "wechat",
  "qq",
  "wecom",
  "feishu",
  "dingtalk",
  "telegram",
  "discord",
]

const CHANNEL_DESCRIPTIONS: Record<ChannelType, TranslationKey> = {
  wechat: "channels.wechatDescription",
  qq: "channels.qqDescription",
  wecom: "channels.wecomDescription",
  feishu: "channels.feishuDescription",
  dingtalk: "channels.dingtalkDescription",
  telegram: "channels.telegramDescription",
  discord: "channels.discordDescription",
}

const CHANNEL_CREDENTIAL_URLS: Partial<Record<ChannelType, string>> = {
  qq: "https://q.qq.com/qqbot/openclaw/",
  wecom: "https://work.weixin.qq.com/wework_admin/frame#/aiHelper/create",
  feishu: "https://open.feishu.cn/app",
  dingtalk: "https://open-dev.dingtalk.com/",
  telegram: "https://t.me/BotFather",
  discord: "https://discord.com/developers/applications",
}

export function ChannelSettings() {
  const t = useT()
  const queryClient = useQueryClient()
  const channels = useQuery({
    queryKey: queryKeys.channels(),
    queryFn: listChannels,
  })
  const bindOptions = useQuery({
    queryKey: queryKeys.channelBindOptions(),
    queryFn: listChannelBindOptions,
  })
  const [bindOpen, setBindOpen] = useState(false)
  const [bindType, setBindType] = useState<ChannelType>("feishu")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [managedType, setManagedType] = useState<ChannelType | null>(null)
  const items = channels.data ?? []
  const options = normalizeChannelBindOptions(bindOptions.data).sort(
    (a, b) =>
      CHANNEL_PLATFORM_ORDER.indexOf(a.type) -
      CHANNEL_PLATFORM_ORDER.indexOf(b.type)
  )
  const managedChannel = managedType
    ? boundChannelForType(items, managedType)
    : undefined
  const managedOption = options.find((option) => option.type === managedType)

  function openBind(type: ChannelType) {
    setBindType(type)
    setBindOpen(true)
  }

  async function patchChannel(
    channel: ChannelItem,
    patch: Partial<
      Pick<
        ChannelWriteBody,
        "config" | "status" | "show_thinking" | "show_tool_hints"
      >
    >
  ) {
    if (!canEditOwnedResource(channel.user_id) || busyId != null) {
      return false
    }
    const body = toChannelWriteBody(channel, patch)
    if (!body) {
      return false
    }
    setBusyId(channel.id)
    try {
      await updateChannel(channel.id, body)
      await queryClient.invalidateQueries({ queryKey: queryKeys.channels() })
      return true
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotUpdateTheChannel")))
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function unbind(channel: ChannelItem) {
    if (!canEditOwnedResource(channel.user_id) || busyId != null) {
      return
    }
    setBusyId(channel.id)
    try {
      await deleteChannel(channel.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.channels() })
      setManagedType(null)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotUnbindTheChannel")))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="absolute inset-0 overflow-y-auto">
      <div className="@container flex min-h-full flex-col gap-7 px-6 pt-8 pb-10 sm:px-8 xl:px-10">
        <SettingsPageHeader title={t("common.channels")} />
        {channels.isLoading || bindOptions.isLoading ? (
          <div className="grid grid-cols-1 gap-6 @min-[36rem]:grid-cols-2 @min-[56rem]:grid-cols-3 @min-[72rem]:grid-cols-4">
            {CHANNEL_PLATFORM_ORDER.map((type) => (
              <Skeleton key={type} className="h-60 rounded-2xl" />
            ))}
          </div>
        ) : channels.isError ? (
          <Card size="sm">
            <CardContent className="p-5 text-sm text-destructive">
              {apiErrorMessage(channels.error)}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 @min-[36rem]:grid-cols-2 @min-[56rem]:grid-cols-3 @min-[72rem]:grid-cols-4">
            {options.map((option) => {
              const channel = boundChannelForType(items, option.type)
              return (
                <ChannelPlatformCard
                  key={option.type}
                  option={option}
                  channel={channel}
                  busy={busyId != null}
                  onConfigure={() =>
                    channel
                      ? setManagedType(option.type)
                      : openBind(option.type)
                  }
                  onToggle={(checked) => {
                    if (channel) {
                      void patchChannel(channel, { status: checked ? 1 : 0 })
                    } else {
                      openBind(option.type)
                    }
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
      {managedChannel && managedOption ? (
        <ChannelDetailsDialog
          channel={managedChannel}
          option={managedOption}
          busy={busyId != null}
          onClose={() => setManagedType(null)}
          onPatch={(patch) => patchChannel(managedChannel, patch)}
          onUnbind={() => void unbind(managedChannel)}
        />
      ) : null}
      <BindChannelDialog
        key={`${bindOpen}-${bindType}`}
        open={bindOpen}
        channelType={bindType}
        onOpenChange={setBindOpen}
        options={options}
        onBound={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.channels() })
        }
      />
    </main>
  )
}

function ChannelPlatformCard({
  option,
  channel,
  busy,
  onConfigure,
  onToggle,
}: {
  option: ChannelBindOption
  channel: ChannelItem | undefined
  busy: boolean
  onConfigure: () => void
  onToggle: (checked: boolean) => void
}) {
  const t = useT()
  const meta = resolveChannelBindMeta(option)
  const active = channel?.status === 1
  const readOnly = channel != null && !canEditOwnedResource(channel.user_id)
  const credentialsUrl = CHANNEL_CREDENTIAL_URLS[option.type]

  return (
    <Card className="relative min-h-60 rounded-2xl bg-background [--card-spacing:--spacing(6)]">
      <Button
        type="button"
        variant="ghost"
        className="absolute inset-0 h-full w-full rounded-2xl"
        aria-label={t("common.configureName", { name: t(meta.label) })}
        onClick={onConfigure}
      >
        <span className="sr-only">{t(meta.label)}</span>
      </Button>
      <CardHeader className="pointer-events-none relative items-center gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ChannelLogo type={option.type} />
          <CardTitle className="truncate text-lg">{t(meta.label)}</CardTitle>
        </div>
        <CardAction className="pointer-events-auto self-center">
          <Switch
            className="[&_[data-slot=switch-thumb][data-unchecked]]:bg-muted-foreground"
            checked={active}
            disabled={busy || readOnly}
            onCheckedChange={onToggle}
            aria-label={`${t(meta.label)} ${t("common.channelStatus")}`}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="pointer-events-none relative flex flex-1 flex-col gap-5">
        <CardDescription className="flex flex-col gap-2 leading-6">
          <span>{t(CHANNEL_DESCRIPTIONS[option.type])}</span>
        </CardDescription>
        <div className="mt-auto flex min-w-0 items-center justify-between gap-3">
          <Badge
            variant={active ? "default" : "secondary"}
            data-enabled={active}
            className="data-[enabled=false]:text-muted-foreground"
          >
            <Plug2Icon />
            {t(active ? "status.enabled" : "channels.disabled")}
          </Badge>
          {credentialsUrl ? (
            <Button
              variant="link"
              size="sm"
              nativeButton={false}
              className="pointer-events-auto h-auto shrink-0 p-0"
              render={
                <a
                  href={credentialsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {t("channels.getCredentials")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ChannelDetailsDialog({
  option,
  channel,
  busy,
  onClose,
  onPatch,
  onUnbind,
}: {
  option: ChannelBindOption
  channel: ChannelItem
  busy: boolean
  onClose: () => void
  onPatch: (
    patch: Partial<
      Pick<
        ChannelWriteBody,
        "config" | "status" | "show_thinking" | "show_tool_hints"
      >
    >
  ) => Promise<boolean>
  onUnbind: () => void
}) {
  const t = useT()
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const meta = resolveChannelBindMeta(option)
  const owned = canEditOwnedResource(channel.user_id)
  const inbound = channelInboundUrl(channel.id)
  const [discordAccess, setDiscordAccess] = useState(() =>
    discordChannelAccessFromConfig(channel.config)
  )

  async function saveDiscordAccess() {
    try {
      const config = withDiscordChannelAccessConfig(
        channel.config,
        discordAccess
      )
      if (await onPatch({ config })) {
        setDiscordAccess(discordChannelAccessFromConfig(config))
      }
    } catch (error) {
      notifyError(
        error instanceof DiscordChannelAccessError
          ? t("channels.discordIdsInvalid")
          : apiErrorMessage(error, t("common.couldNotUpdateTheChannel"))
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ChannelLogo type={option.type} />
            {t(meta.label)}
            <Badge variant="outline">{t("common.bound")}</Badge>
            {!owned ? (
              <Badge variant="outline">{t("common.builtIn")}</Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>{channel.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {option.type === "discord" ? (
            <div className="flex flex-col gap-4">
              <DiscordChannelAccessFields
                value={discordAccess}
                onChange={setDiscordAccess}
                disabled={busy || !owned}
                idPrefix={`channel-discord-${channel.id}`}
              />
              {owned ? (
                <Button
                  type="button"
                  className="self-end"
                  disabled={busy}
                  onClick={() => void saveDiscordAccess()}
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  {t("common.saveSettings")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {inbound ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {t("channels.internalInboundUrl")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
                  {inbound}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(inbound)}
                >
                  {isCopied ? t("common.copied") : t("common.copy")}
                </Button>
              </div>
            </div>
          ) : null}
          {owned ? (
            <div className="flex flex-col gap-3">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`channel-thinking-${channel.id}`}>
                    {t("common.showThinking")}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  id={`channel-thinking-${channel.id}`}
                  checked={channelFlagEnabled(channel.show_thinking)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    onPatch({ show_thinking: checked })
                  }
                />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`channel-tool-hints-${channel.id}`}>
                    {t("common.showToolHints")}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  id={`channel-tool-hints-${channel.id}`}
                  checked={channelFlagEnabled(channel.show_tool_hints)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    onPatch({ show_tool_hints: checked })
                  }
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={onUnbind}
                >
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UnplugIcon data-icon="inline-start" />
                  )}
                  {t("common.unbind")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
