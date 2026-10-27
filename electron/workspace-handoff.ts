import { rm } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { ConversationExecutionProfile } from "./desktop-execution-settings"
import { readWorkspaceGitStatus } from "./workspace-git"
import {
  readWorkspaceBranches,
  workspaceGitCommand,
} from "./workspace-transfer"
import {
  validateWorkspaceWorktree,
  type WorkspaceWorktreeBinding,
} from "./workspace-worktree"

type Checkout = {
  root: string
  binding?: WorkspaceWorktreeBinding
  head: string
  branch: string | null
  stash: string | null
  stashStaged: boolean
  untracked: string[]
}

async function capture(
  root: string,
  binding?: WorkspaceWorktreeBinding
): Promise<Checkout> {
  const status = await readWorkspaceGitStatus(root, binding)
  if (
    status.entries.some((entry) =>
      ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(
        entry.index + entry.worktree
      )
    )
  )
    throw new Error("请先解决工作区中的合并冲突")
  return {
    root,
    binding,
    head: (
      await workspaceGitCommand(
        root,
        ["rev-parse", "--verify", "HEAD"],
        binding
      )
    ).trim(),
    branch: (await readWorkspaceBranches(root, binding)).branch,
    stash: null,
    stashStaged: false,
    untracked: status.entries
      .filter((entry) => entry.untracked)
      .map((entry) => entry.path),
  }
}

async function stash(checkout: Checkout) {
  const status = await readWorkspaceGitStatus(checkout.root, checkout.binding)
  if (!status.entries.length) return
  checkout.stashStaged = status.entries.some((entry) => entry.staged)
  const untracked = status.entries
    .filter((entry) => entry.untracked)
    .map((entry) => entry.path)
  checkout.untracked = untracked
  await workspaceGitCommand(
    checkout.root,
    [
      "-c",
      "user.name=FbaBuddy",
      "-c",
      "user.email=workspace@fbabuddy.invalid",
      "stash",
      "push",
      "--include-untracked",
      "--message",
      `buddy-handoff-${randomUUID()}`,
    ],
    checkout.binding
  )
  checkout.stash = (
    await workspaceGitCommand(
      checkout.root,
      ["rev-parse", "--verify", "refs/stash"],
      checkout.binding
    )
  ).trim()
  // Git's --no-optional-locks execution mode leaves untracked files in place
  // even when stash includes them, so remove the paths after the stash is saved
  for (const relative of untracked) {
    if (
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((part) => part === ".." || part === ".git")
    )
      throw new Error("转移文件路径无效")
    await rm(path.join(checkout.root, relative), {
      recursive: true,
      force: true,
    })
  }
}

async function apply(target: Checkout, source: Checkout) {
  if (!source.stash) return
  const args = ["stash", "apply"]
  // `--index` restores the staged half of a stash. Avoid reconstructing an
  // index for an unstaged-only stash after the target branch was switched
  if (source.stashStaged) args.push("--index")
  args.push(source.stash)
  await workspaceGitCommand(target.root, args, target.binding)
}

async function drop(checkout: Checkout) {
  if (!checkout.stash) return
  const entries = await workspaceGitCommand(
    checkout.root,
    ["stash", "list", "--format=%gd %H"],
    checkout.binding
  )
  const entry = entries
    .split("\n")
    .find((line) => line.endsWith(` ${checkout.stash}`))
    ?.split(" ")[0]
  if (entry)
    await workspaceGitCommand(
      checkout.root,
      ["stash", "drop", entry],
      checkout.binding
    )
}

async function checkout(
  checkoutState: Checkout,
  branch: string | null,
  head: string
) {
  await workspaceGitCommand(
    checkoutState.root,
    branch ? ["checkout", branch] : ["checkout", "--detach", head],
    checkoutState.binding
  )
}

async function clearTransferred(checkoutState: Checkout, untracked: string[]) {
  await workspaceGitCommand(
    checkoutState.root,
    ["reset", "--hard", "HEAD"],
    checkoutState.binding
  )
  for (const relative of untracked) {
    if (
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((part) => part === ".." || part === ".git")
    )
      throw new Error("转移文件路径无效")
    await rm(path.join(checkoutState.root, relative), {
      recursive: true,
      force: true,
    })
  }
}

