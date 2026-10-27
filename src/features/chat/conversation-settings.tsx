import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BanIcon,
  BotIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  SettingsIcon,
} from "lucide-react"

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipHint,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getModelOptions } from "@/api"
import { queryKeys } from "@/api/query-keys"
import {
  ADVISOR_INHERIT,
  ADVISOR_OFF,
  advisorModelChoices,
  parseExtraBody,
  parseLogitBias,
  parseOptionalBoundedNumber,
  parseOptionalLimit,
  parseOptionalNumber,
  parseStopSequences,
} from "@/features/chat/chat-prefs"
import {
  isConversationTuningActive,
  useConversationTuning,
  useConversationTuningStore,
  type ConversationTuning,
} from "@/features/chat/conversation-tuning"
import { useSelectionStore } from "@/features/shell/selection-store"
import { COMPOSER_RAIL_BUTTON_CLASS } from "@/features/chat/composer-model-picker"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

const SECTIONS = [
  { id: "sampling", label: "common.sampling" },
  { id: "usage", label: "common.usage" },
  { id: "custom", label: "common.customParameters" },
] as const

type ConversationSettingsSection = (typeof SECTIONS)[number]["id"]

const TRI_STATE_ITEMS = [
  { value: "default", label: "common.default" },
  { value: "on", label: "common.on" },
  { value: "off", label: "common.off" },
] as const

const COMPACTION_STRATEGIES = [
  { value: "summary", label: "common.compactionSummary" },
  { value: "relevance", label: "common.compactionRelevance" },
] as const

