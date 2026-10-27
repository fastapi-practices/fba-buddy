import type { Translator } from "@/lib/i18n"
import { CircleHelpIcon, SlidersHorizontalIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipHint,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { COMPOSER_RAIL_BUTTON_CLASS } from "@/features/chat/composer-model-picker"
import { useComposerStore } from "@/features/chat/composer-store"
import {
  DEFAULT_IMAGE_OPTION,
  IMAGE_BACKGROUND_OPTIONS,
  IMAGE_FIDELITY_OPTIONS,
  IMAGE_FORMAT_OPTIONS,
  IMAGE_MODERATION_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  imageAspectOptionsForProvider,
  imageSizeOptionsForProvider,
  isImageAspectRatio,
  isImageBackground,
  isImageInputFidelity,
  isImageModeration,
  isImageOutputFormat,
  isImageQuality,
  isImageSize,
  parseImageCompression,
  usesOpenAiImageOptions,
} from "@/features/image/image-options"
import { useT } from "@/hooks/use-t"
import type { ForwardedProps } from "@/lib/types"
import { cn } from "@/lib/utils"

const SECTIONS = [
  { id: "canvas", label: "image.canvas" },
  { id: "generate", label: "common.generate" },
  { id: "output", label: "common.output" },
] as const

type ImageSettingsSection = (typeof SECTIONS)[number]["id"]

const PIXEL_SIZE_VALUES = new Set([
  "auto",
  "1024x1024",
  "1024x1536",
  "1536x1024",
])

const EMPTY_IMAGE_SETTINGS: Partial<ForwardedProps> = {
  image_size: null,
  image_quality: null,
  image_aspect_ratio: null,
  image_background: null,
  image_input_fidelity: null,
  image_moderation: null,
  image_output_format: null,
  image_output_compression: null,
}

function OptionField({
  id,
  label,
  hint,
  value,
  options,
  optionRows,
  onChange,
  renderOption,
}: {
  id: string
  label: string
  hint?: string
  value: string
  options?: ReadonlyArray<{ value: string; label: string }>
  optionRows?: ReadonlyArray<ReadonlyArray<{ value: string; label: string }>>
  onChange: (value: string) => void
  renderOption?: (item: { value: string; label: string }) => ReactNode
}) {
  const rows = optionRows ?? [options ?? []]
  return (
    <Field>
      <FieldLabelWithHint htmlFor={id} hint={hint}>
        {label}
      </FieldLabelWithHint>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <ToggleGroup
            key={row.map((item) => item.value).join("-")}
            id={index === 0 ? id : undefined}
            aria-labelledby={id}
            value={[value]}
            onValueChange={(next) => {
              const selected = next[0]
              if (selected) {
                onChange(selected)
              }
            }}
            variant="outline"
            spacing={2}
            size="sm"
            className="flex w-full flex-wrap"
          >
            {row.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                className={cn(Boolean(renderOption) && "gap-1.5")}
              >
                {renderOption ? renderOption(item) : item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ))}
      </div>
    </Field>
  )
}

function sizeOptionRows(t: Translator) {
  const items = IMAGE_SIZE_OPTIONS.map((item) => ({
    value: item.value,
    label: t(item.label),
  }))
  return [
    items.filter((item) => PIXEL_SIZE_VALUES.has(item.value)),
    items.filter((item) => !PIXEL_SIZE_VALUES.has(item.value)),
  ]
}

function AspectPreview({ value }: { value: string }) {
  const [width, height] = value.split(":").map(Number)
  if (!width || !height) {
    return null
  }
  const max = 12
  const scale = max / Math.max(width, height)
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-[2px] border border-muted-foreground/45"
      style={{ width: width * scale, height: height * scale }}
    />
  )
}

