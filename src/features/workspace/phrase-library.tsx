import { translateCurrent } from "@/lib/i18n"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { deleteMyQuickPhrase, listQuickPhrases } from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { startDraftChat } from "@/app/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useComposerStore } from "@/features/chat/composer-store"
import { SIDEBAR_EDGE_INSET_X_CLASS } from "@/features/shell/sidebar-style"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import { PhraseEditorDialog } from "@/features/workspace/phrase-editor"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { avatarFallbackTone } from "@/lib/avatar-tone"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import { cn } from "@/lib/utils"
import type { QuickPhraseItem } from "@/lib/types"

function phraseMatchesQuery(phrase: QuickPhraseItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return [phrase.title, phrase.content].some((part) =>
    part.toLowerCase().includes(needle)
  )
}

export function PhraseLibrary() {
  const t = useT()
  const queryClient = useQueryClient()
  const query = useWorkspaceSearchStore((state) => state.query)
  const phrasesQuery = useQuery({
    queryKey: queryKeys.quickPhrases(),
    queryFn: listQuickPhrases,
  })
  const [selected, setSelected] = useState<QuickPhraseItem | null>(null)
  const [editor, setEditor] = useState<QuickPhraseItem | "create" | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    return () => {
      useWorkspaceSearchStore.getState().setQuery("")
    }
  }, [])

  const items = useMemo(() => phrasesQuery.data ?? [], [phrasesQuery.data])
  const filtered = useMemo(
    () => items.filter((item) => phraseMatchesQuery(item, query)),
    [items, query]
  )

  async function refreshPhrases() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.quickPhrases() })
  }

  async function remove(phrase: QuickPhraseItem) {
    if (!canEditOwnedResource(phrase.user_id) || removing) {
      return
    }
    setRemoving(true)
    try {
      await deleteMyQuickPhrase(phrase.id)
      await refreshPhrases()
      setSelected(null)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.deleteFailed")))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div
        className={cn(
          "flex min-h-full w-full flex-1 flex-col gap-6 pt-6 pb-8",
          SIDEBAR_EDGE_INSET_X_CLASS
        )}
      >
        {phrasesQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : phrasesQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <QuoteIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t("common.couldNotLoadName", {
                  name: t("common.quickPhrases"),
                })}
              </EmptyTitle>
              <EmptyDescription>
                {apiErrorMessage(
                  phrasesQuery.error,
                  translateCurrent("common.pleaseTryAgainLater")
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <QuoteIcon />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0
                  ? t("common.noQuickPhrasesYet")
                  : t("common.noMatchingQuickPhrases")}
              </EmptyTitle>
              {items.length === 0 ? (
                <EmptyDescription>
                  {t(
                    "hints.createOneToInsertItFromTheCommandPaletteOrComposer"
                  )}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((phrase) => (
              <PhraseCard
                key={phrase.id}
                phrase={phrase}
                onOpen={() => setSelected(phrase)}
              />
            ))}
          </div>
        )}
      </div>
      <PhraseDialog
        phrase={selected}
        removing={removing}
        onClose={() => setSelected(null)}
        onInsert={(item) => {
          startDraftChat()
          useComposerStore.getState().insertPhrase(item.content)
          setSelected(null)
        }}
        onEdit={(item) => {
          setSelected(null)
          setEditor(item)
        }}
        onRemove={(item) => void remove(item)}
      />
      <PhraseEditorDialog
        open={editor != null}
        phrase={editor === "create" ? null : editor}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null)
          }
        }}
        onSaved={refreshPhrases}
      />
    </div>
  )
}

export function WorkspacePhraseAddButton() {
  const t = useT()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      {/* 新建只留加号图标 */}
      <SidebarToolbarButton
        label={t("common.newQuickPhrase")}
        onClick={() => setCreateOpen(true)}
      >
        <PlusIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      <PhraseEditorDialog
        open={createOpen}
        phrase={null}
        onOpenChange={setCreateOpen}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.quickPhrases() })
        }
      />
    </>
  )
}

function PhraseCard({
  phrase,
  onOpen,
}: {
  phrase: QuickPhraseItem
  onOpen: () => void
}) {
  const t = useT()
  const owned = canEditOwnedResource(phrase.user_id)
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className="cursor-pointer py-4 text-left transition-colors hover:bg-muted/40"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className={avatarFallbackTone(phrase.id)}>
              {phrase.title.trim().slice(0, 1) || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 truncate text-base">
              <span className="min-w-0 truncate">{phrase.title}</span>
              {owned ? null : (
                <Badge variant="outline">{t("common.builtIn")}</Badge>
              )}
            </CardTitle>
            {phrase.content ? (
              <CardDescription className="mt-1 line-clamp-2 leading-5">
                {phrase.content}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function PhraseDialog({
  phrase,
  removing,
  onClose,
  onInsert,
  onEdit,
  onRemove,
}: {
  phrase: QuickPhraseItem | null
  removing: boolean
  onClose: () => void
  onInsert: (phrase: QuickPhraseItem) => void
  onEdit: (phrase: QuickPhraseItem) => void
  onRemove: (phrase: QuickPhraseItem) => void
}) {
  const t = useT()
  const owned = phrase ? canEditOwnedResource(phrase.user_id) : false

  return (
    <Dialog
      open={phrase != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="gap-6 overflow-y-auto rounded-3xl p-6 sm:max-w-xl"
      >
        {phrase ? (
          <>
            <DialogHeader className="gap-4">
              <div className="flex items-start gap-4">
                <Avatar className="size-16">
                  <AvatarFallback className={avatarFallbackTone(phrase.id)}>
                    {phrase.title.trim().slice(0, 1) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
                      {phrase.title}
                    </DialogTitle>
                    <DialogClose
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                        />
                      }
                    >
                      <XIcon />
                      <span className="sr-only">{t("common.close")}</span>
                    </DialogClose>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="lg"
                      className="w-fit"
                      onClick={() => onInsert(phrase)}
                    >
                      <QuoteIcon data-icon="inline-start" />
                      {t("common.insertIntoChat")}
                    </Button>
                    {owned ? (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="w-fit"
                          disabled={removing}
                          onClick={() => onEdit(phrase)}
                        >
                          <PencilIcon data-icon="inline-start" />
                          {t("common.edit")}
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="destructive"
                          className="w-fit"
                          disabled={removing}
                          onClick={() => onRemove(phrase)}
                        >
                          {removing ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <Trash2Icon data-icon="inline-start" />
                          )}
                          {t("common.delete")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <DialogDescription className="sr-only">
                {phrase.content || t("common.noContent")}
              </DialogDescription>
              <p className="text-sm leading-6 whitespace-pre-wrap text-foreground/80">
                {phrase.content}
              </p>
            </DialogHeader>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
