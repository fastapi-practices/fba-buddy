import { execFile } from "node:child_process"
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as executionProcess from "./execution-process"
import { readWorkspaceGitDiff, readWorkspaceGitStatus } from "./workspace-git"
import {
  createWorkspaceWorktree,
  removeWorkspaceWorktree,
  validateWorkspaceWorktree,
} from "./workspace-worktree"

const run = promisify(execFile)

async function git(root: string, ...args: string[]) {
  return (await run("git", args, { cwd: root })).stdout.trim()
}

describe("authorized workspace worktrees", () => {
  let root: string
  let source: string
  let target: string
  beforeEach(async () => {
    root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "buddy-worktree-"))
    )
    source = path.join(root, "source")
    target = path.join(root, "target")
    await mkdir(source)
    await git(source, "init", "-q")
    await git(source, "config", "user.email", "test@example.com")
    await git(source, "config", "user.name", "Buddy Test")
    await writeFile(path.join(source, "tracked.txt"), "initial\n")
    await git(source, "add", "tracked.txt")
    await git(source, "commit", "-qm", "worktree fixture")
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it("creates a detached HEAD binding and reads only its target changes", async () => {
    await writeFile(path.join(source, "tracked.txt"), "source private edit\n")
    const binding = await createWorkspaceWorktree(
      source,
      target,
      "account:conversation"
    )
    expect(binding).toMatchObject({
      profileKey: "account:conversation",
      sourceRepo: source,
      commonGitDir: path.join(source, ".git"),
      target,
      head: await git(source, "rev-parse", "HEAD"),
    })
    expect(await git(target, "rev-parse", "--abbrev-ref", "HEAD")).toBe("HEAD")
    expect(await readFile(path.join(target, "tracked.txt"), "utf8")).toBe(
      "initial\n"
    )
    await writeFile(path.join(target, "tracked.txt"), "target edit\n")
    expect(await readWorkspaceGitStatus(target, binding)).toMatchObject({
      repository: true,
      branch: null,
      entries: [
        expect.objectContaining({ path: "tracked.txt", worktree: "M" }),
      ],
    })
    const diff = await readWorkspaceGitDiff(target, "tracked.txt", binding)
    expect(diff.diff).toContain("+target edit")
    expect(diff.diff).not.toContain("source private edit")
    await expect(readWorkspaceGitStatus(target)).rejects.toThrow("授权绑定")
  })

  it("continues from a bound worktree's current HEAD without rebinding the source", async () => {
    const first = await createWorkspaceWorktree(source, target, "first")
    await writeFile(path.join(target, "tracked.txt"), "next revision\n")
    await git(target, "add", "tracked.txt")
    await git(target, "commit", "-qm", "continued fixture")
    const next = await createWorkspaceWorktree(
      target,
      path.join(root, "next"),
      "second",
      first
    )
    expect(next.sourceRepo).toBe(source)
    expect(next.commonGitDir).toBe(first.commonGitDir)
    expect(next.head).not.toBe(first.head)
    expect(next.head).toBe(await git(target, "rev-parse", "HEAD"))
    expect(await readFile(path.join(next.target, "tracked.txt"), "utf8")).toBe(
      "next revision\n"
    )
    await validateWorkspaceWorktree(first.target, first)
    await removeWorkspaceWorktree(next)
    await expect(lstat(next.target)).rejects.toMatchObject({ code: "ENOENT" })
    await validateWorkspaceWorktree(first.target, first)
  })

  it("disables checkout hooks and ignores inherited repository overrides", async () => {
    const marker = path.join(root, "hook.marker")
    const hook = path.join(source, ".git/hooks/post-checkout")
    await writeFile(hook, `#!/bin/sh\nprintf invoked > '${marker}'\n`)
    await chmod(hook, 0o755)
    vi.stubEnv("GIT_DIR", path.join(root, "untrusted"))
    vi.stubEnv("GIT_CONFIG_COUNT", "1")
    vi.stubEnv("GIT_CONFIG_KEY_0", "core.hooksPath")
    vi.stubEnv("GIT_CONFIG_VALUE_0", path.dirname(hook))
    const binding = await createWorkspaceWorktree(
      source,
      target,
      "account:conversation"
    )
    await validateWorkspaceWorktree(target, binding)
    await expect(lstat(marker)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("preserves existing destinations, dirty worktrees, and replaced target paths", async () => {
    await mkdir(target)
    await writeFile(path.join(target, "keep.txt"), "existing")
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow(`目标目录已存在，未修改该目录：${target}`)
    expect(await readFile(path.join(target, "keep.txt"), "utf8")).toBe(
      "existing"
    )
    const binding = await createWorkspaceWorktree(
      source,
      path.join(root, "created"),
      "key"
    )
    await writeFile(path.join(binding.target, "keep.txt"), "new user data")
    await expect(removeWorkspaceWorktree(binding)).rejects.toThrow()
    expect(await readFile(path.join(binding.target, "keep.txt"), "utf8")).toBe(
      "new user data"
    )
    await expect(
      removeWorkspaceWorktree({ ...binding, target })
    ).rejects.toThrow()
    expect(await readFile(path.join(target, "keep.txt"), "utf8")).toBe(
      "existing"
    )
  })

  it("rejects config includes and filters before reserving a destination", async () => {
    await git(
      source,
      "config",
      "include.path",
      path.join(root, "private-config")
    )
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow("引用了其他配置文件")
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    await git(source, "config", "--unset", "include.path")
    await git(source, "config", "filter.test.smudge", "malicious command")
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow("外部过滤器")
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects symlinked parents and destinations inside Git metadata", async () => {
    const alias = path.join(root, "alias")
    await symlink(root, alias)
    await expect(
      createWorkspaceWorktree(source, path.join(alias, "target"), "key")
    ).rejects.toThrow("真实目录")
    await expect(
      createWorkspaceWorktree(source, path.join(source, ".git/target"), "key")
    ).rejects.toThrow("元数据目录")
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it.each([
    "target",
    "commondir",
    "gitdir",
    "common-link",
    "alternates",
    "include",
    "filter",
  ])(
    "rejects changed worktree metadata before running Git: %s",
    async (attack) => {
      const binding = await createWorkspaceWorktree(source, target, "key")
      if (attack === "target")
        await writeFile(
          path.join(target, ".git"),
          `gitdir: ${binding.commonGitDir}\n`
        )
      if (attack === "commondir")
        await writeFile(path.join(binding.gitDir, "commondir"), root + "\n")
      if (attack === "gitdir")
        await writeFile(
          path.join(binding.gitDir, "gitdir"),
          path.join(source, ".git") + "\n"
        )
      if (attack === "common-link") {
        await rm(path.join(binding.gitDir, "commondir"))
        await writeFile(path.join(root, "outside"), "../..\n")
        await symlink(
          path.join(root, "outside"),
          path.join(binding.gitDir, "commondir")
        )
      }
      if (attack === "alternates")
        await writeFile(
          path.join(binding.commonGitDir, "objects/info/alternates"),
          root + "\n"
        )
      if (attack === "include" || attack === "filter") {
        await git(source, "config", "extensions.worktreeConfig", "true")
        await writeFile(
          path.join(binding.gitDir, "config.worktree"),
          attack === "include"
            ? "[include]\npath = /private-config\n"
            : '[filter "unsafe"]\nsmudge = unsafe-command\n'
        )
      }
      const execute = vi.spyOn(executionProcess, "executeBounded")
      await expect(readWorkspaceGitStatus(target, binding)).rejects.toThrow()
      await expect(
        readWorkspaceGitDiff(target, undefined, binding)
      ).rejects.toThrow()
      expect(
        execute.mock.calls.every(([options]) => options.args.includes("config"))
      ).toBe(true)
    }
  )

  it("compensates a failed creation using only its own worktree registration", async () => {
    const other = await createWorkspaceWorktree(
      source,
      path.join(root, "other"),
      "other"
    )
    const execute = executionProcess.executeBounded
    vi.spyOn(executionProcess, "executeBounded").mockImplementation(
      async (options) => {
        const result = await execute(options)
        if (options.args.includes("worktree") && options.args.includes("add"))
          return {
            ...result,
            code: 1,
            exitCode: 1,
            stderr: "simulated creation failure",
          }
        return result
      }
    )
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow("simulated creation failure")
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    await validateWorkspaceWorktree(other.target, other)
    const registrations = await git(source, "worktree", "list", "--porcelain")
    expect(registrations).not.toContain(`worktree ${target}\n`)
    expect(registrations).toContain(`worktree ${other.target}\n`)
  })

  it("checks for a completed registration after command timeout and removes it safely", async () => {
    const execute = executionProcess.executeBounded
    vi.spyOn(executionProcess, "executeBounded").mockImplementation(
      async (options) => {
        const result = await execute(options)
        if (options.args.includes("worktree") && options.args.includes("add"))
          return { ...result, reason: "deadline" }
        return result
      }
    )
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow("超时")
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await git(source, "worktree", "list", "--porcelain")).not.toContain(
      `worktree ${target}\n`
    )
  })

  it("reports the preserved path when a partial creation contains unknown data", async () => {
    const execute = executionProcess.executeBounded
    vi.spyOn(executionProcess, "executeBounded").mockImplementation(
      async (options) => {
        if (options.args.includes("worktree") && options.args.includes("add")) {
          await writeFile(path.join(target, "keep.txt"), "unknown data")
          return {
            code: -1,
            exitCode: null,
            stdout: "",
            stderr: "",
            reason: "deadline",
          }
        }
        return execute(options)
      }
    )
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow(`已保留目录：${target}`)
    expect(await readFile(path.join(target, "keep.txt"), "utf8")).toBe(
      "unknown data"
    )
    await expect(
      createWorkspaceWorktree(source, target, "key")
    ).rejects.toThrow(`目标目录已存在，未修改该目录：${target}`)
  })

  it("does not accept a binding after its Git pointer was removed", async () => {
    const binding = await createWorkspaceWorktree(source, target, "key")
    await rm(path.join(target, ".git"))
    await expect(validateWorkspaceWorktree(target, binding)).rejects.toThrow(
      "已失效"
    )
  })

  it("separates staged and unstaged diff scopes in a bound worktree", async () => {
    const binding = await createWorkspaceWorktree(source, target, "key")
    await writeFile(path.join(target, "tracked.txt"), "staged line\n")
    await git(target, "add", "tracked.txt")
    await writeFile(path.join(target, "tracked.txt"), "unstaged line\n")
    const staged = await readWorkspaceGitDiff(
      target,
      undefined,
      binding,
      "staged"
    )
    const unstaged = await readWorkspaceGitDiff(
      target,
      undefined,
      binding,
      "unstaged"
    )
    expect(staged.diff).toContain("+staged line")
    expect(staged.diff).not.toContain("unstaged line")
    expect(unstaged.diff).toContain("-staged line")
    expect(unstaged.diff).toContain("+unstaged line")
  })
})
