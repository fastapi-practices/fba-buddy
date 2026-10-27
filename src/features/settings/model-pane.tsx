import {
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { deleteMyModel } from "@/api"
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ModelEditorDialog } from "@/features/settings/model-editor-dialog"
import { ModelSyncDialog } from "@/features/settings/model-sync-dialog"
import { MODEL_MODALITY_ITEMS } from "@/features/settings/model-settings-params"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import type { ModelKind, MyModelItem, ProviderItem } from "@/lib/types"

const KIND_LABELS: Record<
  ModelKind,
  "common.chat" | "common.embedding" | "common.draw"
> = {
  chat: "common.chat",
  embedding: "common.embedding",
  image: "common.draw",
}

export function ModelPane({
  provider,
  models,
  loading,
  onChanged,
}: {
  provider?: ProviderItem
  models: MyModelItem[]
  loading: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const [selected, setSelected] = useState<number[]>([])
  const [editor, setEditor] = useState<{ model: MyModelItem | null } | null>(
    null
  )
  const [syncOpen, setSyncOpen] = useState(false)
  const [deleting, setDeleting] = useState<MyModelItem | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const existingModelIds = new Set(models.map((model) => model.model_id))
  const allSelected =
    models.length > 0 && models.every((model) => selected.includes(model.id))

  function toggle(id: number) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAll() {
    setSelected(allSelected ? [] : models.map((model) => model.id))
  }

  async function removeModels(ids: number[], message: () => string) {
    if (ids.length === 0 || busy) return
    setBusy(true)
    try {
      for (const id of ids) {
        await deleteMyModel(id)
      }
      await onChanged()
      toast.add({ title: message(), type: "success" })
      setSelected([])
      setDeleting(null)
      setBatchOpen(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.deleteFailed")))
    } finally {
      setBusy(false)
    }
  }

  function modalityLabel(modality: MyModelItem["input_modalities"]) {
    const entries = modality ?? []
    if (entries.length === 0) return t("common.notConfigured")
    return entries
      .map((value) => {
        const entry = MODEL_MODALITY_ITEMS.find((item) => item.value === value)
        return entry ? t(entry.label) : value
      })
      .join(" / ")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={allSelected}
              disabled={!provider || models.length === 0 || busy}
              onChange={toggleAll}
            />
            {t("common.all")}
          </label>
          <span className="text-xs text-muted-foreground">
            {t("models.selectedCount", { count: selected.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!provider || busy}
            onClick={() => setSyncOpen(true)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t("common.syncModels")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!provider || selected.length === 0 || busy}
            onClick={() => setBatchOpen(true)}
          >
            <Trash2Icon data-icon="inline-start" />
            {t("models.batchDelete")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!provider || busy}
            onClick={() => setEditor({ model: null })}
          >
            <PlusIcon data-icon="inline-start" />
            {t("common.addModel")}
          </Button>
        </div>
      </div>

      {!provider ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {t("models.selectProviderToManage")}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t("common.loading")}
        </div>
      ) : models.length === 0 ? (
        <Empty className="flex-1 rounded-none border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>{t("models.noProviderModels")}</EmptyTitle>
          </EmptyHeader>
          <Button type="button" size="sm" onClick={() => setSyncOpen(true)}>
            <RefreshCwIcon data-icon="inline-start" />
            {t("common.syncModels")}
          </Button>
        </Empty>
      ) : (
        <ItemGroup className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {models.map((model) => (
            <Item
              key={model.id}
              variant="outline"
              className="items-start gap-3 px-3 py-3"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={selected.includes(model.id)}
                aria-label={model.name || model.model_id}
                onChange={() => toggle(model.id)}
              />
              <ItemContent className="min-w-0 gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">
                    {model.name || model.model_id}
                  </p>
                  <Badge variant="outline">{t(KIND_LABELS[model.kind])}</Badge>
                  <Badge variant={model.status === 1 ? "secondary" : "outline"}>
                    {model.status === 1
                      ? t("common.enabled")
                      : t("common.disabled")}
                  </Badge>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {model.model_id}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("common.inputModalities")}:{" "}
                    {modalityLabel(model.input_modalities)}
                  </span>
                  {model.capabilities.length > 0 ? (
                    <span>
                      {t("common.capabilities")}:{" "}
                      {model.capabilities.join(", ")}
                    </span>
                  ) : null}
                  {model.context_window != null ? (
                    <span>
                      {t("common.contextWindow")}: {model.context_window}
                    </span>
                  ) : null}
                  {model.max_output_tokens != null ? (
                    <span>
                      {t("models.maxOutputTokens")}: {model.max_output_tokens}
                    </span>
                  ) : null}
                </div>
                {model.remark ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {model.remark}
                  </p>
                ) : null}
              </ItemContent>
              <ItemActions className="shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t("common.edit")} ${model.name || model.model_id}`}
                  disabled={busy}
                  onClick={() => setEditor({ model })}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("common.deleteName", {
                    name: model.name || model.model_id,
                  })}
                  disabled={busy}
                  onClick={() => setDeleting(model)}
                >
                  <Trash2Icon />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      {provider && editor ? (
        <ModelEditorDialog
          key={editor.model?.id ?? `new:${provider.id}`}
          provider={provider}
          model={editor.model}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
          onSaved={onChanged}
        />
      ) : null}

      {provider && syncOpen ? (
        <ModelSyncDialog
          provider={provider}
          existingModelIds={existingModelIds}
          onOpenChange={(open) => {
            if (!open) setSyncOpen(false)
          }}
          onSaved={onChanged}
        />
      ) : null}

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("models.deleteModel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("models.deleteModelConfirmation", {
                name: deleting?.name || deleting?.model_id || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() =>
                void removeModels(deleting ? [deleting.id] : [], () =>
                  t("common.modelDeleted")
                )
              }
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={batchOpen}
        onOpenChange={(open) => {
          if (!open && !busy) setBatchOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("models.batchDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("models.deleteSelectedModelsConfirmation", {
                count: selected.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() =>
                void removeModels(selected, () =>
                  t("models.modelsDeleted", { count: selected.length })
                )
              }
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {busy ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