export function ImageSettingsButton({
  providerType,
}: {
  providerType?: number
}) {
  const t = useT()
  const composer = useComposerStore()
  const [section, setSection] = useState<ImageSettingsSection>("canvas")
  const sizeOptions = imageSizeOptionsForProvider(providerType)
  const aspectOptions = imageAspectOptionsForProvider(providerType)
  const showOpenAiOptions = usesOpenAiImageOptions(providerType)
  const sections = SECTIONS.filter((item) => {
    if (item.id === "generate" || item.id === "output") {
      return showOpenAiOptions
    }
    return true
  })
  const activeSection = sections.some((item) => item.id === section)
    ? section
    : "canvas"
  const pressed =
    (composer.image_size != null && composer.image_size !== "auto") ||
    (composer.image_quality != null && composer.image_quality !== "auto") ||
    (composer.image_aspect_ratio != null &&
      composer.image_aspect_ratio !== "1:1") ||
    (composer.image_background != null &&
      composer.image_background !== "auto") ||
    composer.image_input_fidelity != null ||
    (composer.image_moderation != null &&
      composer.image_moderation !== "auto") ||
    composer.image_output_format != null ||
    composer.image_output_compression != null

  return (
    <Dialog>
      <TooltipHint label={t("common.imageSettings")} side="top">
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.imageSettings")}
              aria-pressed={pressed}
              className={cn(
                COMPOSER_RAIL_BUTTON_CLASS,
                pressed && "bg-muted-foreground/15 text-foreground"
              )}
            />
          }
        >
          <SlidersHorizontalIcon />
        </DialogTrigger>
      </TooltipHint>
      <DialogContent className="flex max-h-[min(40rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle>{t("common.imageSettings")}</DialogTitle>
          <DialogDescription>
            {t("hints.appliesToThisDrawingLeaveEmptyToUseTheModelDefault")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-80 min-w-0 flex-1">
          <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r p-2">
            {sections.map((item) => {
              const selected = activeSection === item.id
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "w-full justify-start",
                    selected
                      ? "bg-foreground/10 font-medium text-foreground hover:bg-foreground/10 hover:text-foreground dark:hover:bg-foreground/10"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground dark:hover:bg-foreground/5"
                  )}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                >
                  {t(item.label)}
                </Button>
              )
            })}
          </nav>
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="p-4">
              {activeSection === "canvas" ? (
                <CanvasFields
                  sizeOptions={sizeOptions}
                  aspectOptions={aspectOptions}
                  showQuality={showOpenAiOptions}
                />
              ) : null}
              {activeSection === "generate" ? <GenerateFields /> : null}
              {activeSection === "output" ? <OutputFields /> : null}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="mx-0 mb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => composer.setSampling(EMPTY_IMAGE_SETTINGS)}
          >
            {t("common.resetImageSettings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CanvasFields({
  sizeOptions,
  aspectOptions,
  showQuality,
}: {
  sizeOptions: ReturnType<typeof imageSizeOptionsForProvider>
  aspectOptions: ReturnType<typeof imageAspectOptionsForProvider>
  showQuality: boolean
}) {
  const t = useT()
  const composer = useComposerStore()
  return (
    <FieldGroup>
      <OptionField
        id="image-size"
        label={t("common.imageSize")}
        hint={t(
          "hints.availableSizesDependOnTheCurrentProviderLeaveEmptyForTheDefault"
        )}
        value={
          sizeOptions.some((item) => item.value === composer.image_size)
            ? (composer.image_size as string)
            : (sizeOptions[0]?.value ?? "auto")
        }
        optionRows={sizeOptionRows(t)
          .map((row) =>
            row.filter((item) =>
              sizeOptions.some((option) => option.value === item.value)
            )
          )
          .filter((row) => row.length > 0)}
        onChange={(next) => {
          if (isImageSize(next)) {
            composer.setSampling({ image_size: next })
          }
        }}
      />
      {showQuality ? (
        <OptionField
          id="image-quality"
          label={t("common.imageQuality")}
          hint={t("hints.openaiOnlyAutoIsCommonLeaveEmptyForTheDefault")}
          value={composer.image_quality ?? "auto"}
          options={IMAGE_QUALITY_OPTIONS.map((item) => ({
            value: item.value,
            label: t(item.label),
          }))}
          onChange={(next) => {
            if (isImageQuality(next)) {
              composer.setSampling({ image_quality: next })
            }
          }}
        />
      ) : null}
      <OptionField
        id="image-aspect"
        label={t("common.imageAspectRatio")}
        hint={t("hints.googleAndXaiSupportAllRatiosOpenaiOnly1123And32")}
        value={
          aspectOptions.some(
            (item) => item.value === composer.image_aspect_ratio
          )
            ? (composer.image_aspect_ratio as string)
            : (aspectOptions[0]?.value ?? "1:1")
        }
        options={aspectOptions.map((item) => ({
          ...item,
          label: t(item.label),
        }))}
        renderOption={(item) => (
          <>
            <AspectPreview value={item.value} />
            {item.label}
          </>
        )}
        onChange={(next) => {
          if (isImageAspectRatio(next)) {
            composer.setSampling({ image_aspect_ratio: next })
          }
        }}
      />
    </FieldGroup>
  )
}