export function ConversationSettingsButton({
  conversationId: paneConversationId,
  menuItem = false,
}: {
  conversationId?: string | null
  menuItem?: boolean
} = {}) {
  const t = useT()
  const selectedConversationId = useSelectionStore(
    (state) => state.selectedConversationId
  )
  const conversationId =
    paneConversationId === undefined
      ? selectedConversationId
      : paneConversationId
  const tuning = useConversationTuning(conversationId)
  const patchTuning = useConversationTuningStore((state) => state.patchTuning)
  const resetTuning = useConversationTuningStore((state) => state.resetTuning)
  const pressed = isConversationTuningActive(tuning)
  const [section, setSection] =
    useState<ConversationSettingsSection>("sampling")

  function patch(next: Partial<ConversationTuning>) {
    patchTuning(conversationId, next)
  }

  const trigger = (
    <DialogTrigger
      nativeButton={!menuItem}
      role={menuItem ? "menuitem" : undefined}
      render={
        menuItem ? (
          <DropdownMenuItem closeOnClick={false} />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.chatSettings")}
            aria-pressed={pressed}
            className={cn(
              COMPOSER_RAIL_BUTTON_CLASS,
              pressed && "bg-muted-foreground/15 text-foreground"
            )}
          />
        )
      }
    >
      <SettingsIcon />
      {menuItem ? t("common.chatSettings") : null}
    </DialogTrigger>
  )

  return (
    <Dialog>
      {menuItem ? (
        trigger
      ) : (
        <TooltipHint label={t("common.chatSettings")} side="top">
          {trigger}
        </TooltipHint>
      )}
      <DialogContent className="flex max-h-[min(40rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle>{t("common.chatSettings")}</DialogTitle>
          <DialogDescription>
            {t(
              "hints.appliesToThisChatOnlyLeaveEmptyToFollowPreferencesOrTheModelDefault"
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-80 min-w-0 flex-1">
          <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r p-2">
            {SECTIONS.map((item) => {
              const selected = section === item.id
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
              {section === "sampling" ? (
                <SamplingFields
                  key={conversationId ?? "draft"}
                  tuning={tuning}
                  patch={patch}
                />
              ) : null}
              {section === "usage" ? (
                <UsageFields tuning={tuning} patch={patch} />
              ) : null}
              {section === "custom" ? (
                <ExtraBodyField
                  key={conversationId ?? "draft"}
                  value={tuning.extra_body}
                  onChange={(extra_body) => patch({ extra_body })}
                />
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="mx-0 mb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => resetTuning(conversationId)}
          >
            {t("common.resetThisChat")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SamplingFields({
  tuning,
  patch,
}: {
  tuning: ConversationTuning
  patch: (next: Partial<ConversationTuning>) => void
}) {
  const t = useT()
  return (
    <FieldGroup>
      <OptionalNumberField
        id="tuning-temperature"
        label={t("common.temperature")}
        hint={t(
          "hints.howSteadyOrLivelyRepliesAre0IsSteadierAround1IsMoreNaturalCommonly07LeaveEmptyToFollowTheModel"
        )}
        value={tuning.temperature}
        min={0}
        max={2}
        step={0.1}
        onChange={(temperature) =>
          patch({
            temperature: parseOptionalBoundedNumber(temperature, 0, 2) ?? null,
          })
        }
      />
      <OptionalNumberField
        id="tuning-top-p"
        label={t("common.samplingRange")}
        hint={t(
          "hints.howWideWordChoiceCanBeLowerIsMoreCautiousHigherIsMoreOpenCommonly09LeaveEmptyToFollowTheModel"
        )}
        value={tuning.top_p}
        min={0}
        max={1}
        step={0.05}
        onChange={(top_p) =>
          patch({
            top_p: parseOptionalBoundedNumber(top_p, 0, 1) ?? null,
          })
        }
      />
      <OptionalNumberField
        id="tuning-max-tokens"
        label={t("common.maxTokens")}
        hint={t(
          "hints.howLongThisReplyCanBeLargerMeansLongerAndMoreCostlyCommonly2048LeaveEmptyToFollowTheModel"
        )}
        value={tuning.max_tokens}
        min={1}
        step={1}
        integer
        onChange={(max_tokens) =>
          patch({ max_tokens: parseOptionalLimit(max_tokens) ?? null })
        }
      />
      <OptionalNumberField
        id="tuning-timeout"
        label={t("common.timeoutSeconds")}
        hint={t(
          "hints.howLongToWaitForTheModelBeforeStoppingCommonly60LeaveEmptyForTheDefault"
        )}
        value={tuning.timeout}
        min={0}
        step={1}
        onChange={(timeout) =>
          patch({ timeout: parseOptionalNumber(timeout) ?? null })
        }
      />
      <OptionalNumberField
        id="tuning-seed"
        label={t("common.seed")}
        hint={t(
          "hints.theSameIntegerMakesSimilarRepliesMoreLikelyForExample42LeaveEmptyForADifferentResultEachTime"
        )}
        value={tuning.seed}
        step={1}
        integer
        onChange={(seed) => patch({ seed: parseOptionalNumber(seed) ?? null })}
      />
      <OptionalNumberField
        id="tuning-presence-penalty"
        label={t("common.presencePenalty")}
        hint={t(
          "hints.cutsRepeatingThingsAlreadySaid0MeansNone0To2IsAllowedLeaveEmptyToFollowTheModel"
        )}
        value={tuning.presence_penalty}
        min={-2}
        max={2}
        step={0.1}
        onChange={(presence_penalty) =>
          patch({
            presence_penalty:
              parseOptionalBoundedNumber(presence_penalty, -2, 2) ?? null,
          })
        }
      />
      <OptionalNumberField
        id="tuning-frequency-penalty"
        label={t("common.frequencyPenalty")}
        hint={t(
          "hints.cutsRepeatingTheSameWord0MeansNone0To2IsAllowedLeaveEmptyToFollowTheModel"
        )}
        value={tuning.frequency_penalty}
        min={-2}
        max={2}
        step={0.1}
        onChange={(frequency_penalty) =>
          patch({
            frequency_penalty:
              parseOptionalBoundedNumber(frequency_penalty, -2, 2) ?? null,
          })
        }
      />
      <LogitBiasField
        value={tuning.logit_bias}
        onChange={(logit_bias) => patch({ logit_bias })}
      />
      <Field>
        <FieldLabelWithHint
          htmlFor="tuning-stop-sequences"
          hint={t("hints.stopWhenTheseWordsAppearOnePerLineUsuallyLeaveEmpty")}
        >
          {t("common.stopSequences")}
        </FieldLabelWithHint>
        <Textarea
          id="tuning-stop-sequences"
          rows={3}
          value={(tuning.stop_sequences ?? []).join("\n")}
          placeholder={t("common.optional")}
          onChange={(event) =>
            patch({
              stop_sequences: parseStopSequences(event.target.value) ?? null,
            })
          }
        />
      </Field>
    </FieldGroup>
  )
}

function UsageFields({
  tuning,
  patch,
}: {
  tuning: ConversationTuning
  patch: (next: Partial<ConversationTuning>) => void
}) {
  const t = useT()
  const modelOptionsQuery = useQuery({
    queryKey: queryKeys.modelOptions(),
    queryFn: getModelOptions,
  })
  const advisorItems = [
    {
      value: ADVISOR_INHERIT,
      label: t("common.default"),
      icon: CircleDashedIcon,
    },
    { value: ADVISOR_OFF, label: t("common.off"), icon: BanIcon },
    ...advisorModelChoices(modelOptionsQuery.data?.providers ?? []).map(
      (item) => ({ ...item, icon: BotIcon })
    ),
  ]
  const advisorValue = advisorSelectValue(tuning.advisor_model)

  return (
    <FieldGroup>
      <Field>
          <FieldLabelWithHint
            htmlFor="tuning-advisor-model"
            hint={t(
              "common.overridesTheUserAdvisorModelDefaultFollowsPreferences"
            )}
          >
            {t("common.advisorModel")}
          </FieldLabelWithHint>
          <Select
            items={advisorItems}
            value={
              advisorItems.some((item) => item.value === advisorValue)
                ? advisorValue
                : ADVISOR_INHERIT
            }
            onValueChange={(value) => {
              if (value == null || value === ADVISOR_INHERIT) {
                patch({ advisor_model: null })
                return
              }
              if (value === ADVISOR_OFF) {
                patch({ advisor_model: "" })
                return
              }
              patch({ advisor_model: value })
            }}
          >
            <SelectTrigger
              id="tuning-advisor-model"
              size="sm"
              className="max-w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              className="w-max max-w-[min(32rem,var(--available-width))] min-w-(--anchor-width)"
            >
              <SelectGroup>
                {advisorItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="[&>div]:min-w-0 [&>div]:shrink"
                    >
                      <Icon />
                      <span className="min-w-0 wrap-anywhere whitespace-normal">
                        {item.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
      </Field>
      <Field>
          <FieldLabelWithHint
            htmlFor="tuning-mcp-approve-writes"
            hint={t(
              "common.overridesUserMcpWriteConfirmationDefaultFollowsPreferences"
            )}
          >
            {t("common.confirmMcpWrites")}
          </FieldLabelWithHint>
          <ToggleGroup
            id="tuning-mcp-approve-writes"
            variant="outline"
            size="sm"
            spacing={2}
            value={[triStateMode(tuning.mcp_approve_writes)]}
            onValueChange={(value) => {
              const next = value[0]
              if (next === "on") {
                patch({ mcp_approve_writes: true })
                return
              }
              if (next === "off") {
                patch({ mcp_approve_writes: false })
                return
              }
              if (next === "default") {
                patch({ mcp_approve_writes: null })
              }
            }}
            aria-labelledby="tuning-mcp-approve-writes"
          >
            {TRI_STATE_ITEMS.map((item) => (
              <ToggleGroupItem key={item.value} value={item.value}>
                {t(item.label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
      </Field>
      <Field>
        <FieldLabelWithHint htmlFor="tuning-compaction-enabled">
          {t("common.autoCompaction")}
        </FieldLabelWithHint>
        <ToggleGroup
          id="tuning-compaction-enabled"
          variant="outline"
          size="sm"
          spacing={2}
          value={[triStateMode(tuning.compaction_enabled)]}
          onValueChange={(value) => {
            const next = value[0]
            patch({
              compaction_enabled:
                next === "on" ? true : next === "off" ? false : null,
            })
          }}
          aria-labelledby="tuning-compaction-enabled"
        >
          {TRI_STATE_ITEMS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {t(item.label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabelWithHint htmlFor="tuning-compaction-strategy">
          {t("common.compactionStrategy")}
        </FieldLabelWithHint>
        <Select
          items={COMPACTION_STRATEGIES.map((item) => ({
            value: item.value,
            label: t(item.label),
          }))}
          value={tuning.compaction_strategy ?? "default"}
          onValueChange={(value) => {
            patch({
              compaction_strategy:
                value === "summary" || value === "relevance" ? value : null,
            })
          }}
        >
          <SelectTrigger id="tuning-compaction-strategy" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="default">{t("common.default")}</SelectItem>
              {COMPACTION_STRATEGIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {t(item.label)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <OptionalNumberField
        id="tuning-compaction-keep-messages"
        label={t("common.compactionKeepMessages")}
        value={tuning.compaction_keep_messages}
        min={1}
        step={1}
        integer
        onChange={(value) =>
          patch({
            compaction_keep_messages: parseOptionalLimit(value) ?? null,
          })
        }
      />
      <OptionalNumberField
        id="tuning-compaction-max-messages"
        label={t("common.maxMessagesBeforeCompaction")}
        value={tuning.compaction_max_messages}
        min={1}
        step={1}
        integer
        onChange={(value) =>
          patch({
            compaction_max_messages: parseOptionalLimit(value) ?? null,
          })
        }
      />
    </FieldGroup>
  )
}

function triStateMode(value: boolean | null): "default" | "on" | "off" {
  if (value === true) {
    return "on"
  }
  if (value === false) {
    return "off"
  }
  return "default"
}

function advisorSelectValue(value: string | null): string {
  if (value == null) {
    return ADVISOR_INHERIT
  }
  if (value === "") {
    return ADVISOR_OFF
  }
  return value
}

function OptionalNumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  integer,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number | null
  min?: number
  max?: number
  step?: number
  integer?: boolean
  onChange: (value: number | null) => void
}) {
  const t = useT()
  return (
    <Field>
      <FieldLabelWithHint htmlFor={id} hint={hint}>
        {label}
      </FieldLabelWithHint>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode={integer ? "numeric" : "decimal"}
        placeholder={t("common.default")}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value
          if (raw.trim() === "") {
            onChange(null)
            return
          }
          const parsed = Number(raw)
          if (!Number.isFinite(parsed)) {
            return
          }
          if (integer && !Number.isInteger(parsed)) {
            return
          }
          onChange(parsed)
        }}
      />
    </Field>
  )
}

function ExtraBodyField({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (value: Record<string, unknown> | null) => void
}) {
  const t = useT()
  const [text, setText] = useState(() =>
    value ? JSON.stringify(value, null, 2) : ""
  )
  const parsed = parseExtraBody(text.trim() ? text : null)
  const invalid = text.trim().length > 0 && parsed == null

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabelWithHint
        htmlFor="tuning-extra-body"
        hint={t(
          "hints.onlyKeysTheCurrentProviderSettingsKnowAreMergedUsuallyLeaveEmptyIfYouFillItUseJson"
        )}
      >
        {t("common.customParameters")}
      </FieldLabelWithHint>
      <Textarea
        id="tuning-extra-body"
        rows={8}
        aria-invalid={invalid || undefined}
        placeholder={'{ "openai_reasoning_effort": "low" }'}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (next.trim() === "") {
            onChange(null)
            return
          }
          const body = parseExtraBody(next)
          if (body) {
            onChange(body)
          }
        }}
      />
      {invalid ? (
        <FieldError>{t("common.mustBeAValidJsonObject")}</FieldError>
      ) : null}
    </Field>
  )
}

function LogitBiasField({
  value,
  onChange,
}: {
  value: Record<string, number> | null
  onChange: (value: Record<string, number> | null) => void
}) {
  const t = useT()
  const [text, setText] = useState(() =>
    value ? JSON.stringify(value, null, 2) : ""
  )
  const parsed = parseLogitBias(text.trim() ? text : null)
  const invalid = text.trim().length > 0 && parsed == null

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabelWithHint
        htmlFor="tuning-logit-bias"
        hint={t(
          "hints.adjustHowLikelySomeTokensAreKeysAreTokenIdsValuesAreIntegersUsuallyLeaveEmpty"
        )}
      >
        {t("common.logitBias")}
      </FieldLabelWithHint>
      <Textarea
        id="tuning-logit-bias"
        rows={3}
        aria-invalid={invalid || undefined}
        placeholder={'{ "123": -10 }'}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (next.trim() === "") {
            onChange(null)
            return
          }
          const bias = parseLogitBias(next)
          if (bias) {
            onChange(bias)
          }
        }}
      />
      {invalid ? (
        <FieldError>
          {t("hints.mustBeAJsonObjectFromTokenIdsToIntegers")}
        </FieldError>
      ) : null}
    </Field>
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
