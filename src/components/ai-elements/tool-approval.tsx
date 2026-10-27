"use client"

import { useContext, useRef, useState, type ComponentProps } from "react"
import type {
  ToolApprovalOption,
  ToolCallMessagePart,
} from "@/features/chat/thread-types"
import { useChatRuntime } from "@/features/chat/chat-runtime"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import type { TranslationKey } from "@/lib/i18n"
import {
  MoreHorizontalIcon,
  ShieldQuestionIcon,
  SquareTerminalIcon,
} from "lucide-react"
import { TOOL_STEP_META, toolTarget } from "./tool-presentation"
import {
  ToolApprovalResponderContext,
  type ToolApprovalDecision,
} from "./tool-approval-state"

export type {  ToolApprovalDecision } from "./tool-approval-state"

const APPROVAL_OPTION_LABEL_KEYS: Record<string, TranslationKey> = {
  "allow-once": "common.allowOnce",
  "allow-always": "common.alwaysAllow",
  "reject-once": "common.deny",
  "reject-always": "common.deny",
}

const isRejectOption = (option: ToolApprovalOption) =>
  option.kind.startsWith("reject")

const isAlwaysOption = (option: ToolApprovalOption) =>
  option.kind === "allow-always"

const approvalOptionLabel = (
  option: ToolApprovalOption,
  translate: ReturnType<typeof useT>
) => {
  const key = APPROVAL_OPTION_LABEL_KEYS[option.kind]
  return option.label ?? (key ? translate(key) : option.id)
}

const approvalOptionDetail = (option: ToolApprovalOption) =>
  [option.description, option.grants?.join(", ")]
    .filter((item): item is string => Boolean(item))
    .join(" · ")

const DENY_OPTION: ToolApprovalOption = {
  id: "reject-once",
  kind: "reject-once",
}

const ALLOW_OPTION: ToolApprovalOption = {
  id: "allow-once",
  kind: "allow-once",
}

function approvalOptions(options: ToolApprovalOption[] | undefined) {
  const declared = options?.length ? [...options] : []
  if (!declared.some(isRejectOption)) declared.unshift(DENY_OPTION)
  if (!declared.some((option) => !isRejectOption(option)))
    declared.push(ALLOW_OPTION)
  return declared
}

function approvalActions(options: ToolApprovalOption[]) {
  const deny = options.find(isRejectOption)
  const approve =
    options.find((option) => option.kind === "allow-once") ??
    options.find((option) => !isRejectOption(option))
  return {
    deny,
    approve,
    overflow: options.filter((option) => option !== deny && option !== approve),
  }
}

function parseApprovalArgs(argsText: string | undefined): unknown {
  const raw = argsText?.trim() ?? ""
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function approvalCommand(argsText: string | undefined) {
  const parsed = parseApprovalArgs(argsText)
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "command" in parsed &&
    typeof (parsed as { command?: unknown }).command === "string"
  )
    return (parsed as { command: string }).command
  return undefined
}

function approvalTarget(argsText: string | undefined) {
  return toolTarget(parseApprovalArgs(argsText), "")
}

