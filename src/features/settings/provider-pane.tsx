import { LayersIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { FormEvent } from "react"
import { useId, useState } from "react"

import { createMyProvider, deleteMyProviders, updateMyProvider } from "@/api"
import { apiErrorMessage } from "@/api/http"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  createProviderWriteBody,
  getProviderDefaultHost,
  isProviderDefaultHost,
  type ProviderFormValues,
} from "@/features/settings/model-settings-params"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { SETTINGS_ROW_CLASS } from "@/features/settings/settings-card"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import {
  AI_PROVIDER_TYPE,
  type AIProviderType,
  type ProviderItem,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const PROVIDER_TYPE_ITEMS: {
  value: string
  type: AIProviderType
  label: string
}[] = [
  { value: "0", type: AI_PROVIDER_TYPE.openai, label: "OpenAI" },
  { value: "1", type: AI_PROVIDER_TYPE.anthropic, label: "Anthropic" },
  { value: "2", type: AI_PROVIDER_TYPE.google, label: "Google" },
  { value: "3", type: AI_PROVIDER_TYPE.xai, label: "xAI" },
  { value: "4", type: AI_PROVIDER_TYPE.openrouter, label: "OpenRouter" },
  {
    value: "5",
    type: AI_PROVIDER_TYPE.openai_responses,
    label: "OpenAI Responses",
  },
]

function providerTypeLabel(type: AIProviderType) {
  return (
    PROVIDER_TYPE_ITEMS.find((item) => item.type === type)?.label ??
    String(type)
  )
}

function providerFormValues(
  provider?: ProviderItem | null
): ProviderFormValues {
  return {
    name: provider?.name ?? "",
    type: provider?.type ?? AI_PROVIDER_TYPE.openai,
    api_key: "",
    api_host: provider?.api_host ?? "",
    status: provider?.status ?? 1,
    remark: provider?.remark ?? null,
  }
}

export function ProviderPane({
  providers,
  activeProviderId,
  loading,
  onAddProvider,
  onEditProvider,
  onManageModels,
  onChanged,
}: {
  providers: ProviderItem[]
  activeProviderId?: number
  loading: boolean
  onAddProvider: () => void
  onEditProvider: (provider: ProviderItem) => void
  onManageModels: (id: number) => void
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const [deleting, setDeleting] = useState<ProviderItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function confirmDelete() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteMyProviders([deleting.id])
      await onChanged()
      toast.add({ title: t("common.providerDeleted"), type: "success" })
      setDeleting(null)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.deleteFailed")))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardContent className="p-0">
        {loading && providers.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t("common.loading")}
          </div>
        ) : providers.length === 0 ? (
          <Empty className="min-h-64 rounded-none border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>{t("common.noProvidersYet")}</EmptyTitle>
            </EmptyHeader>
            <Button type="button" size="sm" onClick={onAddProvider}>
              <PlusIcon data-icon="inline-start" />
              {t("common.addProvider")}
            </Button>
          </Empty>
        ) : (
          <div className="divide-y">
            {providers.map((provider) => {
              const active = provider.id === activeProviderId
              return (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                    active && "bg-primary/5"
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-pressed={active}
                    onClick={() => onManageModels(provider.id)}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {provider.name}
                      </span>
                      <Badge variant="outline">
                        {providerTypeLabel(provider.type)}
                      </Badge>
                      <Badge
                        variant={
                          provider.status === 1 ? "secondary" : "outline"
                        }
                      >
                        {provider.status === 1
                          ? t("common.enabled")
                          : t("common.disabled")}
                      </Badge>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {provider.api_host}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("common.editProvider")}
                      onClick={() => onEditProvider(provider)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("common.deleteName", {
                        name: provider.name,
                      })}
                      onClick={() => setDeleting(provider)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("models.deleteProvider")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("models.deleteProviderConfirmation", {
                name: deleting?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function ProviderEditorDialog({
  provider,
  onOpenChange,
  onSaved,
}: {
  provider: ProviderItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const nameId = useId()
  const keyId = useId()
  const hostId = useId()
  const statusId = useId()
  const remarkId = useId()
  const [draft, setDraft] = useState<ProviderFormValues>(() =>
    providerFormValues(provider)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const editing = provider != null

  function update(patch: Partial<ProviderFormValues>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function selectType(type: AIProviderType) {
    const next = { ...draft, type }
    // 仅当地址为空或仍是默认地址时跟随类型联动
    if (isProviderDefaultHost(next.api_host)) {
      next.api_host = getProviderDefaultHost(type)
    }
    setDraft(next)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!draft.name.trim()) {
      setError(t("common.nameIsRequired"))
      return
    }
    if (!editing && !draft.api_key.trim()) {
      setError(t("common.apiKeyIsRequired"))
      return
    }
    const body = createProviderWriteBody(draft)

    setSaving(true)
    setError("")
    try {
      if (provider) await updateMyProvider(provider.id, body)
      else await createMyProvider(body)
      await onSaved()
      toast.add({
        title: t(
          provider ? "common.providerUpdated" : "common.providerCreated"
        ),
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
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(editing ? "common.editProvider" : "common.addProvider")}
          </DialogTitle>
          <DialogDescription>
            {t("models.providerCredentialDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={nameId}>{t("common.name")}</FieldLabel>
              <Input
                id={nameId}
                value={draft.name}
                autoFocus
                onChange={(event) => update({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{t("common.providerType")}</FieldLabel>
              <SettingsSelect
                items={PROVIDER_TYPE_ITEMS.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                value={String(draft.type)}
                onValueChange={(value) => {
                  const type = PROVIDER_TYPE_ITEMS.find(
                    (item) => item.value === value
                  )?.type
                  if (type !== undefined) selectType(type)
                }}
              >
                <SettingsSelectTrigger className="w-full">
                  <SettingsSelectValue />
                </SettingsSelectTrigger>
                <SettingsSelectContent>
                  <SettingsSelectGroup>
                    {PROVIDER_TYPE_ITEMS.map((item) => (
                      <SettingsSelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SettingsSelectItem>
                    ))}
                  </SettingsSelectGroup>
                </SettingsSelectContent>
              </SettingsSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={hostId}>{t("common.apiHost")}</FieldLabel>
              <Input
                id={hostId}
                value={draft.api_host}
                placeholder={getProviderDefaultHost(draft.type)}
                onChange={(event) => update({ api_host: event.target.value })}
              />
              <FieldDescription>
                {t("models.apiHostBlankUsesDefault")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={keyId}>{t("common.apiKey")}</FieldLabel>
              <Input
                id={keyId}
                type="password"
                autoComplete="off"
                value={draft.api_key}
                onChange={(event) => update({ api_key: event.target.value })}
              />
              <FieldDescription>
                {t(
                  editing
                    ? "models.leaveApiKeyBlankToKeepCurrent"
                    : "common.apiKeyIsRequired"
                )}
              </FieldDescription>
            </Field>
            <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
              <FieldContent>
                <FieldLabel htmlFor={statusId}>{t("common.status")}</FieldLabel>
                <FieldDescription>
                  {t("models.providerStatusDescription")}
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
