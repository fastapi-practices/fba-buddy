import { useQuery } from "@tanstack/react-query"
import { useId, useMemo } from "react"
import { Controller } from "react-hook-form"

import { createCron, getModelOptions, listMcps, updateCron } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { FormFieldError } from "@/components/form-field-error"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CRON_NAME_MAX_LEN,
  CRON_PROMPT_MAX_LEN,
  cronEditorSchema,
  cronEditorValuesFromItem,
  CRON_MODEL_FOLLOW,
  cronWriteBodyFromEditor,
  dateTriggerToInput,
  SCHEDULE_PRESETS,
  type CronEditorValues,
  type CronIntervalUnit,
  type CronTriggerKind,
} from "@/features/chat/conversation-cron"
import { modelOptionId } from "@/features/chat/model-option"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import type { CronItem } from "@/lib/types"

export function CronEditorForm({
  item,
  initialValues,
  conversations,
  onOpenChange,
  onSaved,
  presentation = "dialog",
}: {
  item: CronItem | null
  initialValues?: CronEditorValues
  conversations: Array<{ id: string; title: string }>
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<unknown> | void
  presentation?: "dialog" | "inline"
}) {
  const t = useT()
  const formId = useId()
  const conversationItems = conversations.map((conversation) => ({
    value: conversation.id,
    label: conversation.title || conversation.id,
  }))
  const form = useZodForm(cronEditorSchema, {
    defaultValues:
      initialValues ?? cronEditorValuesFromItem(item, conversations[0]?.id),
  })
  const triggerKind = form.watch("triggerKind")
  const scheduleMode = form.watch("scheduleMode")
  const modelOptionsQuery = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })
  const mcpsQuery = useQuery({
    queryKey: queryKeys.mcps(),
    queryFn: listMcps,
  })
  const modelItems = useMemo(() => {
    const items = [{ value: CRON_MODEL_FOLLOW, label: t("common.followChat") }]
    for (const provider of modelOptionsQuery.data?.providers ?? []) {
      for (const model of provider.models) {
        if (model.kind && model.kind !== "chat") {
          continue
        }
        items.push({
          value: modelOptionId(provider.id, model.model_id),
          label: `${provider.name} / ${model.name || model.model_id}`,
        })
      }
    }
    return items
  }, [modelOptionsQuery.data, t])
  const mcpItems = useMemo(
    () =>
      (mcpsQuery.data ?? []).map((mcp) => ({
        value: String(mcp.id),
        label: mcp.name,
      })),
    [mcpsQuery.data]
  )
  const presetItems = SCHEDULE_PRESETS.map((preset) => ({
    value: preset.value,
    label: `${t(preset.label)} (${preset.cron})`,
  }))
  const intervalUnitItems: Array<{
    value: CronIntervalUnit
    label: string
  }> = [
    { value: "seconds", label: t("common.seconds") },
    { value: "minutes", label: t("common.minutes") },
    { value: "hours", label: t("common.hours") },
  ]

  async function onSubmit(values: CronEditorValues) {
    const body = cronWriteBodyFromEditor(values)
    try {
      if (item) {
        await updateCron(item.id, body)
      } else {
        await createCron(body)
      }
      await onSaved()
      onOpenChange(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotSaveTheSchedule")))
    }
  }

  const title = item
    ? t("common.editScheduledTask")
    : t("common.newScheduledTask")
  const editor = (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((values) => onSubmit(values))(event)
      }}
    >
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="cron-name">{t("common.name")}</FieldLabel>
              <Input
                {...field}
                id="cron-name"
                maxLength={CRON_NAME_MAX_LEN}
                placeholder={t(
                  "hints.optionalDefaultsToTheFirstLineOfThePrompt"
                )}
                aria-invalid={fieldState.invalid || undefined}
              />
              <FormFieldError fieldState={fieldState} />
            </Field>
          )}
        />
        <Controller
          name="conversationId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="cron-conversation">
                {t("common.chat")}
              </FieldLabel>
              <Select
                items={conversationItems}
                value={field.value || null}
                onValueChange={(value) => {
                  if (value) {
                    field.onChange(value)
                  }
                }}
              >
                <SelectTrigger
                  id="cron-conversation"
                  className="w-full"
                  aria-required
                  aria-invalid={fieldState.invalid || undefined}
                >
                  <SelectValue placeholder={t("common.chooseAnExistingChat")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {conversations.map((conversation) => (
                      <SelectItem key={conversation.id} value={conversation.id}>
                        {conversation.title || conversation.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormFieldError fieldState={fieldState} />
            </Field>
          )}
        />
        <Controller
          name="triggerKind"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>{t("common.scheduleType")}</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                aria-required
                value={[field.value]}
                onValueChange={(value) => {
                  const next = value[0] as CronTriggerKind | undefined
                  if (
                    next !== "cron" &&
                    next !== "interval" &&
                    next !== "date"
                  ) {
                    return
                  }
                  if (next === "date" && !form.getValues("runAt")) {
                    form.setValue(
                      "runAt",
                      dateTriggerToInput(
                        new Date(Date.now() + 60 * 60 * 1000).toISOString()
                      )
                    )
                  }
                  field.onChange(next)
                }}
              >
                <ToggleGroupItem value="cron">
                  {t("common.cron")}
                </ToggleGroupItem>
                <ToggleGroupItem value="interval">
                  {t("common.interval")}
                </ToggleGroupItem>
                <ToggleGroupItem value="date">
                  {t("common.oneTime")}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        {triggerKind === "cron" ? (
          <>
            <Controller
              name="scheduleMode"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t("common.scheduleMode")}</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    aria-required
                    value={[field.value]}
                    onValueChange={(value) => {
                      const next = value[0]
                      if (next === "preset" || next === "custom") {
                        field.onChange(next)
                      }
                    }}
                  >
                    <ToggleGroupItem value="preset">
                      {t("common.preset")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="custom">
                      {t("common.custom")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            />
            {scheduleMode === "preset" ? (
              <Controller
                name="preset"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="cron-preset">
                      {t("common.preset")}
                    </FieldLabel>
                    <Select
                      items={presetItems}
                      value={field.value || null}
                      onValueChange={(value) => {
                        if (value) {
                          field.onChange(value)
                        }
                      }}
                    >
                      <SelectTrigger
                        id="cron-preset"
                        className="w-full"
                        aria-required
                        aria-invalid={fieldState.invalid || undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {presetItems.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormFieldError fieldState={fieldState} />
                  </Field>
                )}
              />
            ) : (
              <Controller
                name="cronExpression"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="cron-expression">
                      {t("common.cronExpression")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="cron-expression"
                      required
                      placeholder="0 9 * * *"
                      aria-invalid={fieldState.invalid || undefined}
                    />
                    <FormFieldError fieldState={fieldState} />
                  </Field>
                )}
              />
            )}
          </>
        ) : triggerKind === "interval" ? (
          <>
            <Field>
              <FieldLabel htmlFor="cron-interval-amount">
                {t("common.interval")}
              </FieldLabel>
              <div className="flex gap-2">
                <Controller
                  name="intervalAmount"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field
                      className="min-w-0 flex-1"
                      data-invalid={fieldState.invalid || undefined}
                    >
                      <Input
                        {...field}
                        id="cron-interval-amount"
                        required
                        inputMode="numeric"
                        placeholder="1"
                        aria-invalid={fieldState.invalid || undefined}
                      />
                      <FormFieldError fieldState={fieldState} />
                    </Field>
                  )}
                />
                <Controller
                  name="intervalUnit"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={intervalUnitItems}
                      value={field.value}
                      onValueChange={(value) => {
                        if (
                          value === "seconds" ||
                          value === "minutes" ||
                          value === "hours"
                        ) {
                          field.onChange(value)
                        }
                      }}
                    >
                      <SelectTrigger
                        className="w-32"
                        aria-label={t("common.unit")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {intervalUnitItems.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </Field>
          </>
        ) : (
          <Controller
            name="runAt"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="cron-run-at">
                  {t("schedule.executionTime")}
                </FieldLabel>
                <Input
                  {...field}
                  id="cron-run-at"
                  type="datetime-local"
                  required
                  step={1}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <p className="text-xs text-muted-foreground">
                  {t("hints.oneTimeSchedulesRunOnceThenTurnOff")}
                </p>
                <FormFieldError fieldState={fieldState} />
              </Field>
            )}
          />
        )}
        <Controller
          name="prompt"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="cron-prompt">
                {t("fields.prompt")}
              </FieldLabel>
              <Textarea
                {...field}
                id="cron-prompt"
                required
                rows={4}
                maxLength={CRON_PROMPT_MAX_LEN}
                aria-invalid={fieldState.invalid || undefined}
              />
              <FormFieldError fieldState={fieldState} />
            </Field>
          )}
        />
        <Controller
          name="model"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="cron-model">
                {t("common.overrideModel")}
              </FieldLabel>
              <Select
                items={modelItems}
                value={field.value || CRON_MODEL_FOLLOW}
                onValueChange={(value) =>
                  field.onChange(value || CRON_MODEL_FOLLOW)
                }
              >
                <SelectTrigger id="cron-model" className="w-full">
                  <SelectValue placeholder={t("common.followChat")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {modelItems.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          name="mcpIds"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="cron-mcp">{t("common.mcp")}</FieldLabel>
              <Select
                items={mcpItems}
                multiple
                value={field.value.map(String)}
                onValueChange={(next) => {
                  const ids = (Array.isArray(next) ? next : [])
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value > 0)
                  field.onChange(ids)
                }}
              >
                <SelectTrigger id="cron-mcp" className="w-full">
                  <SelectValue>
                    {(current: string[]) =>
                      current.length === 0
                        ? t("common.noneSelected")
                        : current
                            .map(
                              (value) =>
                                mcpItems.find((item) => item.value === value)
                                  ?.label ?? value
                            )
                            .join("、")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {mcpItems.map((mcp) => (
                      <SelectItem key={mcp.value} value={mcp.value}>
                        {mcp.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          name="freshThread"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor="cron-fresh">
                {t("common.freshChatEachRun")}
              </FieldLabel>
              <Switch
                id="cron-fresh"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
        <Controller
          name="active"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor="cron-status">
                {t("common.status")}
              </FieldLabel>
              <Switch
                id="cron-status"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  )
  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : null}
        {t("common.save")}
      </Button>
    </>
  )

  if (presentation === "inline") {
    return (
      <section
        data-cron-editor
        className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6"
      >
        <h1 className="text-lg font-semibold">{title}</h1>
        {editor}
        <div className="flex justify-end gap-2">{actions}</div>
      </section>
    )
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {editor}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
