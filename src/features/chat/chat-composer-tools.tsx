import { useAgentMode } from "@/features/chat/conversation-mode"
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BanIcon,
  GlobeIcon,
  InboxIcon,
  PlugIcon,
  QuoteIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { DEFAULT_EFFORT_OPTIONS } from "@/features/chat/model-option"
import {
  ModelSlotMachine,
  ModelSlotTrigger,
} from "@/components/ai-elements/model-slot-machine"
import { TooltipHint } from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { listMcps, listQuickPhrases, listWebSearchOptions } from "@/api"
import { ApiError, apiErrorMessage, isAbortError } from "@/api/http"
import { getMcpOauth } from "@/api/mcp-oauth"
import { queryKeys } from "@/api/query-keys"
import { ComposerCodingPermissionMenu } from "@/features/chat/composer-agent-mode"
import { ComposerAttachMenu } from "@/features/chat/composer-attach-menu"
import { ComposerAssistantChip } from "@/features/chat/composer-assistant-chip"
import { ConversationSettingsButton } from "@/features/chat/conversation-settings"
import { matchesPickerQuery } from "@/features/chat/composer-picker-query"
import { PickerSearch } from "@/features/chat/composer-picker-search"
import { COMPOSER_RAIL_BUTTON_CLASS } from "@/features/chat/composer-model-picker"
import { useComposerStore } from "@/features/chat/composer-store"
import { ChatPaneSlotsContext } from "@/features/chat/chat-pane-slots"
import {
  modelCheckpointLabel,
  recordModelSwitch,
} from "@/features/chat/model-checkpoints"
import { useChatRuntimeState } from "@/features/chat/chat-runtime"
import { filterChatProviders } from "@/features/image/image-models"
import { getModelThinking, normalizeModelId } from "@/features/chat/model-meta"
import { useModelCatalog } from "@/features/chat/modelpedia-client"
import { McpOauth } from "@/features/mcp/mcp-oauth"
import {
  isMcpOauthEligible,
  mcpOauthQueryKey,
  useMcpOauthStatus,
} from "@/features/mcp/use-mcp-oauth"
import {
  buildProviderModelOptions,
  parseModelOptionId,
  providerTone,
  resolveChatDefaultModel,
} from "@/features/chat/model-option"
import {
  buildEffortOptions,
  effortToThinking,
  resolveThinkingForModel,
  thinkingToEffort,
} from "@/features/chat/thinking"
import { useT } from "@/hooks/use-t"
import { useAccountSourceStore } from "@/lib/account-source"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"
import type { DefaultModel, McpItem, ProviderOption } from "@/lib/types"

function ComposerRailMenuTrigger({
  label,
  pressed,
  children,
  submenu = false,
}: {
  label: string
  pressed?: boolean
  children: ReactNode
  submenu?: boolean
}) {
  const labelled = useAgentMode() !== "coding"
  if (submenu)
    return (
      <DropdownMenuSubTrigger>
        {children}
        {label}
      </DropdownMenuSubTrigger>
    )
  return (
    <TooltipHint label={label} side="top">
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={labelled ? "sm" : "icon"}
            aria-label={label}
            aria-pressed={pressed}
            className={cn(
              labelled ? "shrink-0 rounded-full" : COMPOSER_RAIL_BUTTON_CLASS,
              pressed && "bg-muted-foreground/15 text-foreground"
            )}
          />
        }
      >
        {children}
        {labelled ? label : null}
      </DropdownMenuTrigger>
    </TooltipHint>
  )
}

function SearchableMenu({
  trigger,
  placeholder,
  empty,
  children,
  submenu = false,
}: {
  trigger: ReactNode
  placeholder: string
  empty: ReactNode
  children: (query: string) => ReactNode
  submenu?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const items = children(query)
  const isEmpty = items == null || (Array.isArray(items) && items.length === 0)
  const Menu = submenu ? DropdownMenuSub : DropdownMenu
  const Content = submenu ? DropdownMenuSubContent : DropdownMenuContent

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery("")
        }
      }}
    >
      {trigger}
      <Content
        align="start"
        className="w-72 overflow-x-hidden overflow-y-hidden p-1"
      >
        <PickerSearch
          value={query}
          placeholder={placeholder}
          onChange={setQuery}
        />
        <div className="max-h-64 overflow-y-auto">
          <DropdownMenuGroup>{isEmpty ? empty : items}</DropdownMenuGroup>
        </div>
      </Content>
    </Menu>
  )
}

