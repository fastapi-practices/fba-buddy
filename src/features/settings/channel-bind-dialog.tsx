import { useId, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Controller, type UseFormReturn } from "react-hook-form"
import type { z } from "zod"

import {
  cancelChannelQrcode,
  createChannel,
  generateChannelQrcode,
  pollChannelQrcode,
} from "@/api"
import { ApiError, apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FormFieldError } from "@/components/form-field-error"
import {
  channelBindSchema,
  channelQrcodeStatusKey,
  configFromFields,
  DiscordChannelAccessError,
  EMPTY_CHANNEL_BIND,
  FALLBACK_CHANNEL_BIND_OPTIONS,
  normalizeChannelBindOptions,
  resolveChannelBindMeta,
  withDiscordChannelAccessConfig,
} from "@/features/settings/channel-bind"
import { DiscordChannelAccessFields } from "@/features/settings/discord-channel-access"
import { ChannelQrcodeImage } from "@/features/settings/channel-qrcode"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import type {
  ChannelBindOption,
  ChannelQrcodeStatus,
  ChannelType,
} from "@/lib/types"

type BindMode = "qrcode" | "manual"
type ChannelBindValues = z.infer<typeof channelBindSchema>

const TERMINAL_QRCODE_STATUSES = new Set<ChannelQrcodeStatus>([
  "confirmed",
  "expired",
  "error",
])