export function ToolApproval({
  className,
  toolCallId,
  interrupt,
  approval,
  toolName,
  argsText,
  onRespond,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  toolCallId?: string
  interrupt?: ToolCallMessagePart["interrupt"]
  approval?: ToolCallMessagePart["approval"]
  toolName?: string
  argsText?: string
  onRespond?: (decision: ToolApprovalDecision) => Promise<boolean>
}) {
  const t = useT()
  const runtime = useChatRuntime()
  const approveTool = useContext(ToolApprovalResponderContext)
  const [responding, setResponding] = useState(false)
  const [submitted, setSubmitted] = useState<ToolApprovalDecision | null>(null)
  const [error, setError] = useState("")
  const respondingRef = useRef(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (
    approval != null &&
    (approval.approved !== undefined || approval.resolution !== undefined)
  )
    return null

  const livePayload = interrupt?.payload
  const declaredOptions = livePayload?.options ?? approval?.options
  const unavailableReason = livePayload?.unavailableReason
  const disabled = responding
  const Icon = TOOL_STEP_META[toolName ?? ""]?.icon ?? SquareTerminalIcon
  const command = approvalCommand(argsText)
  const target = approvalTarget(argsText)
  const commandLabel = command ?? target ?? toolName ?? ""
  const title = command
    ? t("common.runCommandPrompt", { command })
    : `${toolName ?? t("common.toolRequest")}${target ? `: ${target}` : ""}`
  const options = approvalOptions(declaredOptions)
  const actions = approvalActions(options)

  const respond = async (decision: ToolApprovalDecision) => {
    if (onRespond) return onRespond(decision)
    if (!toolCallId) return false
    if (approveTool)
      return approveTool(toolCallId, decision.approved, decision.always)
    runtime.actions.resumeToolCall({
      toolCallId,
      payload: decision,
    })
    return true
  }

  const submit = async (decision: ToolApprovalDecision) => {
    if (respondingRef.current) return
    respondingRef.current = true
    setResponding(true)
    setError("")
    try {
      const accepted = await respond(decision)
      if (accepted === false) return
      setSubmitted(decision)
      setConfirmingId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      respondingRef.current = false
      setResponding(false)
    }
  }

  const respondWithOption = (option: ToolApprovalOption) => {
    void submit(approvalDecision(option))
  }

  if (submitted)
    return (
      <Trace data-slot="tool-approval-state">
        <TraceLine status={submitted.approved ? "running" : undefined}>
          <TraceIcon>
            <Icon />
          </TraceIcon>
          <TraceTitle>
            {submitted.approved ? t("common.running") : t("common.denied")}{" "}
            {commandLabel}
          </TraceTitle>
        </TraceLine>
      </Trace>
    )

  if (unavailableReason)
    return (
      <Item
        data-slot="tool-approval"
        data-state="unavailable"
        role="status"
        variant="outline"
        size="sm"
        className={cn("min-w-0", className)}
        {...props}
      >
        <ItemMedia variant="icon">
          <ShieldQuestionIcon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{toolName ?? t("common.toolRequest")}</ItemTitle>
          <ItemDescription>{unavailableReason}</ItemDescription>
        </ItemContent>
      </Item>
    )

  const confirming = confirmingId
    ? options.find((option) => option.id === confirmingId)
    : undefined

  if (confirming) {
    const confirmMeta =
      typeof confirming.confirm === "object" ? confirming.confirm : undefined
    const confirmDescription =
      confirmMeta?.description ?? confirming.description
    const confirmGrants = confirming.grants?.join(", ")
    return (
      <Item
        data-slot="tool-approval"
        data-state="confirming"
        role="group"
        variant="outline"
        size="sm"
        className={cn("min-w-0", className)}
        {...props}
      >
        <ItemMedia variant="icon">
          <ShieldQuestionIcon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>
            {confirmMeta?.title ?? `${approvalOptionLabel(confirming, t)}?`}
          </ItemTitle>
          {confirmDescription ? (
            <ItemDescription>{confirmDescription}</ItemDescription>
          ) : null}
          {confirmGrants ? (
            <ItemDescription className="font-mono text-xs">
              {confirmGrants}
            </ItemDescription>
          ) : null}
          {error ? (
            <ItemDescription className="text-destructive">
              {error}
            </ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions className="justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setConfirmingId(null)}
          >
            {t("common.back")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => void submit(approvalDecision(confirming))}
          >
            {t("common.confirm")}
          </Button>
        </ItemActions>
      </Item>
    )
  }

  return (
    <Item
      data-slot="tool-approval"
      data-state="approval-requested"
      role="group"
      variant="outline"
      size="sm"
      className={cn("min-w-0", className)}
      {...props}
    >
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{title}</ItemTitle>
        {error ? (
          <ItemDescription className="text-destructive">
            {error}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="justify-end">
        {actions.deny ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              actions.deny!.confirm
                ? setConfirmingId(actions.deny!.id)
                : respondWithOption(actions.deny!)
            }
          >
            {t("common.deny")}
          </Button>
        ) : null}
        {actions.approve ? (
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() =>
              actions.approve!.confirm
                ? setConfirmingId(actions.approve!.id)
                : respondWithOption(actions.approve!)
            }
          >
            {t("common.approve")}
          </Button>
        ) : null}
        {actions.overflow.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={t("common.more")}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {actions.overflow.map((option, index) => {
                const detail = approvalOptionDetail(option)
                return (
                  <DropdownMenuItem
                    key={`${option.id}:${index}`}
                    disabled={disabled}
                    variant={isRejectOption(option) ? "destructive" : "default"}
                    onClick={() =>
                      option.confirm
                        ? setConfirmingId(option.id)
                        : respondWithOption(option)
                    }
                  >
                    <span className="flex min-w-0 flex-col">
                      <span>{approvalOptionLabel(option, t)}</span>
                      {detail ? (
                        <span className="text-xs text-muted-foreground">
                          {detail}
                        </span>
                      ) : null}
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ItemActions>
    </Item>
  )
}

function approvalDecision(option: ToolApprovalOption): ToolApprovalDecision {
  return {
    approved: !isRejectOption(option),
    always: isAlwaysOption(option) || undefined,
    optionId: option.id,
  }
}
