import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { createMyModel, listMyProviderModels } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  createRemoteModelWriteBody,
  MODEL_MODALITY_ITEMS,
} from "@/features/settings/model-settings-params"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import type { ProviderItem } from "@/lib/types"

export function ModelSyncDialog({
  provider,
  existingModelIds,
  onOpenChange,
  onSaved,
}: {
  provider: ProviderItem
  existingModelIds: Set<string>
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const [keyword, setKeyword] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const remoteQuery = useQuery({
    queryKey: queryKeys.myProviderModels(provider.id),
    queryFn: () => listMyProviderModels(provider.id),
    retry: false,
  })
  const remoteModels = remoteQuery.data ?? []
  const needle = keyword.trim().toLowerCase()
  const filtered = needle
    ? remoteModels.filter(
        (item) =>
          item.id.toLowerCase().includes(needle) ||
          (item.display_name ?? "").toLowerCase().includes(needle)
      )
    : remoteModels
  const selectable = filtered
    .filter((item) => !existingModelIds.has(item.id))
    .map((item) => item.id)
  const selectableCount = remoteModels.filter(
    (item) => !existingModelIds.has(item.id)
  ).length
  const allSelected =
    selectable.length > 0 && selectable.every((id) => selected.includes(id))

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of selectable) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return [...next]
    })
  }

  async function submit() {
    if (saving) return
    if (selected.length === 0) {
      notifyError(t("models.selectAtLeastOneModel"))
      return
    }
    const chosen = new Set(selected)
    const bodies = remoteModels
      .filter((item) => chosen.has(item.id))
      .map((item) => createRemoteModelWriteBody(provider.id, item))

    setSaving(true)
    try {
      for (const body of bodies) {
        await createMyModel(body)
      }
      await onSaved()
      toast.add({
        title: t("models.modelsAdded", { count: bodies.length }),
        type: "success",
      })
      onOpenChange(false)
    } catch (cause) {
      notifyError(apiErrorMessage(cause, t("common.saveFailed")))
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("common.syncModels")}</DialogTitle>
          <DialogDescription>
            {t("models.syncModelsDescription", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            value={keyword}
            placeholder={t("models.searchModelsPlaceholder")}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={allSelected}
              disabled={selectable.length === 0 || saving}
              onChange={toggleAll}
            />
            {t("models.selectAllFiltered")}
          </label>
          <span className="text-xs text-muted-foreground">
            {t("models.selectableCount", { count: selectableCount })}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("models.selectedCount", { count: selected.length })}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {remoteQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t("models.remoteModelsLoading")}
            </div>
          ) : remoteQuery.error ? (
            <div className="flex h-64 items-center justify-center p-4 text-center text-sm text-destructive">
              {apiErrorMessage(remoteQuery.error)}
            </div>
          ) : remoteModels.length === 0 ? (
            <div className="flex h-64 items-center justify-center p-4 text-center text-sm text-muted-foreground">
              {t("models.noRemoteModels")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 items-center justify-center p-4 text-center text-sm text-muted-foreground">
              {t("models.noMatchingModels")}
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {filtered.map((item) => {
                const exists = existingModelIds.has(item.id)
                return (
                  <label
                    key={item.id}
                    className={
                      exists
                        ? "flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2 opacity-75"
                        : "flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-primary/40"
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      value={item.id}
                      checked={selected.includes(item.id)}
                      disabled={exists || saving}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm">
                          {item.display_name
                            ? `${item.display_name} · ${item.id}`
                            : item.id}
                        </span>
                        {exists ? (
                          <Badge variant="outline">
                            {t("models.alreadyAdded")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.input_modalities.length > 0
                          ? item.input_modalities
                              .map((modality) => {
                                const entry = MODEL_MODALITY_ITEMS.find(
                                  (candidate) => candidate.value === modality
                                )
                                return entry ? t(entry.label) : modality
                              })
                              .join(" / ")
                          : t("common.notConfigured")}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || selected.length === 0}
            onClick={() => void submit()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saving ? t("common.saving") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
