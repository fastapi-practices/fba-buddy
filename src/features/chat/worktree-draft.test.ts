import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { bindAppNavigate } from "@/app/navigation"
import { useComposerStore } from "@/features/chat/composer-store"
import { useSelectionStore } from "@/features/shell/selection-store"
import {
  beginDataSourceChange,
  dataSourceKey,
  useAccountSourceStore,
} from "@/lib/account-source"
import {
  configureWorktreeDraft,
  startWorktreeDraft,
  useWorktreeDraftStore,
} from "./worktree-draft"

const navigate = vi.fn()
const draft = () => ({
  conversationId: "prebound-worktree-chat",
  path: "/actual/worktrees/task",
  sourcePath: "/source/project",
  head: "a".repeat(40),
  branch: "codex/task",
  source: dataSourceKey(),
})

beforeEach(() => {
  navigate.mockReset()
  bindAppNavigate(navigate)
  useAccountSourceStore.setState({
    ready: true,
    account: "account-1",
    epoch: 0,
  })
  useSelectionStore.setState(useSelectionStore.getInitialState(), true)
  useComposerStore.setState(useComposerStore.getInitialState(), true)
  useWorktreeDraftStore.setState({ draft: null })
})
afterEach(() => bindAppNavigate(null))

it("opens a blank coding draft with the host directory and prebound ID while preserving the right conversation", () => {
  useSelectionStore.setState({
    selectedConversationId: "source-chat",
    focusedChatPane: "right",
    sidebarConversationId: "source-right",
  })
  useComposerStore.getState().setDraft("source message")
  useComposerStore.getState().setAcpRunnerEnabled("codex", true)
  useComposerStore.getState().setAcpRunnerName("codex")
  expect(useComposerStore.getState().acp_runner).toBe(true)
  expect(startWorktreeDraft(draft())).toBe(true)
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/chat", undefined)
  expect(useSelectionStore.getState()).toMatchObject({
    selectedConversationId: null,
    focusedChatPane: "left",
    sidebarConversationId: "source-right",
  })
  expect(useComposerStore.getState()).toMatchObject({
    agent_mode: "coding",
    acp_runner: true,
    draft: "",
  })
  expect(useWorktreeDraftStore.getState().draft).toEqual({
    ...draft(),
    mode: "worktree",
    baseBranch: null,
    paneKey: useSelectionStore.getState().chatPaneKey,
  })
})

it("chooses a pending worktree without losing the prompt, runner, or split conversation", () => {
  useComposerStore.getState().setAgentMode("coding")
  useComposerStore.getState().setDraft("finish the current implementation")
  useComposerStore.getState().setAcpRunnerEnabled("codex", true)
  useComposerStore.getState().setAcpRunnerName("codex")
  useSelectionStore.setState({ sidebarConversationId: "right-chat" })
  configureWorktreeDraft(
    {
      backend: "local",
      mode: "worktree",
      state: "pending",
      path: null,
      sourcePath: "/repo",
      branch: "main",
      baseBranch: "main",
      branches: ["main"],
      repository: true,
      associatedWorktreePath: null,
    },
    "draft-task",
    useSelectionStore.getState().chatPaneKey,
    8
  )
  expect(navigate).not.toHaveBeenCalled()
  expect(useComposerStore.getState()).toMatchObject({
    draft: "finish the current implementation",
    acp_runner: true,
    agent_mode: "coding",
  })
  expect(useSelectionStore.getState().sidebarConversationId).toBe("right-chat")
  expect(useWorktreeDraftStore.getState().draft?.path).toBeNull()
})

it("does not navigate or change the composer when the source epoch changes during creation", () => {
  const pending = draft()
  beginDataSourceChange()
  useAccountSourceStore.setState({ ready: true })
  useComposerStore.getState().setDraft("new account message")
  expect(startWorktreeDraft(pending)).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
  expect(useComposerStore.getState().draft).toBe("new account message")
  expect(useWorktreeDraftStore.getState().draft).toBeNull()
})

it("does not adopt a prepared workspace while account initialization is pending", () => {
  useAccountSourceStore.setState({ ready: false })
  expect(startWorktreeDraft(draft())).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
  expect(useWorktreeDraftStore.getState().draft).toBeNull()
})
