import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useChatRuntimeState } from "@/features/chat/chat-runtime"
import {
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  GitForkIcon,
  LaptopIcon,
  SquareCheckIcon,
  SquareIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { useT } from "@/hooks/use-t"
import {
  currentAccountSource,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import { useAgentMode } from "./conversation-mode"
import { configureWorktreeDraft, type WorktreeDraft } from "./worktree-draft"
import { useWorkspaceGitSession } from "./workspace-git-provider"
import { ComposerBranchPicker } from "./composer-branch-picker"
import {
  useWorkspaceEnvironment,
  workspaceEnvironmentQueryKey,
} from "./use-workspace-environment"
import type {
  ExecutionBackend,
  SandboxProvider,
} from "@/shared/execution"

export function ComposerEnvironmentPicker({
  conversationId,
  projectId,
  draft,
  paneKey,
  submenu,
}: {
  conversationId: string | null
  projectId: number | null
  draft?: WorktreeDraft | null
  paneKey: string
  submenu: boolean
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const sourceKey = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  const running = useChatRuntimeState((state) => state.thread.isRunning)
  const readOnly = useChatRuntimeState((state) => state.thread.isDisabled)
  const hasMessages = useChatRuntimeState((state) => state.thread.messages.length > 0)
  const coding = useAgentMode() === "coding"
  const started = Boolean(conversationId) || hasMessages
  const gitSession = useWorkspaceGitSession()
  const [busy, setBusy] = useState(false)
  const workspaceId = conversationId ?? draft?.conversationId
  const environmentQuery = useWorkspaceEnvironment({
    conversationId,
    projectId,
    draftConversationId: draft?.conversationId,
  })
  const environment = environmentQuery.data
  const disabled =
    busy || running || readOnly || !ready || environmentQuery.isPending
  const locationDisabled = disabled || started
  const cloud = environment?.backend === "sandbox"
  const worktree = environment?.mode === "worktree"

  async function configure(
    mode: "local" | "worktree",
    backend: ExecutionBackend = environment?.backend ?? "local",
    baseBranch?: string,
    sandboxProvider?: SandboxProvider | null
  ) {
    if (locationDisabled) return false
    const id = workspaceId ?? crypto.randomUUID()
    setBusy(true)
    try {
      const result = await window.buddyDesktop!.workspace({
        action: "configure-environment",
        conversationId: id,
        projectId: projectId ?? undefined,
        mode,
        backend,
        sandboxProvider: sandboxProvider ?? undefined,
        baseBranch,
        source: currentAccountSource() ?? undefined,
      })
      if (sourceKey !== dataSourceKey()) return false
      if (!result || !("environment" in result))
        throw new Error(t("common.gitResponseInvalid"))
      configureWorktreeDraft(result.environment, id, paneKey, projectId)
      queryClient.setQueryData(
        workspaceEnvironmentQueryKey(sourceKey, id, projectId),
        result.environment
      )
      return true
    } catch (cause) {
      if (sourceKey === dataSourceKey())
        toast.add({ title: String(cause), type: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function selectBranch(branch: string, create = false) {
    if (disabled || cloud) return false
    if (worktree && environment?.state === "pending")
      return configure("worktree", "local", branch)
    if (!create && branch === environment?.branch) return true
    if (!workspaceId && projectId == null) return false
    setBusy(true)
    try {
      const result = await window.buddyDesktop!.workspace({
        action: "checkout-branch",
        ...(workspaceId
          ? { conversationId: workspaceId }
          : { projectId: projectId! }),
        branch,
        create,
        source: currentAccountSource() ?? undefined,
      })
      if (sourceKey !== dataSourceKey()) return false
      if (!result || !("entries" in result))
        throw new Error(t("common.gitResponseInvalid"))
      await queryClient.invalidateQueries({
        queryKey: ["workspace-environment", sourceKey],
      })
      await gitSession?.git.refreshIfOpen()
      return true
    } catch (cause) {
      if (sourceKey === dataSourceKey())
        toast.add({ title: String(cause), type: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!window.buddyDesktop?.workspace) return null
  const LocationIcon = cloud ? CloudIcon : worktree ? GitForkIcon : LaptopIcon
  const label = cloud
    ? t("common.workCloud")
    : worktree
      ? "Worktree"
      : t("common.workLocal")
  const controls = (
    <>
      {submenu ? (
        <DropdownMenuItem
          disabled
          title={t("common.workLocationLocked")}
          aria-label={`${t("common.workLocation")}: ${label}`}
        >
          <LocationIcon data-icon="inline-start" />
          {label}
        </DropdownMenuItem>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={locationDisabled}
            aria-label={t("common.workLocation")}
            title={
              started
                ? t("common.workLocationLocked")
                : (environment?.path ?? undefined)
            }
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-full"
              />
            }
          >
            <LocationIcon data-icon="inline-start" />
            {label}
            {!started && <ChevronDownIcon data-icon="inline-end" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("common.workLocation")}</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => void configure("local", "local", undefined, null)}
              >
                <LaptopIcon />
                {t("common.workLocal")}
                {!cloud && !worktree && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void configure(
                    "local",
                    "sandbox",
                    undefined,
                    environment?.sandboxProvider
                  )
                }
              >
                <CloudIcon />
                {t("common.workCloud")}
                {cloud && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {coding && environment?.repository && !cloud && (
        <ComposerBranchPicker
          submenu={submenu}
          branch={
            environment.state === "pending"
              ? environment.baseBranch
              : environment.branch
          }
          branches={environment.branches}
          pendingWorktree={environment.state === "pending"}
          disabled={disabled || (!workspaceId && projectId == null)}
          onOpen={() => void environmentQuery.refetch()}
          onSelect={selectBranch}
        />
      )}
      {coding && !started && environment?.repository && !cloud && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="checkbox"
          aria-label="Worktree"
          aria-checked={worktree}
          disabled={
            locationDisabled ||
            environmentQuery.isFetching ||
            (!worktree && !environment.branches.length)
          }
          title={t("common.worktreeDraftHint")}
          className="ml-auto shrink-0 rounded-full"
          onClick={() =>
            void configure(
              worktree ? "local" : "worktree",
              "local",
              environment.branch ?? environment.branches[0]
            )
          }
        >
          Worktree
          {worktree ? (
            <SquareCheckIcon data-icon="inline-end" />
          ) : (
            <SquareIcon data-icon="inline-end" />
          )}
        </Button>
      )}
    </>
  )
  return submenu ? (
    controls
  ) : (
    <div className="flex min-w-0 flex-1 basis-48 items-center gap-1">
      {controls}
    </div>
  )
}
