import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BrainIcon, ChevronDownIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { deleteMemory, getMemory, listMemories } from "@/api"
import { queryKeys } from "@/api/query-keys"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import {
  useCurrentUserChatPrefs,
  useUserChatPrefsStore,
} from "@/features/settings/user-prefs"
import { useT } from "@/hooks/use-t"
import { apiErrorMessage } from "@/api/http"
import { cn } from "@/lib/utils"

export function MemorySettings() {
  const t = useT()
  const prefs = useCurrentUserChatPrefs()
  const setPrefs = useUserChatPrefsStore((state) => state.setPrefs)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const memories = useQuery({
    queryKey: queryKeys.memories(),
    queryFn: listMemories,
  })
  const detail = useQuery({
    queryKey: queryKeys.memory(selected ?? ""),
    queryFn: () => getMemory(selected ?? ""),
    enabled: Boolean(selected),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMemory,
    onSuccess: async (_, path) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.memories() })
      setSelected((current) => (current === path ? null : current))
      queryClient.removeQueries({
        queryKey: queryKeys.memory(path),
        exact: true,
      })
      queryClient.setQueryData<Awaited<ReturnType<typeof listMemories>>>(
        queryKeys.memories(),
        (current) => current?.filter((memory) => memory.path !== path)
      )
      setPendingDelete(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.memories(),
        exact: true,
      })
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <SettingsPageHeader title={t("common.memory")} />
      <SettingsBlock>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-memory-enabled">
                {t("common.memoryEnabled")}
              </FieldLabel>
              <FieldDescription id="setting-memory-enabled-description">
                {t("hints.memoryFeatureDescription")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="setting-memory-enabled"
              aria-describedby="setting-memory-enabled-description"
              checked={prefs.memory_enabled}
              onCheckedChange={(checked) =>
                setPrefs({ memory_enabled: checked })
              }
            />
          </Field>
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock className="min-h-0 flex-1">
        {memories.isLoading ? (
          <Card size="sm">
            <CardContent className="p-5 text-sm text-muted-foreground">
              {t("common.loading")}
            </CardContent>
          </Card>
        ) : memories.isError ? (
          <Card size="sm">
            <CardContent className="p-5 text-sm text-destructive">
              {apiErrorMessage(memories.error)}
            </CardContent>
          </Card>
        ) : memories.data?.length ? (
          <Card size="sm" className="gap-0 py-0">
            <CardContent className="divide-y p-0">
              {memories.data.map((memory) => {
                const open = selected === memory.path
                return (
                  <div key={memory.path}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      aria-expanded={open}
                      aria-controls={open ? "memory-detail" : undefined}
                      onClick={() => setSelected(open ? null : memory.path)}
                    >
                      <BrainIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {memory.path}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {memory.preview}
                        </span>
                      </span>
                      <ChevronDownIcon
                        className={cn(
                          "size-4 transition-transform",
                          open && "rotate-180"
                        )}
                      />
                    </button>
                    {open ? (
                      <div
                        id="memory-detail"
                        className="border-t bg-muted/20 px-4 py-4"
                      >
                        {detail.isError ? (
                          <FieldError>
                            {apiErrorMessage(detail.error)}
                          </FieldError>
                        ) : null}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {detail.isLoading
                            ? t("common.loading")
                            : (detail.data?.content ?? memory.preview)}
                        </p>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="mt-4"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            deleteMutation.reset()
                            setPendingDelete(memory.path)
                          }}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          {t("common.deleteMemory")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrainIcon />
              </EmptyMedia>
              <EmptyTitle>{t("common.noMemoriesYet")}</EmptyTitle>
              <EmptyDescription>
                {t("common.theyAppearHereAfterTheAssistantWritesThem")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SettingsBlock>
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setPendingDelete(null)
            deleteMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.deleteMemory")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hints.deleteMemoryConfirmation", {
                path: pendingDelete ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError ? (
            <FieldError>{apiErrorMessage(deleteMutation.error)}</FieldError>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (pendingDelete && !deleteMutation.isPending) {
                  deleteMutation.mutate(pendingDelete)
                }
              }}
            >
              {deleteMutation.isPending
                ? t("common.deleting")
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
