import { useRef, useState } from "react"
import { StethoscopeIcon } from "lucide-react"

import { checkAcpAgent } from "@/api/acp"
import { ApiError, apiErrorMessage } from "@/api/http"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import {
  ACP_AGENTS,
  acpConfigKey,
  resolveAcpLaunchConfig,
  type AcpAgent,
} from "@/features/acp/acp-agents"
import {
  AcpCheckDetail,
  AcpCheckStatus,
  type AcpCheckState,
} from "@/features/acp/acp-check-status"
import { AcpConfigDialog } from "@/features/acp/acp-config-dialog"
import { AgentLogo } from "@/features/acp/agent-logo"
import { useComposerStore } from "@/features/chat/composer-store"
import { useT } from "@/hooks/use-t"
import type { AcpRunnerName, PermissionMode } from "@/lib/types"
import type { AcpLaunchConfig } from "@/lib/types/acp"

type ScopedCheck = AcpCheckState & { permissionMode: PermissionMode }

export function AcpLibrary() {
  const t = useT()
  const permissionMode = useComposerStore(
    (state) => state.permission_mode ?? "ask"
  )
  const enabledIds = useComposerStore((state) => state.enabledAcpRunners)
  const configs = useComposerStore((state) => state.acpRunnerConfigs)
  const setEnabled = useComposerStore((state) => state.setAcpRunnerEnabled)
  const saveConfig = useComposerStore((state) => state.setAcpRunnerConfig)
  const [editing, setEditing] = useState<AcpAgent | null>(null)
  const [checks, setChecks] = useState<
    Partial<Record<AcpRunnerName, ScopedCheck>>
  >({})
  const [checkingAll, setCheckingAll] = useState(false)
  const pending = useRef(false)
  const checking = Object.values(checks).some((check) => check.checking)

  function configFor(agent: AcpAgent) {
    return resolveAcpLaunchConfig(agent.id, configs) ?? agent.defaults
  }
  function checkFor(agent: AcpAgent) {
    const check = checks[agent.id]
    return check?.permissionMode === permissionMode ? check : undefined
  }

  async function runCheck(agent: AcpAgent, config: AcpLaunchConfig) {
    if (pending.current) return
    pending.current = true
    const base = { key: acpConfigKey(config), permissionMode }
    setChecks((current) => ({
      ...current,
      [agent.id]: { ...base, checking: true },
    }))
    try {
      const result = await checkAcpAgent(agent.id, config, permissionMode)
      setChecks((current) => ({
        ...current,
        [agent.id]: { ...base, checking: false, result, checkedAt: Date.now() },
      }))
    } catch (error) {
      const message =
        error instanceof ApiError && [404, 405].includes(error.code)
          ? t("hints.acpChecksAreNotSupportedByThisServerUpdateTheBackend")
          : error instanceof Error && error.name === "TimeoutError"
            ? t("common.checkTimedOutTryAgainLater")
            : apiErrorMessage(error, t("common.checkFailed"))
      setChecks((current) => ({
        ...current,
        [agent.id]: { ...base, checking: false, error: message },
      }))
    } finally {
      pending.current = false
    }
  }

  async function checkAll() {
    if (checkingAll || pending.current) return
    setCheckingAll(true)
    try {
      for (const agent of ACP_AGENTS) await runCheck(agent, configFor(agent))
    } finally {
      setCheckingAll(false)
    }
  }

  return (
    <main className="absolute inset-0 overflow-y-auto">
      <div className="@container flex min-h-full flex-col gap-7 px-6 pt-8 pb-10 sm:px-8 xl:px-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">ACP</h1>
          <Button
            variant="outline"
            disabled={checking || checkingAll}
            onClick={() => void checkAll()}
          >
            {checkingAll ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <StethoscopeIcon data-icon="inline-start" />
            )}
            {t("common.checkAll")}
          </Button>
        </header>
        <div className="grid grid-cols-1 gap-6 @min-[36rem]:grid-cols-2 @min-[56rem]:grid-cols-3 @min-[72rem]:grid-cols-4">
          {ACP_AGENTS.map((agent) => {
            const active = enabledIds.includes(agent.id)
            const config = configFor(agent)
            const savedCheck = checkFor(agent)
            const check =
              savedCheck?.key === acpConfigKey(config) ? savedCheck : undefined
            return (
              <Card
                key={agent.id}
                role="region"
                aria-label={agent.name}
                className="relative min-h-60 rounded-2xl bg-background [--card-spacing:--spacing(6)]"
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute inset-0 h-full w-full rounded-2xl"
                  aria-label={t("common.configureName", { name: agent.name })}
                  onClick={() => setEditing(agent)}
                >
                  <span className="sr-only">{agent.name}</span>
                </Button>
                <CardHeader className="pointer-events-none relative items-center gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <AgentLogo agent={agent} />
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">
                        {agent.name}
                      </CardTitle>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.publisher}
                      </p>
                    </div>
                  </div>
                  <CardAction className="pointer-events-auto self-center">
                    <Switch
                      aria-label={t("common.enableName", { name: agent.name })}
                      checked={active}
                      onCheckedChange={(checked) =>
                        setEnabled(agent.id, checked)
                      }
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="pointer-events-none relative flex flex-1 flex-col gap-5">
                  <CardDescription className="leading-6">
                    {t(agent.description)}
                  </CardDescription>
                  <div className="mt-auto flex flex-col gap-2" role="status">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <AcpCheckStatus check={check} />
                      <Button
                        variant="link"
                        size="sm"
                        className="pointer-events-auto h-auto shrink-0 p-0"
                        disabled={checking || checkingAll}
                        onClick={() => void runCheck(agent, config)}
                      >
                        {check?.checking ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <StethoscopeIcon data-icon="inline-start" />
                        )}
                        {t("common.checkConnection")}
                      </Button>
                    </div>
                    <AcpCheckDetail check={check} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
      {editing ? (
        <AcpConfigDialog
          key={editing.id}
          agent={editing}
          config={configFor(editing)}
          check={checkFor(editing)}
          checking={checking || checkingAll}
          onCheck={(config) => void runCheck(editing, config)}
          onSave={(config) => {
            saveConfig(editing.id, config)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </main>
  )
}