function GenerateFields() {
  const t = useT()
  const composer = useComposerStore()
  return (
    <FieldGroup>
      <OptionField
        id="image-background"
        label={t("image.background")}
        hint={t("common.transparentBackgroundsOnlyWorkWithPngOrWebp")}
        value={composer.image_background ?? "auto"}
        options={IMAGE_BACKGROUND_OPTIONS.map((item) => ({
          value: item.value,
          label: t(item.label),
        }))}
        onChange={(next) => {
          if (!isImageBackground(next)) {
            return
          }
          composer.setSampling({
            image_background: next,
            ...(next === "transparent" &&
            composer.image_output_format === "jpeg"
              ? { image_output_format: "png" }
              : {}),
          })
        }}
      />
      <OptionField
        id="image-fidelity"
        label={t("common.inputFidelity")}
        hint={t("hints.howCloselyEditsFollowTheInputImageDefaultIsLow")}
        value={composer.image_input_fidelity ?? DEFAULT_IMAGE_OPTION}
        options={[
          { value: DEFAULT_IMAGE_OPTION, label: t("common.default") },
          ...IMAGE_FIDELITY_OPTIONS.map((item) => ({
            value: item.value,
            label: t(item.label),
          })),
        ]}
        onChange={(next) => {
          if (next === DEFAULT_IMAGE_OPTION) {
            composer.setSampling({ image_input_fidelity: null })
            return
          }
          if (isImageInputFidelity(next)) {
            composer.setSampling({ image_input_fidelity: next })
          }
        }}
      />
      <OptionField
        id="image-moderation"
        label={t("common.moderation")}
        hint={t("common.openaiOnlyIfUnsureKeepAuto")}
        value={composer.image_moderation ?? "auto"}
        options={IMAGE_MODERATION_OPTIONS.map((item) => ({
          value: item.value,
          label: t(item.label),
        }))}
        onChange={(next) => {
          if (isImageModeration(next)) {
            composer.setSampling({ image_moderation: next })
          }
        }}
      />
    </FieldGroup>
  )
}

function OutputFields() {
  const t = useT()
  const composer = useComposerStore()
  return (
    <FieldGroup>
      <OptionField
        id="image-format"
        label={t("common.outputFormat")}
        hint={t(
          "hints.openaiDefaultsToPngJpegCannotBeUsedWithATransparentBackground"
        )}
        value={composer.image_output_format ?? DEFAULT_IMAGE_OPTION}
        options={[
          { value: DEFAULT_IMAGE_OPTION, label: t("common.default") },
          ...IMAGE_FORMAT_OPTIONS.filter(
            (item) =>
              item.value !== "jpeg" ||
              composer.image_background !== "transparent"
          ).map((item) => ({
            value: item.value,
            label: t(item.label),
          })),
        ]}
        onChange={(next) => {
          if (next === DEFAULT_IMAGE_OPTION) {
            composer.setSampling({ image_output_format: null })
            return
          }
          if (isImageOutputFormat(next)) {
            composer.setSampling({ image_output_format: next })
          }
        }}
      />
      <Field>
        <FieldLabelWithHint
          htmlFor="image-compression"
          hint={t("hints.imageOutputCompressionRange")}
        >
          {t("common.outputCompression")}
        </FieldLabelWithHint>
        <Input
          id="image-compression"
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          placeholder={t("common.default")}
          value={composer.image_output_compression ?? ""}
          onChange={(event) => {
            const raw = event.target.value
            if (raw.trim() === "") {
              composer.setSampling({
                image_output_compression: null,
              })
              return
            }
            const parsed = parseImageCompression(raw)
            if (parsed == null) {
              return
            }
            composer.setSampling({
              image_output_compression: parsed,
            })
          }}
        />
      </Field>
    </FieldGroup>
  )
}

function FieldLabelWithHint({
  htmlFor,
  hint,
  children,
}: {
  htmlFor: string
  hint?: string
  children: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      {hint ? <FieldHint hint={hint} /> : null}
    </div>
  )
}

function FieldHint({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={hint}
            className="text-muted-foreground"
          />
        }
      >
        <CircleHelpIcon />
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  )
}
