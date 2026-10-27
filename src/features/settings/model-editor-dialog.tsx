import type { FormEvent } from "react"
import { useId, useState } from "react"

import { createMyModel, updateMyModel } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  allowedModelModalities,
  canConfigureThinkingPolicy,
  createModelWriteBody,
  MODEL_CAPABILITY_ITEMS,
  MODEL_MODALITY_ITEMS,
  modelFormValues,
  modelKindItems,
  normalizeModelModalities,
  THINKING_LEVELS,
  validateModelForm,
  type ModelFormValues,
} from "@/features/settings/model-settings-params"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { useT } from "@/hooks/use-t"
import { AI_PROVIDER_TYPE, type MyModelItem, type ProviderItem } from "@/lib/types"

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function ChoiceButtons<T extends string>({
  items,
  values,
  onChange,
  disabled,
}: {
  items: { value: T; label: string }[]
  values: T[]
  onChange: (values: T[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = values.includes(item.value)
        return (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={selected ? "secondary" : "outline"}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(toggleValue(values, item.value))}
          >
            {item.label}
          </Button>
        )
      })}
    </div>
  )
}

export function ModelEditorDialog({
  provider,
  model,
  onOpenChange,
  onSaved,
}: {
  provider: ProviderItem
  model: MyModelItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const modelIdId = useId()
  const nameId = useId()
  const contextId = useId()
  const outputId = useId()
  const sortId = useId()
  const statusId = useId()
  const remarkId = useId()
  const editing = model != null
  const [draft, setDraft] = useState<ModelFormValues>(() =>
    modelFormValues(model)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const kindItems = modelKindItems(provider.type)
  const isOpenRouter = provider.type === AI_PROVIDER_TYPE.openrouter
  const thinkingEnabled = canConfigureThinkingPolicy(draft)
  const thinkingPolicy = draft.thinking_policy
  const modalityItems = MODEL_MODALITY_ITEMS.filter((item) =>
    allowedModelModalities(draft.kind).includes(item.value)
  )

  function update(patch: Partial<ModelFormValues>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function selectKind(kind: ModelFormValues["kind"]) {
    const modalities = draft.input_modalities
      ? normalizeModelModalities(kind, draft.input_modalities)
      : null
    update({
      kind,
      capabilities: kind === "chat" ? draft.capabilities : [],
      input_modalities:
        modalities && modalities.length > 0 ? modalities : null,
      thinking_policy: kind === "chat" ? draft.thinking_policy : null,
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const validationError = validateModelForm(provider.type, draft)
    if (validationError) {
      setError(t(validationError))
      return
    }
    const body = createModelWriteBody(provider.id, draft)

    setSaving(true)
    setError("")
    try {
      if (model) await updateMyModel(model.id, body)
      else await createMyModel(body)
      await onSaved()
      toast.add({
        title: t(model ? "models.modelUpdated" : "common.modelAdded"),
        type: "success",
      })
      onOpenChange(false)
    } catch (cause) {
      setError(apiErrorMessage(cause, t("common.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && saving) return
        onOpenChange(open)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `${t("common.edit")} ${t("common.model")}`
              : t("common.addModel")}
          </DialogTitle>
          <DialogDescription>
            {t(
              editing
                ? "models.editModelDescription"
                : "models.addModelDescription"
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={modelIdId}>{t("common.modelId")}</FieldLabel>
              <Input
                id={modelIdId}
                value={draft.model_id}
                autoFocus
                onChange={(event) => update({ model_id: event.target.value })}
              />
              {isOpenRouter ? (
                <FieldDescription>
                  {t("models.openRouterModelIdHint")}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={nameId}>{t("common.name")}</FieldLabel>
              <Input
                id={nameId}
                value={draft.name ?? ""}
                onChange={(event) => update({ name: event.target.value })}
              />
              <FieldDescription>
                {t("models.modelNameOptional")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t("common.modelKind")}</FieldLabel>
              <SettingsSelect
                items={kindItems.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                value={draft.kind}
                onValueChange={(value) =>
                  selectKind(value as ModelFormValues["kind"])
                }
              >
                <SettingsSelectTrigger className="w-full">
                  <SettingsSelectValue />
                </SettingsSelectTrigger>
                <SettingsSelectContent>
                  <SettingsSelectGroup>
                    {kindItems.map((item) => (
                      <SettingsSelectItem key={item.value} value={item.value}>
                        {t(item.label)}
                      </SettingsSelectItem>
                    ))}
                  </SettingsSelectGroup>
                </SettingsSelectContent>
              </SettingsSelect>
            </Field>
          </FieldGroup>

          {draft.kind === "chat" ? (
            <Field>
              <FieldLabel>{t("models.modelCapabilities")}</FieldLabel>
              <ChoiceButtons
                items={MODEL_CAPABILITY_ITEMS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                values={draft.capabilities}
                onChange={(values) =>
                  update({
                    capabilities: values,
                    thinking_policy: values.includes("thinking")
                      ? draft.thinking_policy
                      : null,
                  })
                }
                disabled={saving}
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel>{t("common.inputModalities")}</FieldLabel>
            <ChoiceButtons
              items={modalityItems.map((item) => ({
                value: item.value,
                label: t(item.label),
              }))}
              values={draft.input_modalities ?? []}
              onChange={(values) =>
                update({ input_modalities: values.length > 0 ? values : null })
              }
              disabled={saving}
            />
            <FieldDescription>
              {t("models.inputModalitiesHint")}
            </FieldDescription>
          </Field>

          {thinkingEnabled ? (
            <div className="flex flex-col gap-4 rounded-lg border p-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel>{t("models.thinkingPolicy")}</FieldLabel>
                  <FieldDescription>
                    {t("models.enableThinkingPolicy")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  checked={thinkingPolicy != null}
                  onCheckedChange={(checked) =>
                    update({
                      thinking_policy: checked
                        ? {
                            levels: ["low", "medium", "high"],
                            default_level: null,
                            can_disable: false,
                          }
                        : null,
                    })
                  }
                  disabled={saving}
                />
              </Field>
              {thinkingPolicy ? (
                <>
                  <Field>
                    <FieldLabel>{t("models.thinkingLevels")}</FieldLabel>
                    <ChoiceButtons
                      items={THINKING_LEVELS.map((level) => ({
                        value: level,
                        label: t(`common.${level}`),
                      }))}
                      values={thinkingPolicy.levels}
                      onChange={(levels) =>
                        update({
                          thinking_policy: {
                            ...thinkingPolicy,
                            levels,
                            default_level: levels.includes(
                              thinkingPolicy.default_level ?? "low"
                            )
                              ? thinkingPolicy.default_level
                              : null,
                          },
                        })
                      }
                      disabled={saving}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("models.defaultThinkingLevel")}</FieldLabel>
                    <SettingsSelect
                      items={[
                        {
                          value: "__provider_default__",
                          label: t("models.providerDefault"),
                        },
                        ...thinkingPolicy.levels.map((level) => ({
                          value: level,
                          label: t(`common.${level}`),
                        })),
                      ]}
                      value={
                        thinkingPolicy.default_level ?? "__provider_default__"
                      }
                      onValueChange={(value) =>
                        update({
                          thinking_policy: {
                            ...thinkingPolicy,
                            default_level:
                              value === "__provider_default__"
                                ? null
                                : (value as typeof thinkingPolicy.default_level),
                          },
                        })
                      }
                      disabled={saving}
                    >
                      <SettingsSelectTrigger className="w-full">
                        <SettingsSelectValue />
                      </SettingsSelectTrigger>
                      <SettingsSelectContent>
                        <SettingsSelectGroup>
                          <SettingsSelectItem value="__provider_default__">
                            {t("models.providerDefault")}
                          </SettingsSelectItem>
                          {thinkingPolicy.levels.map((level) => (
                            <SettingsSelectItem key={level} value={level}>
                              {t(`common.${level}`)}
                            </SettingsSelectItem>
                          ))}
                        </SettingsSelectGroup>
                      </SettingsSelectContent>
                    </SettingsSelect>
                  </Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>
                        {t("models.allowDisableThinking")}
                      </FieldLabel>
                    </FieldContent>
                    <Switch
                      checked={thinkingPolicy.can_disable}
                      onCheckedChange={(checked) =>
                        update({
                          thinking_policy: {
                            ...thinkingPolicy,
                            can_disable: checked,
                          },
                        })
                      }
                      disabled={saving}
                    />
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={contextId}>
                {t("models.contextWindowTokens")}
              </FieldLabel>
              <Input
                id={contextId}
                type="number"
                min={1}
                value={draft.context_window ?? ""}
                onChange={(event) =>
                  update({
                    context_window:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={outputId}>
                {t("models.maxOutputTokens")}
              </FieldLabel>
              <Input
                id={outputId}
                type="number"
                min={1}
                value={draft.max_output_tokens ?? ""}
                onChange={(event) =>
                  update({
                    max_output_tokens:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={sortId}>{t("models.sortOrder")}</FieldLabel>
              <Input
                id={sortId}
                type="number"
                value={draft.sort}
                onChange={(event) => update({ sort: Number(event.target.value) })}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={statusId}>{t("common.status")}</FieldLabel>
                <FieldDescription>
                  {t("models.modelStatusDescription")}
                </FieldDescription>
              </FieldContent>
              <Switch
                id={statusId}
                checked={draft.status === 1}
                onCheckedChange={(checked) =>
                  update({ status: checked ? 1 : 2 })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={remarkId}>
                {t("common.description")}
              </FieldLabel>
              <Textarea
                id={remarkId}
                value={draft.remark ?? ""}
                onChange={(event) =>
                  update({ remark: event.target.value || null })
                }
              />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