export function BindChannelDialog({
  open,
  onOpenChange,
  onBound,
  options,
  channelType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBound: () => Promise<unknown> | void
  options: readonly ChannelBindOption[]
  channelType: ChannelType
}) {
  const t = useT()
  const formId = useId()
  const bindOptions = useMemo(
    () => normalizeChannelBindOptions(options),
    [options]
  )
  const initialType = channelType
  const initialOption =
    bindOptions.find((item) => item.type === initialType) ??
    bindOptions[0] ??
    FALLBACK_CHANNEL_BIND_OPTIONS[0]
  const form = useZodForm(channelBindSchema, {
    defaultValues: {
      ...EMPTY_CHANNEL_BIND,
      type: initialType,
    },
  })
  const type = form.watch("type")
  const values = form.watch("values")
  const meta = useMemo(() => {
    const option =
      bindOptions.find((item) => item.type === type) ?? initialOption
    return resolveChannelBindMeta(option)
  }, [bindOptions, initialOption, type])
  const [bindMode, setBindMode] = useState<BindMode>(
    initialOption.qrcode ? "qrcode" : "manual"
  )
  const [qrNonce, setQrNonce] = useState(0)
  const qrcodeMode = open && bindMode === "qrcode" && meta.qrcode

  const generateQuery = useQuery({
    queryKey: [...queryKeys.channelQrcode(type, qrNonce), formId],
    queryFn: () => generateChannelQrcode(type),
    enabled: qrcodeMode,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const sessionId = generateQuery.data?.session_id
  const qrcode = generateQuery.data

  function cancelQrcodeSession() {
    if (sessionId) {
      void cancelChannelQrcode(type, { session_id: sessionId }).catch(
        () => undefined
      )
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      cancelQrcodeSession()
      form.reset(EMPTY_CHANNEL_BIND)
      setBindMode("qrcode")
      setQrNonce(0)
    }
    onOpenChange(next)
  }

  const pollQuery = useQuery({
    queryKey: queryKeys.channelQrcodePoll(type, sessionId ?? ""),
    queryFn: async () => {
      try {
        const next = await pollChannelQrcode(type, {
          session_id: sessionId ?? "",
        })
        if (next.status === "confirmed") {
          await onBound()
          handleOpenChange(false)
        }
        return next
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.code === 404 || error.message.includes("不存在或已过期"))
        ) {
          return {
            session_id: sessionId ?? "",
            type,
            status: "expired" as const,
            qrcode_url: qrcode?.qrcode_url ?? null,
            expire_in: 0,
            channel: null,
            error: "二维码已过期，请重新扫码",
          }
        }
        throw error
      }
    },
    enabled: Boolean(
      qrcodeMode &&
      sessionId &&
      !TERMINAL_QRCODE_STATUSES.has(qrcode?.status ?? "wait")
    ),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      if (query.state.error) {
        return false
      }
      return TERMINAL_QRCODE_STATUSES.has(query.state.data?.status ?? "wait")
        ? false
        : 2000
    },
  })
  const liveQrcode = pollQuery.data ?? qrcode

  async function onSubmit(data: ChannelBindValues) {
    try {
      const credentials = configFromFields(meta.fields, data.values)
      const config =
        meta.type === "discord"
          ? withDiscordChannelAccessConfig(credentials, data.discordAccess)
          : credentials
      await createChannel({
        name: data.name.trim() || t(meta.label),
        type: meta.type,
        config,
        status: 1,
        show_thinking: true,
        show_tool_hints: true,
      })
      await onBound()
      handleOpenChange(false)
    } catch (error) {
      notifyError(
        error instanceof DiscordChannelAccessError
          ? t("channels.discordIdsInvalid")
          : apiErrorMessage(error, t("common.couldNotBindTheChannel"))
      )
    }
  }

  const qrBusy = generateQuery.isLoading || generateQuery.isFetching
  const qrStatus = liveQrcode
    ? liveQrcode.status === "error" && liveQrcode.error?.trim()
      ? liveQrcode.error
      : t(channelQrcodeStatusKey(liveQrcode.status))
    : generateQuery.isError
      ? apiErrorMessage(generateQuery.error, t("common.couldNotGetTheQrCode"))
      : t("common.scanWithTheMatchingApp")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("common.bindName", { name: t(meta.label) })}
          </DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((data) => onSubmit(data))(event)
          }}
        >
          <FieldGroup>
            {meta.qrcode ? (
              <Tabs
                value={bindMode}
                onValueChange={(value) => {
                  if (value === "qrcode" || value === "manual") {
                    setBindMode(value)
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="qrcode">
                    {t("common.scanToBind")}
                  </TabsTrigger>
                  <TabsTrigger value="manual">
                    {t("common.fillInManually")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="qrcode" className="pt-3">
                  <div className="flex flex-col items-center gap-3">
                    {qrBusy || !liveQrcode?.qrcode_url ? (
                      <div className="flex size-48 items-center justify-center rounded-lg bg-muted">
                        {generateQuery.isError ? null : <Spinner />}
                      </div>
                    ) : (
                      <ChannelQrcodeImage
                        value={liveQrcode.qrcode_url}
                        label={t("common.scanToBind")}
                      />
                    )}
                    <p className="text-center text-sm text-muted-foreground">
                      {qrStatus}
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="manual" className="pt-3">
                  <ManualChannelFields
                    form={form}
                    meta={meta}
                    values={values}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <ManualChannelFields form={form} meta={meta} values={values} />
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          {bindMode === "qrcode" && meta.qrcode ? (
            <Button
              type="button"
              variant="outline"
              disabled={qrBusy}
              onClick={() => {
                cancelQrcodeSession()
                setQrNonce((value) => value + 1)
              }}
            >
              {qrBusy ? <Spinner data-icon="inline-start" /> : null}
              {t("common.scanAgain")}
            </Button>
          ) : (
            <Button
              type="submit"
              form={formId}
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {t("common.bind")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualChannelFields({
  form,
  meta,
  values,
}: {
  form: UseFormReturn<ChannelBindValues>
  meta: ReturnType<typeof resolveChannelBindMeta>
  values: Record<string, string>
}) {
  const t = useT()
  return (
    <FieldGroup>
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor="channel-name">{t("common.name")}</FieldLabel>
            <Input
              {...field}
              id="channel-name"
              placeholder={t(meta.label)}
              aria-invalid={fieldState.invalid || undefined}
            />
            <FormFieldError fieldState={fieldState} />
          </Field>
        )}
      />
      {meta.fields.map((item) => (
        <Field key={item.key}>
          <FieldLabel htmlFor={`channel-${item.key}`}>{item.label}</FieldLabel>
          <Input
            id={`channel-${item.key}`}
            required
            type={item.secret ? "password" : "text"}
            autoComplete="off"
            value={values[item.key] ?? ""}
            onChange={(event) =>
              form.setValue("values", {
                ...values,
                [item.key]: event.target.value,
              })
            }
          />
        </Field>
      ))}
      {meta.type === "discord" ? (
        <Controller
          name="discordAccess"
          control={form.control}
          render={({ field }) => (
            <DiscordChannelAccessFields
              value={field.value}
              onChange={field.onChange}
              disabled={form.formState.isSubmitting}
              idPrefix="channel-discord-bind"
            />
          )}
        />
      ) : null}
    </FieldGroup>
  )
}
