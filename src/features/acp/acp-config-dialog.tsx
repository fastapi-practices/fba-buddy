import { apiErrorMessage } from "@/api/http"
import { useState } from "react"
import {
  CircleHelpIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  StethoscopeIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  acpConfigKey,
  parseAcpLaunchConfig,
  type AcpAgent,
} from "@/features/acp/acp-agents"
import { AgentLogo } from "@/features/acp/agent-logo"
import {
  AcpCheckDetail,
  AcpCheckStatus,
  type AcpCheckState,
} from "@/features/acp/acp-check-status"
import { useT } from "@/hooks/use-t"
import type { AcpLaunchConfig } from "@/lib/types/acp"

export function AcpConfigDialog({
  agent,
  config,
  check,
  checking,
  onCheck,
  onSave,
  onClose,
}: {
  agent: AcpAgent
  config: AcpLaunchConfig
  check?: AcpCheckState
  checking: boolean
  onCheck: (config: AcpLaunchConfig) => void
  onSave: (config: AcpLaunchConfig) => void
  onClose: () => void
}) {
  const t = useT()
  const [command, setCommand] = useState(config.command)
  const [args, setArgs] = useState(config.args.join("\n"))
  const [error, setError] = useState("")
  let draft: AcpLaunchConfig | undefined
  try {
    draft = parseAcpLaunchConfig(command, args)
  } catch {
    /* 校验错误在提交时展示 */
  }
  const currentCheck =
    draft && check?.key === acpConfigKey(draft) ? check : undefined

  function validate(): AcpLaunchConfig | undefined {
    try {
      const parsed = parseAcpLaunchConfig(command, args)
      setError("")
      return parsed
    } catch (cause) {
      setError(apiErrorMessage(cause, t("common.invalidParameters")))
      return undefined
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <ScrollArea viewportClassName="max-h-[calc(100dvh-2rem)]">
          <form
            className="flex flex-col gap-6 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              const parsed = validate()
              if (parsed) onSave(parsed)
            }}
          >
            <DialogHeader>
              <div className="mb-2 flex items-center gap-3">
                <AgentLogo agent={agent} />
                <div className="flex flex-col gap-1">
                  <DialogTitle>
                    {t("common.configureName", { name: agent.name })}
                  </DialogTitle>
                  <span className="text-xs text-muted-foreground">
                    {agent.publisher} · ACP
                  </span>
                </div>
              </div>
              <DialogDescription>
                {t(
                  "hints.settingsAreSavedOnThisDeviceAndUsedForMessagesInCodingMode"
                )}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithHint
                  htmlFor="acp-command"
                  hint={t("common.installedLocalProgramNameOrExecutablePath")}
                >
                  {t("common.command")}
                </FieldLabelWithHint>
                <Input
                  id="acp-command"
                  value={command}
                  onChange={(event) => {
                    setCommand(event.target.value)
                    setError("")
                  }}
                  maxLength={512}
                  aria-invalid={Boolean(error)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithHint
                  htmlFor="acp-args"
                  hint={t("common.oneArgumentPerLineEGAcp")}
                >
                  {t("common.launchArguments")}
                </FieldLabelWithHint>
                <Textarea
                  id="acp-args"
                  value={args}
                  onChange={(event) => {
                    setArgs(event.target.value)
                    setError("")
                  }}
                  rows={5}
                  aria-invalid={Boolean(error)}
                  spellCheck={false}
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            </FieldGroup>
            <div className="flex flex-col gap-2" role="status">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AcpCheckStatus check={currentCheck} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={checking}
                  onClick={() => {
                    const parsed = validate()
                    if (parsed) onCheck(parsed)
                  }}
                >
                  {checking ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <StethoscopeIcon data-icon="inline-start" />
                  )}
                  {t("common.checkConnection")}
                </Button>
              </div>
              <AcpCheckDetail check={currentCheck} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCommand(agent.defaults.command)
                  setArgs(agent.defaults.args.join("\n"))
                  setError("")
                }}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t("common.restoreDefaults")}
              </Button>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={
                  <a href={agent.website} target="_blank" rel="noreferrer" />
                }
              >
                {t("common.officialDocs")}
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.saveSettings")}</Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function FieldLabelWithHint({
  htmlFor,
  hint,
  children,
}: {
  htmlFor: string
  hint: string
  children: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      <FieldHint hint={hint} />
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