function EmptyMenuItem({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <DropdownMenuItem disabled>
      {icon}
      {children}
    </DropdownMenuItem>
  )
}

function SelectedMcpConnectionGate({ mcp }: { mcp: McpItem }) {
  const status = useMcpOauthStatus(mcp)
  useEffect(() => {
    if (!status.data?.configured || status.data.connected) return
    const composer = useComposerStore.getState()
    const selected = composer.mcp_ids ?? []
    if (selected.includes(mcp.id)) {
      composer.setMcpIds(selected.filter((id) => id !== mcp.id))
    }
  }, [mcp.id, status.data?.configured, status.data?.connected])
  return null
}

export type ChatComposerToolsParts = {
  attach: (children?: ReactNode) => ReactNode
  assistant: ReactNode
  permission: ReactNode
  model: ReactNode
  options: ReactNode
}

export function ChatComposerTools({
  providers,
  defaultModel,
  conversationId,
  children,
  toolsInMenu,
}: {
  providers: ProviderOption[]
  defaultModel?: DefaultModel | null
  conversationId: string | null
  children: (parts: ChatComposerToolsParts) => ReactNode
  toolsInMenu: boolean
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const epoch = useAccountSourceStore((state) => state.epoch)
  const composer = useComposerStore()
  const mode = useAgentMode()
  const paneSlots = useContext(ChatPaneSlotsContext)
  // 对话中途换模型要留检查点，得知道当前已有多少条用户消息
  const userMessageCount = useChatRuntimeState(
    (state) => state.thread.messages.filter((item) => item.role === "user").length
  )
  const selectionRequest = useRef<AbortController | null>(null)
  const [pendingMcp, setPendingMcp] = useState<{
    id: number
    epoch: number
  } | null>(null)
  const [connectionMcp, setConnectionMcp] = useState<{
    id: number
    epoch: number
  } | null>(null)
  const mcpsQuery = useQuery({
    queryKey: queryKeys.mcps(),
    queryFn: listMcps,
  })
  const phrasesQuery = useQuery({
    queryKey: queryKeys.quickPhrases(),
    queryFn: listQuickPhrases,
  })
  const searchQuery = useQuery({
    queryKey: queryKeys.webSearchOptions(),
    queryFn: listWebSearchOptions,
  })
  const mcps = mcpsQuery.data ?? []
  const phrases = phrasesQuery.data ?? []
  const selectedMcps = composer.mcp_ids ?? []
  const connectingMcp =
    connectionMcp?.epoch === epoch
      ? mcps.find((mcp) => mcp.id === connectionMcp.id)
      : undefined
  const checkingMcpId = pendingMcp?.epoch === epoch ? pendingMcp.id : null
  const modelIds = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models.map((model) => model.model_id)
      ),
    [providers]
  )
  const catalogQuery = useModelCatalog(modelIds)
  const catalog = catalogQuery.data
  const chatProviders = useMemo(
    () => filterChatProviders(providers),
    [providers]
  )
  const modelValue = composer.model_id
    ? `${composer.provider_id}:${composer.model_id}`
    : undefined
  const selectedThinking = useMemo(() => {
    const provider = chatProviders.find(
      (item) => item.id === composer.provider_id
    )
    const selected = provider?.models.find(
      (model) => model.model_id === composer.model_id
    )
    if (!provider || !composer.model_id) {
      return undefined
    }
    return getModelThinking(
      composer.model_id,
      provider.type,
      catalog?.get(normalizeModelId(composer.model_id)),
      selected?.capabilities,
      selected?.thinking_policy
    )
  }, [catalog, chatProviders, composer.model_id, composer.provider_id])
  const models = useMemo(
    () =>
      buildProviderModelOptions(
        chatProviders,
        (provider, model) => ({
          efforts: buildEffortOptions(
            getModelThinking(
              model.model_id,
              provider.type,
              catalog?.get(normalizeModelId(model.model_id)),
              model.capabilities,
              model.thinking_policy
            ),
            t
          ),
        }),
        catalog
      ),
    [catalog, chatProviders, t]
  )
  const thinking = composer.thinking
  const setThinkingMode = composer.setThinkingMode
  const setModel = useComposerStore((state) => state.setModel)
  // 打开模型菜单时顺手刷新一次模型列表
  const refreshModelOptions = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.modelOptions(),
    })
  }, [queryClient])
  const searchOptions = [
    { value: "off" as const, label: t("common.off"), disabled: false },
    ...(searchQuery.data ?? []).map((item) => ({
      value: item.type,
      label: item.name,
      disabled: item.status !== 1 || item.key_status !== 1,
    })),
  ]

  useEffect(() => {
    return () => selectionRequest.current?.abort()
  }, [epoch])

  useEffect(() => {
    if (!mcpsQuery.isSuccess) return
    const state = useComposerStore.getState()
    const selected = state.mcp_ids ?? []
    const available = new Set(mcpsQuery.data.map((mcp) => mcp.id))
    const next = selected.filter((id) => available.has(id))
    if (next.length !== selected.length) state.setMcpIds(next)
  }, [mcpsQuery.data, mcpsQuery.isSuccess])

  async function toggleMcp(mcp: McpItem) {
    const state = useComposerStore.getState()
    if (state.mcp_ids?.includes(mcp.id)) {
      state.toggleMcp(mcp.id)
      return
    }
    if (!isMcpOauthEligible(mcp)) {
      state.toggleMcp(mcp.id)
      return
    }
    if (selectionRequest.current && !selectionRequest.current.signal.aborted) {
      return
    }
    const controller = new AbortController()
    selectionRequest.current = controller
    setPendingMcp({ id: mcp.id, epoch })
    try {
      const status = await getMcpOauth(mcp.id, controller.signal)
      if (
        controller.signal.aborted ||
        useAccountSourceStore.getState().epoch !== epoch
      ) {
        return
      }
      const current = queryClient
        .getQueryData<McpItem[]>(queryKeys.mcps())
        ?.find((item) => item.id === mcp.id)
      if (
        !current ||
        current.type !== mcp.type ||
        current.url !== mcp.url ||
        current.user_id !== mcp.user_id
      ) {
        return
      }
      queryClient.setQueryData(mcpOauthQueryKey(mcp, epoch), status)
      if (status.configured && !status.connected) {
        setConnectionMcp({ id: mcp.id, epoch })
        return
      }
      const latest = useComposerStore.getState()
      const selected = latest.mcp_ids ?? []
      if (!selected.includes(mcp.id)) latest.setMcpIds([...selected, mcp.id])
    } catch (error) {
      if (
        controller.signal.aborted ||
        isAbortError(error) ||
        useAccountSourceStore.getState().epoch !== epoch
      ) {
        return
      }
      notifyError(apiErrorMessage(error, t("common.requestFailed")))
      if (error instanceof ApiError && [403, 404].includes(error.code)) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.mcps() })
      }
    } finally {
      if (selectionRequest.current === controller) {
        selectionRequest.current = null
        setPendingMcp(null)
      }
    }
  }

  useEffect(() => {
    if (chatProviders.length === 0) {
      return
    }
    const currentOk = chatProviders.some(
      (provider) =>
        provider.id === composer.provider_id &&
        provider.models.some((model) => model.model_id === composer.model_id)
    )
    if (!currentOk) {
      const fallback = resolveChatDefaultModel(chatProviders, defaultModel)
      if (fallback) {
        setModel(fallback.provider_id, fallback.model_id)
      }
      return
    }
    const next = resolveThinkingForModel(selectedThinking, thinking)
    if (next !== thinking) {
      setThinkingMode(next)
    }
  }, [
    chatProviders,
    composer.model_id,
    composer.provider_id,
    defaultModel,
    selectedThinking,
    setModel,
    setThinkingMode,
    thinking,
  ])

  const selectedOption = models.find((model) => model.id === modelValue)
  const selectedEfforts = (() => {
    const efforts = selectedOption?.efforts
    if (!efforts) return undefined
    return efforts === true ? DEFAULT_EFFORT_OPTIONS : efforts
  })()

  // 选模型：记检查点、切模型、顺带修正思考强度
  const selectModel = useCallback(
    (modelId: string) => {
      const parsed = parseModelOptionId(modelId)
      if (!parsed) return
      const nextProvider = chatProviders.find(
        (provider) => provider.id === parsed.providerId
      )
      recordModelSwitch({
        conversationId,
        draftKey: paneSlots.paneKey,
        from: {
          providerId: composer.provider_id,
          modelId: composer.model_id,
          label: modelCheckpointLabel(
            chatProviders,
            composer.provider_id,
            composer.model_id
          ),
        },
        to: {
          providerId: parsed.providerId,
          modelId: parsed.modelId,
          label: modelCheckpointLabel(
            chatProviders,
            parsed.providerId,
            parsed.modelId
          ),
        },
        userMessageCount,
      })
      setModel(parsed.providerId, parsed.modelId)
      setThinkingMode(
        resolveThinkingForModel(
          getModelThinking(
            parsed.modelId,
            nextProvider?.type,
            catalog?.get(normalizeModelId(parsed.modelId)),
            nextProvider?.models.find(
              (model) => model.model_id === parsed.modelId
            )?.capabilities,
            nextProvider?.models.find(
              (model) => model.model_id === parsed.modelId
            )?.thinking_policy
          ),
          thinking
        )
      )
    },
    [
      catalog,
      chatProviders,
      composer.model_id,
      composer.provider_id,
      conversationId,
      paneSlots.paneKey,
      setModel,
      setThinkingMode,
      thinking,
      userMessageCount,
    ]
  )

  // 模型菜单按供应商分组，一级供应商、二级模型、三级思考强度
  const modelProviders = useMemo(
    () =>
      chatProviders
        .map((provider) => ({
          id: String(provider.id),
          name: provider.name,
          tone: providerTone(provider.type),
          models: models.filter(
            (model) => model.providerId === String(provider.id)
          ),
        }))
        .filter((provider) => provider.models.length > 0),
    [chatProviders, models]
  )
  const currentEffortName = selectedEfforts?.find(
    (item) => item.id === thinkingToEffort(thinking)
  )?.name

  const model = (
    <ModelSlotMachine
      providers={modelProviders}
      value={modelValue}
      efforts={selectedEfforts}
      effort={thinkingToEffort(thinking)}
      onSelect={selectModel}
      onEffortChange={(effort) => {
        setThinkingMode(effortToThinking(effort))
      }}
      onOpenChange={(open) => {
        if (open) refreshModelOptions()
      }}
      className={mode === "chat" ? "max-w-none shrink-0" : undefined}
      trigger={
        <ModelSlotTrigger
          model={selectedOption}
          effortName={currentEffortName}
          placeholder={t("common.selectAModel")}
        />
      }
    />
  )
  const options = (
    <>
      <>
        <SearchableMenu
          submenu={toolsInMenu}
          trigger={
            <ComposerRailMenuTrigger
              submenu={toolsInMenu}
              label={t("common.webSearch")}
              pressed={composer.web_search !== "off"}
            >
              <GlobeIcon />
            </ComposerRailMenuTrigger>
          }
          placeholder={t("common.searchSources")}
          empty={
            <EmptyMenuItem icon={<InboxIcon />}>
              {t("common.noMatchingSources")}
            </EmptyMenuItem>
          }
        >
          {(query) => {
            const filtered = searchOptions.filter((item) =>
              matchesPickerQuery(query, item.label, item.value)
            )
            if (filtered.length === 0) {
              return null
            }
            return (
              <DropdownMenuRadioGroup
                value={composer.web_search ?? "off"}
                onValueChange={(value) => {
                  const next = searchOptions.find(
                    (item) => item.value === value
                  )
                  if (next && !next.disabled) {
                    composer.setWebSearch(next.value)
                  }
                }}
              >
                {filtered.map((item) => (
                  <DropdownMenuRadioItem
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                  >
                    {item.value === "off" ? <BanIcon /> : <GlobeIcon />}
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )
          }}
        </SearchableMenu>
        <SearchableMenu
          submenu={toolsInMenu}
          trigger={
            <ComposerRailMenuTrigger
              submenu={toolsInMenu}
              label={
                selectedMcps.length > 0
                  ? `${t("common.mcp")} · ${selectedMcps.length}`
                  : t("common.mcp")
              }
              pressed={selectedMcps.length > 0}
            >
              <PlugIcon />
            </ComposerRailMenuTrigger>
          }
          placeholder={t("common.searchMcp")}
          empty={
            <EmptyMenuItem icon={<InboxIcon />}>
              {mcps.length === 0
                ? t("common.noMcpServers")
                : t("common.noMatchingMcpServers")}
            </EmptyMenuItem>
          }
        >
          {(query) => {
            const filtered = mcps.filter((mcp) =>
              matchesPickerQuery(
                query,
                mcp.name,
                mcp.description,
                mcp.url,
                mcp.command,
                mcp.tool_prefix
              )
            )
            return filtered.length === 0 ? (
              <EmptyMenuItem icon={<InboxIcon />}>
                {mcps.length === 0
                  ? t("common.noMcpServers")
                  : t("common.noMatchingMcpServers")}
              </EmptyMenuItem>
            ) : (
              filtered.map((mcp) => (
                <DropdownMenuCheckboxItem
                  key={mcp.id}
                  checked={selectedMcps.includes(mcp.id)}
                  disabled={
                    checkingMcpId != null && !selectedMcps.includes(mcp.id)
                  }
                  onCheckedChange={() => void toggleMcp(mcp)}
                >
                  {checkingMcpId === mcp.id ? <Spinner /> : <PlugIcon />}
                  {mcp.name}
                </DropdownMenuCheckboxItem>
              ))
            )
          }}
        </SearchableMenu>
      </>

      <SearchableMenu
        submenu={toolsInMenu}
        trigger={
          <ComposerRailMenuTrigger
            submenu={toolsInMenu}
            label={t("commands.quickPhrases")}
          >
            <QuoteIcon />
          </ComposerRailMenuTrigger>
        }
        placeholder={t("common.searchPhrases")}
        empty={
          <EmptyMenuItem icon={<InboxIcon />}>
            {phrases.length === 0
              ? t("common.noQuickPhrases")
              : t("common.noMatchingPhrases")}
          </EmptyMenuItem>
        }
      >
        {(query) => {
          const filtered = phrases.filter((phrase) =>
            matchesPickerQuery(query, phrase.title, phrase.content)
          )
          if (filtered.length === 0) {
            return null
          }
          return filtered.map((phrase) => (
            <DropdownMenuItem
              key={phrase.id}
              onClick={() => composer.insertPhrase(phrase.content)}
            >
              <QuoteIcon />
              {phrase.title}
            </DropdownMenuItem>
          ))
        }}
      </SearchableMenu>
      <ConversationSettingsButton
        conversationId={conversationId}
        menuItem={toolsInMenu}
      />
    </>
  )

  return (
    <>
      {mcps
        .filter(
          (mcp) => selectedMcps.includes(mcp.id) && isMcpOauthEligible(mcp)
        )
        .map((mcp) => (
          <SelectedMcpConnectionGate key={`${epoch}:${mcp.id}`} mcp={mcp} />
        ))}
      {children({
        attach: (children) => (
          <ComposerAttachMenu>{children}</ComposerAttachMenu>
        ),
        assistant: <ComposerAssistantChip />,
        permission: <ComposerCodingPermissionMenu />,
        model,
        options,
      })}
      <Dialog
        open={connectingMcp != null}
        onOpenChange={(open) => {
          if (!open) setConnectionMcp(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {connectingMcp ? (
            <>
              <DialogHeader>
                <DialogTitle>{connectingMcp.name}</DialogTitle>
                <DialogDescription>
                  {t("oauth.connectionRequired")}
                </DialogDescription>
              </DialogHeader>
              <McpOauth mcp={connectingMcp} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
