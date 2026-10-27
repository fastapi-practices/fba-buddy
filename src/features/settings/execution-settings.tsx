import { getExecutionDefaults } from "@/api/execution-options"
import { DownloadIcon, FolderOpenIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import {
  SettingsBlock,
  SettingsCard,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import { useT } from "@/hooks/use-t"
import {
  codingRuntimeFromMessage,
  codingRuntimeInstallHint,
} from "@/lib/execution-runtime"
import {
  SANDBOX_PROVIDERS,
  type SandboxProvider,
} from "@/shared/execution"
import type {
  ExecutionSettings as Config,
  ExecutionStatus,
  RuntimeName,
} from "@/shared/execution"

const BACKENDS = [
  { value: "local", label: "common.localOsSandbox" },
  { value: "sandbox", label: "common.serverSandbox" },
] as const

const SANDBOX_PROVIDER_LABELS: Record<SandboxProvider, string> = {
  opensandbox: "OpenSandbox",
  docker: "Docker",
  e2b: "E2B",
  modal: "Modal",
  daytona: "Daytona",
  sprites: "Sprites",
  smol: "Smol",
  boxlite: "Boxlite",
}

export function ExecutionSettings() {
  const t = useT()
  const desktop = window.buddyDesktop
  const [status, setStatus] = useState<ExecutionStatus | null>(null)
  const [config, setConfig] = useState<Config>({
    backend: "local",
    workspaceDir: "",
    workspaceMode: "auto",
  })
  const [busy, setBusy] = useState<string | null>("load")
  const [error, setError] = useState("")
  const draft = useRef(config)
  const revision = useRef(0)
  const queuedRevision = useRef(0)
  const pending = useRef(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const active = useRef(true)
  const flush = useRef<(() => void) | null>(null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      flush.current?.()
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!desktop?.getExecutionStatus)
          throw new Error(
            t(
              "hints.theDesktopExecutionInterfaceIsNotReadyQuitAndRestartTheApp"
            )
          )
        const defaults = await getExecutionDefaults()
        const next = await desktop.getExecutionStatus(defaults)
        if (active) {
          setStatus(next)
          const nextConfig = next.config
          draft.current = nextConfig
          setConfig(nextConfig)
        }
      } catch (cause: unknown) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : t("common.failedToReadExecutionSettings")
          )
      } finally {
        if (active) setBusy(null)
      }
    })()
    return () => {
      active = false
    }
  }, [desktop, t])

  function patch(next: Partial<Config>) {
    draft.current = { ...draft.current, ...next }
    revision.current += 1
    setConfig(draft.current)
    setError("")
    if (timer.current) clearTimeout(timer.current)
    flush.current = save
    timer.current = setTimeout(save, 500)
  }

  async function action(name: string, run: () => Promise<void>) {
    setBusy(name)
    setError("")
    try {
      await run()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("common.executionSettingsOperationFailed")
      )
    } finally {
      setBusy(null)
    }
  }

  function save() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const value = { ...draft.current }
    const version = revision.current
    if (!version || version === queuedRevision.current) return
    queuedRevision.current = version
    pending.current = pending.current.then(async () => {
      if (version !== revision.current) return
      try {
        if (!desktop?.setExecutionSettings)
          throw new Error(
            t(
              "hints.theDesktopExecutionInterfaceIsNotReadyQuitAndRestartTheApp"
            )
          )
        const next = await desktop.setExecutionSettings(value)
        if (!active.current || version !== revision.current) return
        setStatus(next)
        draft.current = next.config
        setConfig(next.config)
        setError("")
      } catch (cause) {
        if (active.current && version === revision.current) {
          queuedRevision.current = 0
          setError(
            cause instanceof Error
              ? cause.message
              : t("common.executionSettingsOperationFailed")
          )
        }
      }
    })
  }

  async function install(name: RuntimeName) {
    await action(name, async () => {
      if (desktop?.installRuntime) setStatus(await desktop.installRuntime(name))
    })
  }

  const selectedCapability = config.backend === "local" ? status?.local : null
  const errorRuntime =
    config.backend === "local" && error
      ? codingRuntimeFromMessage(error)
      : undefined

  function executionMessage(message: string | undefined) {
    switch (message) {
      case "Not installed":
        return t("common.notInstalled")
      case "seatbelt":
        return t("common.macOsSystemSandbox")
      case "bubblewrap":
        return t("common.linuxSystemSandbox")
      case "Local OS isolation is unavailable on this platform":
        return t("common.localSandboxUnsupportedPlatform")
    }
    return message ? (codingRuntimeInstallHint(message) ?? message) : message
  }

  if (!desktop?.getExecutionStatus || !desktop.setExecutionSettings)
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {t("common.desktopExecutionInterfaceIsNotReady")}
        </AlertTitle>
        <AlertDescription>
          {t("common.quitAndRestartTheDesktopApp")}
        </AlertDescription>
      </Alert>
    )

  return (
    <>
      <SettingsBlock title={t("common.codingExecution")}>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("common.executionSettingsError")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{executionMessage(error)}</span>
              {errorRuntime ? (
                <button
                  type="button"
                  className="font-medium underline underline-offset-4"
                  onClick={() =>
                    document
                      .getElementById("runtime-components")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  {t("common.goToInstallRuntime", {
                    name: errorRuntime === "node" ? "Node.js" : "Python",
                  })}
                </button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <FieldLabel
                  htmlFor="execution-backend"
                  className="whitespace-nowrap"
                >
                  {t("common.executionBackend")}
                </FieldLabel>
                {selectedCapability ? (
                  <Badge
                    variant={
                      selectedCapability.available ? "secondary" : "destructive"
                    }
                  >
                    {t(
                      selectedCapability.available
                        ? "common.available"
                        : "common.unavailable"
                    )}
                  </Badge>
                ) : null}
              </div>
              {selectedCapability &&
              !selectedCapability.available &&
              selectedCapability.reason &&
              !codingRuntimeInstallHint(selectedCapability.reason ?? "") ? (
                <div
                  className="flex min-w-0 flex-wrap items-center gap-2"
                  role="status"
                >
                  <span className="text-sm break-words text-muted-foreground">
                    {executionMessage(selectedCapability.reason)}
                  </span>
                </div>
              ) : null}
            </FieldContent>
            <SettingsSelect
              items={BACKENDS.map((item) => ({
                ...item,
                label: t(item.label),
              }))}
              value={config.backend}
              disabled={busy !== null}
              onValueChange={(value) => {
                if (value === "local")
                  patch({ backend: value, sandboxProvider: undefined })
                else if (value === "sandbox") patch({ backend: value })
              }}
            >
              <SettingsSelectTrigger
                id="execution-backend"
                className="w-full sm:w-56"
              >
                <SettingsSelectValue />
              </SettingsSelectTrigger>
              <SettingsSelectContent>
                <SettingsSelectGroup>
                  {BACKENDS.map((item) => (
                    <SettingsSelectItem key={item.value} value={item.value}>
                      {t(item.label)}
                    </SettingsSelectItem>
                  ))}
                </SettingsSelectGroup>
              </SettingsSelectContent>
            </SettingsSelect>
          </Field>
          {config.backend === "sandbox" ? (
            <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
              <FieldContent>
                <FieldLabel htmlFor="execution-sandbox-provider">
                  {t("common.sandboxProvider")}
                </FieldLabel>
                <FieldDescription>
                  {t("common.sandboxProviderDefaultHint")}
                </FieldDescription>
              </FieldContent>
              <SettingsSelect
                items={[
                  {
                    value: "",
                    label: t("common.serverDefault"),
                  },
                  ...SANDBOX_PROVIDERS.map((provider) => ({
                    value: provider,
                    label: SANDBOX_PROVIDER_LABELS[provider],
                  })),
                ]}
                value={config.sandboxProvider ?? ""}
                disabled={busy !== null}
                onValueChange={(value) =>
                  patch({
                    sandboxProvider: (value || undefined) as
                      | SandboxProvider
                      | undefined,
                  })
                }
              >
                <SettingsSelectTrigger
                  id="execution-sandbox-provider"
                  className="w-full sm:w-56"
                >
                  <SettingsSelectValue />
                </SettingsSelectTrigger>
                <SettingsSelectContent>
                  <SettingsSelectGroup>
                    <SettingsSelectItem value="">
                      {t("common.serverDefault")}
                    </SettingsSelectItem>
                    {SANDBOX_PROVIDERS.map((provider) => (
                      <SettingsSelectItem key={provider} value={provider}>
                        {SANDBOX_PROVIDER_LABELS[provider]}
                      </SettingsSelectItem>
                    ))}
                  </SettingsSelectGroup>
                </SettingsSelectContent>
              </SettingsSelect>
            </Field>
          ) : null}
          {config.backend === "local" ? (
            <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
              <FieldContent>
                <FieldLabel htmlFor="execution-workspace">
                  {t("common.workspaceDirectory")}
                </FieldLabel>
              </FieldContent>
              <div className="flex min-w-0 flex-col gap-2 sm:w-80 sm:max-w-[60%] sm:shrink-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    id="execution-workspace"
                    className="min-w-0 flex-1"
                    value={config.workspaceDir}
                    disabled={busy !== null}
                    onBlur={save}
                    onChange={(event) =>
                      patch({
                        workspaceDir: event.target.value,
                        workspaceMode: "custom",
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title={t("common.chooseWorkspaceDirectory")}
                    disabled={busy !== null}
                    aria-label={t("common.chooseWorkspaceDirectory")}
                    onClick={() =>
                      action("workspace", async () => {
                        const selected =
                          await desktop.chooseExecutionWorkspace()
                        if (selected)
                          patch({
                            workspaceDir: selected,
                            workspaceMode: "custom",
                          })
                      })
                    }
                  >
                    <FolderOpenIcon />
                  </Button>
                </div>
              </div>
            </Field>
          ) : null}
          {config.backend === "sandbox" ? (
            <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
              <FieldContent>
                <FieldLabel>{t("common.remoteWorkspace")}</FieldLabel>
              </FieldContent>
              <code role="status" className="text-sm text-muted-foreground">
                /workspace
              </code>
            </Field>
          ) : null}
        </SettingsCard>
      </SettingsBlock>
      {config.backend === "local" ? (
        <SettingsBlock
          id="runtime-components"
          title={t("common.runtimeComponents")}
        >
          <SettingsCard>
            {status &&
              (["python", "node"] as const).map((name) => {
                const runtime = status.runtimes[name]
                const runtimeIssue =
                  !runtime.available &&
                  runtime.reason &&
                  runtime.reason !== "Not installed"
                return (
                  <Field
                    key={name}
                    orientation="horizontal"
                    className={SETTINGS_ROW_CLASS}
                  >
                    <FieldContent>
                      <FieldLabel>
                        {name === "python" ? "Python" : "Node.js"}
                      </FieldLabel>
                      {runtime.version ? (
                        <span className="text-sm text-muted-foreground">
                          {runtime.version}
                        </span>
                      ) : null}
                      {runtimeIssue ? (
                        <FieldDescription
                          role="alert"
                          className="text-destructive"
                        >
                          {executionMessage(runtime.reason)}
                        </FieldDescription>
                      ) : null}
                    </FieldContent>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          runtime.available
                            ? "secondary"
                            : runtimeIssue
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {t(
                          busy === name
                            ? "common.installing"
                            : runtime.available
                              ? "common.available"
                              : runtimeIssue
                                ? "common.unavailable"
                                : "common.notInstalled"
                        )}
                      </Badge>
                      {!runtime.available ? (
                        <Button
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => install(name)}
                          aria-label={t("common.installName", {
                            name: name === "python" ? "Python" : "Node.js",
                          })}
                        >
                          <DownloadIcon data-icon="inline-start" />
                          {t(
                            busy === name
                              ? "common.installing"
                              : "common.install"
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                )
              })}
          </SettingsCard>
        </SettingsBlock>
      ) : null}
    </>
  )
}
