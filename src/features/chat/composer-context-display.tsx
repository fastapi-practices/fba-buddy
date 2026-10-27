import { useMemo } from "react"
import { useChatRuntimeState } from "@/features/chat/chat-runtime"

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextRing,
  ContextTrigger,
} from "@/components/ai-elements/context"
import { useComposerStore } from "@/features/chat/composer-store"
import { usageFromThreadMessages } from "@/features/chat/context-usage"
import {
  getModelContextWindow,
  normalizeModelId,
} from "@/features/chat/model-meta"
import { useModelCatalog } from "@/features/chat/modelpedia-client"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useT } from "@/hooks/use-t"
import type { ProviderOption } from "@/lib/types"

export function ComposerContextDisplay({
  providers,
}: {
  providers: ProviderOption[]
}) {
  const t = useT()
  const showContextUsage = usePrefsStore((state) => state.showContextUsage)
  const modelId = useComposerStore((state) => state.model_id)
  const providerId = useComposerStore((state) => state.provider_id)
  const modelIds = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models.map((model) => model.model_id)
      ),
    [providers]
  )
  const catalog = useModelCatalog(modelIds).data
  const provider = providers.find((item) => item.id === providerId)
  const remote = modelId ? catalog?.get(normalizeModelId(modelId)) : undefined
  const modelContextWindow = modelId
    ? getModelContextWindow(modelId, provider?.type, remote)
    : undefined
  const threadMessages = useChatRuntimeState((state) => state.thread.messages)
  const usage = useMemo(
    () => usageFromThreadMessages(threadMessages),
    [threadMessages]
  )

  if (!showContextUsage) {
    return null
  }

  if (modelContextWindow == null || modelContextWindow <= 0) {
    return null
  }

  return (
    <Context
      maxTokens={modelContextWindow}
      usage={usage}
      modelId={modelId}
    >
      <ContextTrigger
        className="size-7 justify-center"
        aria-label={t("common.contextUsage")}
      >
        <ContextRing />
      </ContextTrigger>
      <ContextContent side="top">
        <ContextContentHeader />
        <ContextContentBody />
        <ContextContentFooter />
      </ContextContent>
    </Context>
  )
}