export async function handoffWorkspaceProfile(
  profile: ConversationExecutionProfile,
  mode: "local" | "worktree",
  create: (ref: string, branch?: string) => Promise<WorkspaceWorktreeBinding>,
  save: (target: ConversationExecutionProfile) => Promise<void>,
  worktreeName?: string
) {
  if (profile.backend !== "local" || profile.worktreeIntent)
    throw new Error("请先准备本机工作区再切换")
  if ((profile.worktree ? "worktree" : "local") === mode) return profile
  const sourceRoot = profile.worktree?.sourceRepo ?? profile.workspaceDir
  const local = await capture(sourceRoot)
  if (mode === "worktree") {
    let binding: WorkspaceWorktreeBinding | undefined
    let worktree: Checkout | undefined
    let created = false
    let transferred = false
    try {
      if (profile.associatedWorktree) {
        await validateWorkspaceWorktree(
          profile.associatedWorktree.target,
          profile.associatedWorktree
        )
        binding = profile.associatedWorktree
        worktree = await capture(binding.target, binding)
        if (
          (await readWorkspaceGitStatus(binding.target, binding)).entries.length
        )
          throw new Error("关联 Worktree 仍有改动，请先处理后再切换")
      }
      await stash(local)
      if (binding) {
        if (binding.branch && binding.branch === local.branch)
          await checkout(local, null, local.head)
        await checkout(
          worktree!,
          binding.branch,
          binding.branch ?? binding.head
        )
        binding = {
          ...binding,
          head: (
            await workspaceGitCommand(
              binding.target,
              ["rev-parse", "--verify", "HEAD"],
              binding
            )
          ).trim(),
        }
      } else {
        binding = await create(local.head, worktreeName)
        created = true
        worktree = await capture(binding.target, binding)
      }
      transferred = local.stash !== null
      await apply(worktree!, local)
      const target: ConversationExecutionProfile = {
        backend: "local",
        workspaceMode: "custom",
        workspaceDir: binding.target,
        worktree: binding,
        worktreeSourceKey: binding.profileKey,
        worktreeState: "active",
        worktreeCreatedAt: new Date().toISOString(),
      }
      await save(target)
      await drop(local).catch(() => {})
      return target
    } catch (cause) {
      const failures: unknown[] = []
      if (worktree && transferred) {
        try {
          await clearTransferred(worktree, local.untracked)
        } catch (error) {
          failures.push(error)
        }
      }
      if (worktree && binding && !created) {
        try {
          await checkout(worktree, worktree.branch, worktree.head)
        } catch (error) {
          failures.push(error)
        }
      }
      try {
        await checkout(local, local.branch, local.head)
        await apply(local, local)
      } catch (error) {
        failures.push(error)
      }
      if (created && binding && !failures.length) {
        const { removeWorkspaceWorktree } = await import("./workspace-worktree")
        await removeWorkspaceWorktree(binding).catch((error) => {
          failures.push(error)
        })
      }
      if (failures.length)
        throw new AggregateError(
          [cause, ...failures],
          `工作区切换失败，恢复记录已保留 ${local.stash ?? ""}，请检查 ${sourceRoot}`,
          { cause }
        )
      await drop(local).catch(() => {})
      throw new Error("工作区切换失败，已恢复原工作区", { cause })
    }
  }

  const binding = profile.worktree!
  const worktree = await capture(binding.target, binding)
  let transferred = false
  try {
    await stash(local)
    await stash(worktree)
    await checkout(worktree, null, worktree.head)
    await checkout(local, worktree.branch, worktree.head)
    transferred = worktree.stash !== null || local.stash !== null
    await apply(local, worktree)
    await apply(local, local)
    const associated = {
      ...binding,
      head: worktree.head,
      branch: worktree.branch,
    }
    const target: ConversationExecutionProfile = {
      backend: "local",
      workspaceMode: "custom",
      workspaceDir: sourceRoot,
      associatedWorktree: associated,
    }
    await save(target)
    await drop(worktree).catch(() => {})
    await drop(local).catch(() => {})
    return target
  } catch (cause) {
    const failures: unknown[] = []
    try {
      if (transferred)
        await clearTransferred(local, [
          ...worktree.untracked,
          ...local.untracked,
        ])
      await checkout(local, local.branch, local.head)
      await apply(local, local)
    } catch (error) {
      failures.push(error)
    }
    try {
      await checkout(worktree, worktree.branch, worktree.head)
      await apply(worktree, worktree)
    } catch (error) {
      failures.push(error)
    }
    if (failures.length)
      throw new AggregateError(
        [cause, ...failures],
        `工作区切换失败，恢复记录已保留 ${[local.stash, worktree.stash].filter(Boolean).join("、")}`,
        { cause }
      )
    await drop(worktree).catch(() => {})
    await drop(local).catch(() => {})
    throw new Error("工作区切换失败，已恢复原工作区", { cause })
  }
}
