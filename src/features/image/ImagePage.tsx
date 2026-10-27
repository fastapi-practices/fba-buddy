import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import {
  ModelSlotMachine,
  ModelSlotTrigger,
} from "@/components/ai-elements/model-slot-machine"
import { TooltipIconButton } from "@/components/ai-elements/tooltip-icon-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { defaultModelForKind, getModelOptions } from "@/api"
import { queryKeys } from "@/api/query-keys"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  filterImageGenerationProviders,
  isImagePickerModel,
} from "@/features/image/image-models"
import {
  imageAspectOptionsForProvider,
  imageSizeOptionsForProvider,
  usesOpenAiImageOptions,
} from "@/features/image/image-options"
import { ImageSettingsButton } from "@/features/image/image-settings"
import {
  buildProviderModelOptions,
  parseModelOptionId,
  providerTone,
  resolveChatDefaultModel,
} from "@/features/chat/model-option"
import { useModelCatalog } from "@/features/chat/modelpedia-client"

import { useImageStore } from "@/features/image/image-store"
import { ImageConversation } from "@/features/image/image-conversation"
import { useImageConversation } from "@/features/image/use-image-conversations"
import {
  DEFAULT_TEMPLATE_ID,
  IMAGE_TEMPLATES,
  fanPose,
  isFanVisible,
  templateIndexById,
  wrapOffset,
} from "@/features/image/image-templates"
import { useImageGen } from "@/features/image/use-image-gen"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"
import type { ForwardedProps } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ImagePage() {
  const t = useT()
  const queryClient = useQueryClient()
  const composer = useComposerStore()
  const setImageModel = useComposerStore((state) => state.setImageModel)
  const prompt = useImageStore((state) => state.prompt)
  const setPrompt = useImageStore((state) => state.setPrompt)
  const items = useImageStore((state) => state.items)
  const selectedConversationId = useImageStore(
    (state) => state.selectedConversationId
  )
  const conversation = useImageConversation(selectedConversationId)
  const { generate, stop } = useImageGen()
  const busy =
    selectedConversationId != null &&
    items.some(
      (item) =>
        item.conversationId === selectedConversationId &&
        item.status === "streaming"
    )
  const streaming = conversation.isGenerating
  const unavailable =
    busy ||
    streaming ||
    conversation.isLoading ||
    (conversation.isError && conversation.messages.length === 0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const modelOptionsQuery = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })
  const providers = useMemo(
    () => modelOptionsQuery.data?.providers ?? [],
    [modelOptionsQuery.data?.providers]
  )
  const modelIds = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models.map((model) => model.model_id)
      ),
    [providers]
  )
  const catalogQuery = useModelCatalog(modelIds)
  const catalog = catalogQuery.data
  const imageProviders = useMemo(
    () => filterImageGenerationProviders(providers),
    [providers]
  )
  const models = useMemo(
    () => buildProviderModelOptions(imageProviders, undefined, catalog),
    [catalog, imageProviders]
  )
  const imageModelProviders = useMemo(
    () =>
      imageProviders
        .map((provider) => ({
          id: String(provider.id),
          name: provider.name,
          tone: providerTone(provider.type),
          models: models.filter(
            (model) => model.providerId === String(provider.id)
          ),
        }))
        .filter((provider) => provider.models.length > 0),
    [imageProviders, models]
  )
  const modelValue = composer.image_model_id
    ? `${composer.image_provider_id}:${composer.image_model_id}`
    : undefined
  const selectedImageModel = models.find((model) => model.id === modelValue)

  useEffect(() => {
    const currentProvider = imageProviders.find(
      (provider) => provider.id === composer.image_provider_id
    )
    const currentModel = currentProvider?.models.find(
      (model) => model.model_id === composer.image_model_id
    )
    const currentOk =
      currentProvider != null &&
      currentModel != null &&
      isImagePickerModel(currentModel)
    if (!currentProvider || !currentOk) {
      const fallback = resolveChatDefaultModel(
        imageProviders,
        defaultModelForKind(modelOptionsQuery.data, "image")
      )
      if (fallback) {
        setImageModel(fallback.provider_id, fallback.model_id)
      }
      return
    }
    const providerType = currentProvider.type
    const patch: Partial<ForwardedProps> = {}
    const sizeOptions = imageSizeOptionsForProvider(providerType)
    const aspectOptions = imageAspectOptionsForProvider(providerType)
    if (
      composer.image_size != null &&
      !sizeOptions.some((item) => item.value === composer.image_size)
    ) {
      patch.image_size = sizeOptions[0]?.value ?? null
    }
    if (
      composer.image_aspect_ratio != null &&
      !aspectOptions.some((item) => item.value === composer.image_aspect_ratio)
    ) {
      patch.image_aspect_ratio = aspectOptions[0]?.value ?? null
    }
    if (!usesOpenAiImageOptions(providerType)) {
      if (composer.image_quality) {
        patch.image_quality = null
      }
      if (composer.image_background) {
        patch.image_background = null
      }
      if (composer.image_input_fidelity) {
        patch.image_input_fidelity = null
      }
      if (composer.image_moderation) {
        patch.image_moderation = null
      }
      if (composer.image_output_format) {
        patch.image_output_format = null
      }
      if (composer.image_output_compression != null) {
        patch.image_output_compression = null
      }
    }
    if (Object.keys(patch).length > 0) {
      useComposerStore.getState().setSampling(patch)
    }
  }, [
    composer.image_aspect_ratio,
    composer.image_background,
    composer.image_input_fidelity,
    composer.image_moderation,
    composer.image_output_compression,
    composer.image_output_format,
    composer.image_model_id,
    composer.image_provider_id,
    composer.image_quality,
    composer.image_size,
    imageProviders,
    modelOptionsQuery.data,
    providers,
    setImageModel,
  ])

  function submit() {
    if (unavailable) return
    if (!prompt.trim()) {
      notifyError(t("common.enterADescriptionFirst"))
      return
    }
    if (!composer.image_provider_id || !composer.image_model_id) {
      notifyError(t("common.selectAModelFirst"))
      return
    }
    void generate()
  }

  function selectTemplate(index: number) {
    const template = IMAGE_TEMPLATES[index]
    if (!template) {
      return
    }
    setSelectedIndex(index)
    setPrompt(template.prompt)
  }

  return (
    <div
      data-slot="image-page"
      className="app-content-surface absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
      style={{ ["--thread-max-width" as string]: "44rem" }}
    >
      <div className="min-h-0 min-w-0 flex-1">
        {selectedConversationId === null ? (
          <div className="h-full overflow-x-hidden overflow-y-auto">
            <ImageLanding
              selectedIndex={selectedIndex}
              onSelect={selectTemplate}
            />
          </div>
        ) : (
          <ImageConversation
            key={selectedConversationId}
            conversationId={selectedConversationId}
            {...conversation}
          />
        )}
      </div>
      <div className="mx-auto w-full max-w-(--thread-max-width) min-w-0 shrink-0 px-4 pb-2">
        <ImageComposer
          prompt={prompt}
          setPrompt={setPrompt}
          streaming={streaming}
          disabled={unavailable}
          onSubmit={submit}
          onStop={stop}
          placeholder={t(
            "hints.describeTheImageYouWantEGAQuietLakeAtSunsetWithMountainsInTheDistance"
          )}
        >
          <ModelSlotMachine
            providers={imageModelProviders}
            value={modelValue}
            efforts={undefined}
            effort={undefined}
            onSelect={(modelId) => {
              const parsed = parseModelOptionId(modelId)
              if (!parsed) return
              setImageModel(parsed.providerId, parsed.modelId)
            }}
            onEffortChange={() => undefined}
            onOpenChange={(open) => {
              if (!open) return
              void queryClient.invalidateQueries({
                queryKey: queryKeys.modelOptions(),
              })
            }}
            className="min-w-28 shrink-0"
            trigger={
              <ModelSlotTrigger
                model={selectedImageModel}
                placeholder={t("common.selectAModel")}
              />
            }
          />
          <ImageSettingsButton
            providerType={
              providers.find(
                (provider) => provider.id === composer.image_provider_id
              )?.type
            }
          />
        </ImageComposer>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          {t("common.imagesAreAiGeneratedPleaseReviewBeforeUse")}
        </p>
      </div>
    </div>
  )
}

