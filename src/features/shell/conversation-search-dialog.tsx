import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArchiveIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
} from "lucide-react"

import {
  searchConversations,
  type SearchResult,
} from "@/api/conversation-search"
import type { ConversationMessageTarget } from "@/app/conversation-message-location"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useT } from "@/hooks/use-t"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { useLiveConversationSearch } from "@/features/chat/live-conversation-search"
import {
  conversationSearchHighlight,
  conversationSearchResultKey,
  loadConversationSearchPage,
  mergeConversationSearchResults,
  mergeLiveConversationSearchResults,
  type ConversationSearchLoader,
} from "./conversation-search-results"

export type ConversationSearchScope = "all" | "current"

export function ConversationSearchDialog({
  open,
  onOpenChange,
  onSelect,
  conversationId,
  initialScope = "all",
  search = searchConversations,
  onNavigate,
  description,
  conversationTitles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (id: string, target?: ConversationMessageTarget) => void
  conversationId?: string | null
  initialScope?: ConversationSearchScope
  search?: ConversationSearchLoader
  onNavigate?: (item: SearchResult, query: string) => void
  description?: string
  conversationTitles?: Readonly<Record<string, string>>
}) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const source = useAccountSourceStore(dataSourceKey)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        initialFocus={() => dialogRef.current?.querySelector("input") ?? false}
        data-slot="conversation-search-dialog"
        className="flex max-h-[min(85dvh,42rem)] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("common.searchChats")}</DialogTitle>
          <DialogDescription>
            {description ?? t("common.conversationSearchHint")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SearchContent
            key={`${source}:${conversationId ?? "draft"}:${initialScope}`}
            conversationId={conversationId}
            source={source}
            conversationTitles={conversationTitles}
            initialScope={initialScope}
            search={search}
            onSelect={(item, query) => {
              if (onNavigate) onNavigate(item, query)
              else if (item.kind === "conversation")
                onSelect(item.conversation_id)
              else
                onSelect(item.conversation_id, {
                  messageId: item.message_id,
                  snapshotId: item.snapshot_id,
                  query,
                  occurrence: item.occurrence,
                })
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SearchContent({
  conversationId,
  initialScope,
  search,
  onSelect,
  source,
  conversationTitles,
}: {
  conversationId?: string | null
  initialScope: ConversationSearchScope
  search: ConversationSearchLoader
  onSelect: (item: SearchResult, query: string) => void
  source: string
  conversationTitles?: Readonly<Record<string, string>>
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<ConversationSearchScope>(
    conversationId ? initialScope : "all"
  )
  const keyword = query.trim()
  const targetId = scope === "current" ? conversationId : undefined
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ToggleGroup
        aria-label={t("common.conversationSearchScope")}
        variant="outline"
        size="sm"
        value={[scope]}
        onValueChange={(values) => {
          const value = values[0]
          if (value === "all" || value === "current") setScope(value)
        }}
      >
        <ToggleGroupItem value="all">
          {t("common.conversationSearchAll")}
        </ToggleGroupItem>
        <ToggleGroupItem value="current" disabled={!conversationId}>
          {t("common.conversationSearchCurrent")}
        </ToggleGroupItem>
      </ToggleGroup>
      <Command shouldFilter={false} className="min-h-0">
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={t("common.conversationSearchPlaceholder")}
          aria-label={t("common.searchChats")}
          maxLength={500}
        />
        {keyword ? (
          <SearchResults
            key={`${targetId ?? "all"}:${keyword}`}
            query={keyword}
            conversationId={targetId}
            source={source}
            conversationTitles={conversationTitles}
            search={search}
            onSelect={onSelect}
          />
        ) : (
          <CommandList>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("common.conversationSearchStart")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </CommandList>
        )}
      </Command>
    </div>
  )
}

function SearchResults({
  query,
  conversationId,
  search,
  onSelect,
  source,
  conversationTitles,
}: {
  query: string
  conversationId?: string | null
  search: ConversationSearchLoader
  onSelect: (item: SearchResult, query: string) => void
  source: string
  conversationTitles?: Readonly<Record<string, string>>
}) {
  const t = useT()
  const [items, setItems] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [complete, setComplete] = useState(false)
  const request = useRef<AbortController | null>(null)
  const liveEntries = useLiveConversationSearch((state) => state.entries)
  const matchedItems = useMemo(
    () =>
      mergeLiveConversationSearchResults(items, liveEntries.values(), {
        source,
        query,
        conversationId,
        titles: conversationTitles,
        fallbackTitle: t("common.newChat"),
      }),
    [items, liveEntries, source, query, conversationId, conversationTitles, t]
  )
  const load = useCallback(
    async (nextCursor: string | null) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      setError(null)
      try {
        const page = await loadConversationSearchPage(
          search,
          {
            query,
            conversationId: conversationId ?? undefined,
            cursor: nextCursor,
            signal: controller.signal,
          },
          (progress) => {
            setCursor(progress.next_cursor)
          }
        )
        if (controller.signal.aborted) return
        setItems((previous) =>
          mergeConversationSearchResults(previous, page.items)
        )
        setCursor(page.next_cursor)
        setHasMore(page.has_more)
        setComplete(page.complete)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : t("common.searchFailed")
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [conversationId, query, search, t]
  )

  useEffect(() => {
    const timeout = setTimeout(() => void load(null), 200)
    return () => {
      clearTimeout(timeout)
      request.current?.abort()
    }
  }, [load])

  return (
    <CommandList aria-busy={loading} className="max-h-[min(50dvh,24rem)]">
      {(["conversation", "message"] as const).map((kind) => {
        const matches = matchedItems.filter((item) => item.kind === kind)
        if (!matches.length) return null
        return (
          <CommandGroup
            key={kind}
            heading={t(
              kind === "conversation"
                ? "common.conversationSearchTitles"
                : "common.conversationSearchMessages"
            )}
          >
            {matches.map((item) => (
              <CommandItem
                key={conversationSearchResultKey(item)}
                value={conversationSearchResultKey(item)}
                data-search-kind={item.kind}
                data-search-conversation-id={item.conversation_id}
                data-search-message-id={item.message_id ?? item.snapshot_id}
                onSelect={() => onSelect(item, query)}
                className="items-start py-2.5"
              >
                {kind === "conversation" ? (
                  <MessagesSquareIcon />
                ) : (
                  <MessageCircleIcon />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">
                      <HighlightedText text={item.title} query={query} />
                    </span>
                    {item.is_archived && (
                      <Badge variant="outline">
                        <ArchiveIcon />
                        {t("common.conversationSearchArchived")}
                      </Badge>
                    )}
                  </span>
                  {(item.excerpt || item.text) && (
                    <span className="line-clamp-3 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                      <HighlightedText
                        text={item.excerpt || item.text || ""}
                        query={query}
                      />
                    </span>
                  )}
                  {kind === "message" && (
                    <span className="text-xs text-muted-foreground">
                      {item.role === "user"
                        ? t("common.conversationSearchUser")
                        : t("common.conversationSearchAssistant")}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )
      })}
      {loading && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 p-5 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden="true" />
          {t("common.searching")}
        </div>
      )}
      {error && (
        <Alert className="my-2">
          <AlertDescription>{error}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void load(cursor)}>
            {t("common.retry")}
          </Button>
        </Alert>
      )}
      {!loading && !error && complete && !matchedItems.length && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("common.noMatchingChats")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && !error && hasMore && (
        <div className="flex justify-center p-2">
          <Button variant="outline" size="sm" onClick={() => void load(cursor)}>
            {t("common.conversationSearchMore")}
          </Button>
        </div>
      )}
    </CommandList>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return conversationSearchHighlight(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="rounded-sm bg-accent text-accent-foreground">
        {part.text}
      </mark>
    ) : (
      part.text
    )
  )
}
