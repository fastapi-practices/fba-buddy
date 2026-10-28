import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PlusIcon, RefreshCwIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { listMyModels, listMyProviders, syncMyModelArchitecture } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ModelPane } from "@/features/settings/model-pane"
import { pickActiveProviderId } from "@/features/settings/model-settings-params"
import {
  ProviderEditorDialog,
  ProviderPane,
} from "@/features/settings/provider-pane"
import { SettingsPageHeader } from "@/features/settings/settings-card"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import type { ProviderItem } from "@/lib/types"

export function ModelSettings() {
  const t = useT()
  const queryClient = useQueryClient()
  const [requestedProviderId, setRequestedProviderId] = useState<number>()
  const [modelsOpen, setModelsOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [providerEditor, setProviderEditor] = useState<{
    provider: ProviderItem | null
  } | null>(null)
  const providersQuery = useQuery({
    queryKey: queryKeys.myProviders(),
    queryFn: listMyProviders,
  })
  const modelsQuery = useQuery({
    queryKey: queryKeys.myModels(),
    queryFn: listMyModels,
  })
  const providers = providersQuery.data ?? []
  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data])
  const activeProviderId = pickActiveProviderId(providers, requestedProviderId)
  const activeProvider = providers.find((item) => item.id === activeProviderId)
  const activeModels = useMemo(
    () => models.filter((model) => model.provider_id === activeProviderId),
    [models, activeProviderId]
  )

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.myProviders() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.myModels() }),
    ])
  }

  function manageProviderModels(id: number) {
    setRequestedProviderId(id)
    setModelsOpen(true)
  }

  async function syncArchitecture() {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await syncMyModelArchitecture()
      await refresh()
      toast.add({
        title: t("models.architectureSynced", {
          updated: result.updated_count,
        }),
        type: "success",
      })
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.syncFailed")))
    } finally {
      setSyncing(false)
    }
  }

  const error = providersQuery.error ?? modelsQuery.error

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <SettingsPageHeader
        title={t("models.providerManagement")}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={syncing}
              onClick={() => void syncArchitecture()}
            >
              {syncing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              {t("models.syncModelArchitecture")}
            </Button>
            <Button
              type="button"
              onClick={() => setProviderEditor({ provider: null })}
            >
              <PlusIcon data-icon="inline-start" />
              {t("common.addProvider")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        {error ? (
          <Card size="sm">
            <CardContent className="p-5 text-sm text-destructive">
              {apiErrorMessage(error)}
            </CardContent>
          </Card>
        ) : (
          <ProviderPane
            providers={providers}
            activeProviderId={modelsOpen ? activeProviderId : undefined}
            loading={providersQuery.isLoading}
            onAddProvider={() => setProviderEditor({ provider: null })}
            onEditProvider={(provider) => setProviderEditor({ provider })}
            onManageModels={manageProviderModels}
            onChanged={refresh}
          />
        )}
      </div>

      {providerEditor ? (
        <ProviderEditorDialog
          key={providerEditor.provider?.id ?? "create"}
          provider={providerEditor.provider}
          onOpenChange={(open) => {
            if (!open) setProviderEditor(null)
          }}
          onSaved={refresh}
        />
      ) : null}

      <Sheet open={modelsOpen} onOpenChange={setModelsOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        >
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <SheetTitle>{t("models.manageProviderModels")}</SheetTitle>
            <SheetDescription>
              {t("models.manageProviderModelsDescription", {
                name: activeProvider?.name ?? "",
              })}
            </SheetDescription>
          </SheetHeader>
          {activeProvider ? (
            <ModelPane
              key={activeProvider.id}
              provider={activeProvider}
              models={activeModels}
              loading={modelsQuery.isLoading}
              onChanged={refresh}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