function ImageLanding({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number | null
  onSelect: (index: number) => void
}) {
  const t = useT()
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center gap-10 overflow-x-clip px-4 py-10 text-center">
      <h1 className="text-2xl font-medium tracking-tight">
        {t("common.leaveRoomForYourNextMasterpiece")}
      </h1>
      <TemplateFan selectedIndex={selectedIndex} onSelect={onSelect} />
      <p className="max-w-xl text-sm text-muted-foreground">
        {t("hints.chooseATemplateToStartThenMakeItYoursBelow")}
      </p>
    </div>
  )
}

function TemplateFan({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number | null
  onSelect: (index: number) => void
}) {
  const t = useT()
  const count = IMAGE_TEMPLATES.length
  const layoutIndex = selectedIndex ?? templateIndexById(DEFAULT_TEMPLATE_ID)
  const selectedTemplate =
    selectedIndex == null ? undefined : IMAGE_TEMPLATES[selectedIndex]

  function step(delta: number) {
    onSelect((layoutIndex + delta + count) % count)
  }

  return (
    <div
      className="w-full max-w-(--thread-max-width) min-w-0 outline-none"
      tabIndex={0}
      role="listbox"
      aria-label={t("common.chooseATemplate")}
      aria-activedescendant={
        selectedTemplate ? `image-template-${selectedTemplate.id}` : undefined
      }
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          step(-1)
        }
        if (event.key === "ArrowRight") {
          event.preventDefault()
          step(1)
        }
      }}
    >
      <div className="relative mx-auto h-56 w-full overflow-x-clip pt-10 [perspective:920px] sm:h-60">
        {IMAGE_TEMPLATES.map((template, index) => {
          const offset = wrapOffset(index, layoutIndex, count)
          const visible = isFanVisible(offset)
          const pose = fanPose(offset)
          const selected = selectedIndex === index
          return (
            <Tooltip key={template.id}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    id={`image-template-${template.id}`}
                    role="option"
                    variant="ghost"
                    aria-selected={selected}
                    aria-label={t(template.label)}
                    tabIndex={-1}
                    className={cn(
                      "absolute top-1/2 left-1/2 h-40 w-28 rounded-2xl bg-transparent p-0 shadow-lg ring-1 ring-foreground/10 transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-transparent sm:h-44 sm:w-32",
                      selected && "shadow-xl",
                      !visible && "pointer-events-none opacity-0"
                    )}
                    style={{
                      transform: `translate(-50%, -50%) translateX(${pose.translateX}rem) translateY(${pose.offsetY}px) rotateY(${pose.rotateY}deg) rotate(${pose.rotate}deg) scale(${pose.scale})`,
                      filter: `brightness(${pose.brightness})`,
                      zIndex: 10 - Math.abs(offset),
                    }}
                    onClick={() => onSelect(index)}
                  />
                }
              >
                <span className="block size-full overflow-hidden rounded-2xl">
                  <img
                    src={template.src}
                    alt={t(template.label)}
                    draggable={false}
                    className="pointer-events-none size-full object-cover"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={12}
                className="rounded-full"
              >
                {t(template.label)}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

function ImageComposer({
  prompt,
  setPrompt,
  streaming,
  disabled,
  onSubmit,
  onStop,
  placeholder,
  children,
}: {
  prompt: string
  setPrompt: (value: string) => void
  streaming: boolean
  disabled: boolean
  onSubmit: () => void
  onStop: () => Promise<void>
  placeholder: string
  children: ReactNode
}) {
  const t = useT()
  const canSubmit = Boolean(prompt.trim()) && !disabled

  return (
    <form
      className="composer-root relative flex w-full flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      <div className="chat-composer-surface flex w-full cursor-text flex-col gap-2 p-2">
        <div className="composer-lexical-input min-w-0">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={placeholder}
            disabled={streaming}
            className="composer-input composer-lexical-editor min-h-10 w-full resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent px-0 py-1 text-base leading-6 caret-primary shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent"
            rows={1}
            enterKeyHint="send"
            aria-label={t("common.scene")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                if (canSubmit) onSubmit()
              }
            }}
          />
        </div>
        <div className="composer-action-wrapper relative flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {children}
          </div>
          {streaming ? (
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              aria-label={t("common.stopGenerating")}
              onClick={() => void onStop()}
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          ) : (
            <TooltipIconButton
              tooltip={t("common.generate")}
              side="top"
              type="submit"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              aria-label={t("common.generate")}
              disabled={!canSubmit}
            >
              <ArrowUpIcon className="size-4" />
            </TooltipIconButton>
          )}
        </div>
      </div>
    </form>
  )
}
