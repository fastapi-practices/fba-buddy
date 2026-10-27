import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { execFile } from "node:child_process"
import * as filesystem from "node:fs/promises"
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import {
  readWorkspaceGitDiff,
  readWorkspaceGitStatus,
  checkWorkspaceEngineering,
  stageWorkspaceGitFiles,
  unstageWorkspaceGitFiles,
  commitWorkspaceGit,
  checkoutWorkspaceBranch,
} from "./workspace-git"
import { beginWorkspaceRun } from "./workspace-run"
import * as executionProcess from "./execution-process"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, realpath: vi.fn(actual.realpath) }
})

const run = promisify(execFile)

async function git(root: string, ...args: string[]) {
  const { stdout } = await run("git", args, { cwd: root })
  return stdout
}

describe("workspace git inspection", () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "buddy-git-"))
    await git(root, "init", "-q")
    await git(root, "config", "user.email", "test@example.com")
    await git(root, "config", "user.name", "Buddy Test")
    await writeFile(path.join(root, "tracked.txt"), "before\n")
    await git(root, "add", "tracked.txt")
    await git(root, "commit", "-qm", "initial")
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.mocked(filesystem.realpath).mockReset()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it("creates and switches branches while preserving staged, unstaged and untracked changes", async () => {
    const original = (await git(root, "branch", "--show-current")).trim()
    await writeFile(path.join(root, "tracked.txt"), "working edits\n")
    await writeFile(path.join(root, "staged.txt"), "staged edits\n")
    await git(root, "add", "staged.txt")
    await writeFile(path.join(root, "new.txt"), "untracked edits\n")
    const before = await readWorkspaceGitStatus(root)
    const created = await checkoutWorkspaceBranch(root, "feature/sidebar", true)
    expect(created.branch).toBe("feature/sidebar")
    expect(created.entries).toEqual(before.entries)
    expect((await checkoutWorkspaceBranch(root, original)).branch).toBe(
      original
    )
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "working edits\n"
    )
    expect((await readWorkspaceGitStatus(root)).entries).toEqual(before.entries)
  })

  it("refuses a branch change during execution and rejects option-like branch names", async () => {
    const lease = await beginWorkspaceRun(root)
    try {
      await expect(
        checkoutWorkspaceBranch(root, "feature/busy", true)
      ).rejects.toThrow("执行")
    } finally {
      await lease.finish()
    }
    await expect(
      checkoutWorkspaceBranch(root, "--force", true)
    ).rejects.toThrow()
    expect((await git(root, "branch", "--list", "feature/busy")).trim()).toBe(
      ""
    )
  })

  it("reports branch and staged, unstaged, and untracked files", async () => {
    await writeFile(path.join(root, "tracked.txt"), "after\n")
    await writeFile(path.join(root, "staged.txt"), "staged\n")
    await git(root, "add", "staged.txt")
    await writeFile(path.join(root, "untracked.txt"), "new\n")

    const status = await readWorkspaceGitStatus(root)
    expect(status.repository).toBe(true)
    expect(status.branch).toBeTruthy()
    expect(status.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tracked.txt",
          index: " ",
          worktree: "M",
          staged: false,
          untracked: false,
        }),
        expect.objectContaining({
          path: "staged.txt",
          index: "A",
          worktree: " ",
          staged: true,
          untracked: false,
        }),
        expect.objectContaining({
          path: "untracked.txt",
          index: "?",
          worktree: "?",
          staged: false,
          untracked: true,
        }),
      ])
    )
  })

  it("reads scoped line counts without changing the index", async () => {
    await writeFile(path.join(root, "tracked.txt"), "staged\nextra\n")
    await git(root, "add", "tracked.txt")
    await writeFile(path.join(root, "tracked.txt"), "working\nextra\nmore\n")
    const name = "中文\ttab\nfile.txt"
    await writeFile(path.join(root, name), "first\nlast")
    await writeFile(path.join(root, "empty.txt"), "")
    await writeFile(path.join(root, "binary.png"), Buffer.from([1, 0, 255]))
    await writeFile(path.join(root, "large.txt"), "a".repeat(300 * 1024))
    const index = await readFile(path.join(root, ".git/index"))
    const status = await readWorkspaceGitStatus(root, undefined, true)
    expect(status.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tracked.txt",
          stagedStats: { additions: 2, deletions: 1, binary: false },
          unstagedStats: { additions: 2, deletions: 1, binary: false },
        }),
        expect.objectContaining({
          path: name,
          unstagedStats: { additions: 2, deletions: 0, binary: false },
        }),
        expect.objectContaining({
          path: "empty.txt",
          unstagedStats: { additions: 0, deletions: 0, binary: false },
        }),
        expect.objectContaining({
          path: "binary.png",
          unstagedStats: { additions: 0, deletions: 0, binary: true },
        }),
      ])
    )
    expect(
      status.entries.find((entry) => entry.path === "large.txt")
    ).not.toHaveProperty("unstagedStats")
    expect(await readFile(path.join(root, ".git/index"))).toEqual(index)
  })

  it("attaches rename and binary stats to their destination paths", async () => {
    const destination = "新名\tline\nfile.txt"
    await rename(path.join(root, "tracked.txt"), path.join(root, destination))
    await writeFile(path.join(root, "binary.bin"), Buffer.from([0, 1, 2]))
    await git(root, "add", "--", "tracked.txt", destination, "binary.bin")
    const status = await readWorkspaceGitStatus(root, undefined, true)
    expect(status.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: destination,
          renamedFrom: "tracked.txt",
          stagedStats: { additions: 0, deletions: 0, binary: false },
        }),
        expect.objectContaining({
          path: "binary.bin",
          stagedStats: { additions: 0, deletions: 0, binary: true },
        }),
      ])
    )
  })

  it("returns a combined HEAD diff and validates path filters", async () => {
    await writeFile(path.join(root, "tracked.txt"), "after\nadded\n")
    const diff = await readWorkspaceGitDiff(root, "tracked.txt")
    expect(diff.repository).toBe(true)
    expect(diff.path).toBe("tracked.txt")
    expect(diff.diff).toContain("+added")
    expect(diff.additions).toBe(2)
    expect(diff.deletions).toBe(1)
    await expect(readWorkspaceGitDiff(root, "../tracked.txt")).rejects.toThrow()
  })

  it("reads staged and working changes independently", async () => {
    await writeFile(path.join(root, "tracked.txt"), "staged change\n")
    await git(root, "add", "tracked.txt")
    await writeFile(path.join(root, "tracked.txt"), "working change\n")
    const staged = await readWorkspaceGitDiff(
      root,
      "tracked.txt",
      undefined,
      "staged"
    )
    const working = await readWorkspaceGitDiff(
      root,
      "tracked.txt",
      undefined,
      "unstaged"
    )
    expect(staged.diff).toContain("+staged change")
    expect(staged.diff).not.toContain("working change")
    expect(working.diff).toContain("-staged change")
    expect(working.diff).toContain("+working change")
  })

  it("shows untracked text as an added file without modifying the index", async () => {
    const name = "中文\nnew.txt"
    await writeFile(path.join(root, name), "first\nlast")
    const index = await readFile(path.join(root, ".git/index"))
    const diff = await readWorkspaceGitDiff(root, name, undefined, "unstaged")
    expect(diff).toMatchObject({ additions: 2, deletions: 0, truncated: false })
    expect(diff.diff).toContain("--- /dev/null")
    expect(diff.diff).toContain("+first\n+last\n")
    expect(diff.diff).toContain("\\ No newline at end of file")
    expect(
      (await readWorkspaceGitDiff(root, name, undefined, "staged")).diff
    ).toBe("")
    expect(await readFile(path.join(root, ".git/index"))).toEqual(index)
  })

  it("reports binary and empty untracked files without inventing text changes", async () => {
    await writeFile(path.join(root, "binary.png"), Buffer.from([1, 0, 255]))
    await writeFile(path.join(root, "empty.txt"), "")
    const binary = await readWorkspaceGitDiff(
      root,
      "binary.png",
      undefined,
      "unstaged"
    )
    expect(binary.diff).toContain("Binary files /dev/null")
    expect(binary.additions).toBe(0)
    expect(binary.truncated).toBe(false)
    const empty = await readWorkspaceGitDiff(
      root,
      "empty.txt",
      undefined,
      "unstaged"
    )
    expect(empty.diff).toContain("new file mode")
    expect(empty.additions).toBe(0)
  })

  it("stages selected files and commits only their index contents", async () => {
    await writeFile(path.join(root, "tracked.txt"), "staged version\n")
    await writeFile(path.join(root, "unselected.txt"), "keep untracked\n")
    await stageWorkspaceGitFiles(root, ["tracked.txt"])
    await writeFile(path.join(root, "tracked.txt"), "later working version\n")
    const result = await commitWorkspaceGit(root, "manual change")
    expect(result.commit.hash).toBe(
      (await git(root, "rev-parse", "HEAD")).trim()
    )
    expect(await git(root, "show", "HEAD:tracked.txt")).toBe("staged version\n")
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "later working version\n"
    )
    expect(await git(root, "log", "-1", "--format=%an <%ae>")).toBe(
      "Buddy Test <test@example.com>\n"
    )
    expect((await readWorkspaceGitStatus(root)).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tracked.txt",
          staged: false,
          worktree: "M",
        }),
        expect.objectContaining({ path: "unselected.txt", untracked: true }),
      ])
    )
  })

  it("unstages selected files while preserving later working edits and other staged files", async () => {
    await writeFile(path.join(root, "tracked.txt"), "staged\n")
    await writeFile(path.join(root, "other.txt"), "other staged\n")
    await stageWorkspaceGitFiles(root, ["tracked.txt", "other.txt"])
    await writeFile(path.join(root, "tracked.txt"), "later\n")
    const status = await unstageWorkspaceGitFiles(root, ["tracked.txt"])
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "later\n"
    )
    expect(await git(root, "show", ":tracked.txt")).toBe("before\n")
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "other.txt", staged: true })
    )
  })

  it("unstages both sides of a rename without moving files back", async () => {
    await rename(path.join(root, "tracked.txt"), path.join(root, "renamed.txt"))
    await git(root, "add", "--", "tracked.txt", "renamed.txt")
    const status = await unstageWorkspaceGitFiles(root, ["renamed.txt"])
    expect(status.entries.every((entry) => !entry.staged)).toBe(true)
    expect(await readFile(path.join(root, "renamed.txt"), "utf8")).toBe(
      "before\n"
    )
    await expect(
      readFile(path.join(root, "tracked.txt"))
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("does not stage a recreated rename source when staging the destination", async () => {
    await rename(path.join(root, "tracked.txt"), path.join(root, "renamed.txt"))
    await git(root, "add", "--", "tracked.txt", "renamed.txt")
    await writeFile(path.join(root, "tracked.txt"), "unselected replacement\n")
    await writeFile(path.join(root, "renamed.txt"), "selected destination\n")
    const status = await stageWorkspaceGitFiles(root, ["renamed.txt"])
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "tracked.txt", untracked: true })
    )
    expect(await git(root, "show", ":renamed.txt")).toBe(
      "selected destination\n"
    )
  })

  it("unstages added files before the first commit and preserves changed content", async () => {
    await rm(path.join(root, ".git"), { recursive: true })
    await git(root, "init", "-q")
    await stageWorkspaceGitFiles(root, ["tracked.txt"])
    await writeFile(path.join(root, "tracked.txt"), "working content\n")
    const status = await unstageWorkspaceGitFiles(root, ["tracked.txt"])
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "tracked.txt", untracked: true })
    )
    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "working content\n"
    )
  })

  it("treats manual pathspecs literally and rejects empty, escaped, or metadata selections", async () => {
    await writeFile(path.join(root, "*.txt"), "literal\n")
    await writeFile(path.join(root, "unselected.txt"), "keep\n")
    const head = await git(root, "rev-parse", "HEAD")
    await expect(stageWorkspaceGitFiles(root, [])).rejects.toThrow("请选择")
    await expect(stageWorkspaceGitFiles(root, ["../escape"])).rejects.toThrow(
      "路径无效"
    )
    await expect(stageWorkspaceGitFiles(root, [".git/config"])).rejects.toThrow(
      "路径无效"
    )
    await expect(commitWorkspaceGit(root, " ")).rejects.toThrow("提交说明")
    await expect(commitWorkspaceGit(root, "nothing staged")).rejects.toThrow(
      "没有已暂存"
    )
    await stageWorkspaceGitFiles(root, ["*.txt"])
    expect((await readWorkspaceGitStatus(root)).entries).toContainEqual(
      expect.objectContaining({ path: "unselected.txt", staged: false })
    )
    await unstageWorkspaceGitFiles(root, ["*.txt"])
    expect(await git(root, "rev-parse", "HEAD")).toBe(head)
    await symlink(
      path.join(root, "unselected.txt"),
      path.join(root, "alias.txt")
    )
    await expect(stageWorkspaceGitFiles(root, ["alias.txt"])).rejects.toThrow(
      "符号链接"
    )
  })

  it("rejects hardlinked reflogs before manual mutations", async () => {
    const outside = path.join(root, "outside-log.txt")
    await writeFile(outside, "preserve this content\n")
    await rm(path.join(root, ".git/logs/HEAD"))
    await link(outside, path.join(root, ".git/logs/HEAD"))
    await writeFile(path.join(root, "tracked.txt"), "pending\n")
    await expect(stageWorkspaceGitFiles(root, ["tracked.txt"])).rejects.toThrow(
      "reflog"
    )
    await expect(commitWorkspaceGit(root, "unsafe metadata")).rejects.toThrow(
      "reflog"
    )
    expect(await readFile(outside, "utf8")).toBe("preserve this content\n")
  })

  it("serializes concurrent manual actions in request order", async () => {
    await writeFile(path.join(root, "one.txt"), "one\n")
    await writeFile(path.join(root, "two.txt"), "two\n")
    await Promise.all([
      stageWorkspaceGitFiles(root, ["one.txt"]),
      stageWorkspaceGitFiles(root, ["two.txt"]),
      commitWorkspaceGit(root, "both selected"),
    ])
    expect(await git(root, "show", "HEAD:one.txt")).toBe("one\n")
    expect(await git(root, "show", "HEAD:two.txt")).toBe("two\n")
    await expect(commitWorkspaceGit(root, "empty")).rejects.toThrow(
      "没有已暂存"
    )
    await writeFile(path.join(root, "one.txt"), "next\n")
    await expect(
      stageWorkspaceGitFiles(root, ["one.txt"])
    ).resolves.toMatchObject({ repository: true })
  })

  it("preserves invocation order when the first repository path resolves slowly", async () => {
    await writeFile(path.join(root, "one.txt"), "one\n")
    await writeFile(path.join(root, "two.txt"), "two\n")
    const actualRealpath = (
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises"
      )
    ).realpath
    let release!: () => void
    let resolutions = 0
    vi.mocked(filesystem.realpath).mockImplementation(async (input) => {
      if (input === root && ++resolutions === 1)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return actualRealpath(input)
    })
    const requests = [
      stageWorkspaceGitFiles(root, ["one.txt"]),
      stageWorkspaceGitFiles(root, ["two.txt"]),
      commitWorkspaceGit(root, "ordered after path resolution"),
    ]
    for (let index = 0; index < 10 && !release; index++) await Promise.resolve()
    const admittedBeforeRelease = resolutions
    release()
    await Promise.all(requests)
    expect(admittedBeforeRelease).toBe(1)
    expect(await git(root, "show", "HEAD:one.txt")).toBe("one\n")
    expect(await git(root, "show", "HEAD:two.txt")).toBe("two\n")
  })

  it("uses configured global identity without enabling its helpers or includes", async () => {
    const home = path.join(root, "identity-home")
    await mkdir(home)
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", path.join(home, "xdg"))
    await git(root, "config", "--unset", "user.name")
    await git(root, "config", "--unset", "user.email")
    const helper = path.join(root, "global-helper")
    await writeFile(
      helper,
      '#!/bin/sh\nprintf invoked >> "$0.marker"\nexit 1\n'
    )
    await chmod(helper, 0o755)
    await writeFile(
      path.join(home, ".gitconfig"),
      `[user]\nname = Local Developer\nemail = developer@example.com\n[core]\nfsmonitor = ${helper}\n[include]\npath = missing-config\n`
    )
    await writeFile(path.join(root, "tracked.txt"), "global identity\n")
    await stageWorkspaceGitFiles(root, ["tracked.txt"])
    await commitWorkspaceGit(root, "global author")
    expect(await git(root, "log", "-1", "--format=%an <%ae>")).toBe(
      "Local Developer <developer@example.com>\n"
    )
    await expect(readFile(helper + ".marker")).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("keeps staged files when identity is missing and gives setup instructions", async () => {
    const home = path.join(root, "empty-home")
    await mkdir(home)
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", path.join(home, "xdg"))
    await git(root, "config", "--unset", "user.name")
    await git(root, "config", "--unset", "user.email")
    await writeFile(path.join(root, "tracked.txt"), "waiting for identity\n")
    await stageWorkspaceGitFiles(root, ["tracked.txt"])
    const head = await git(root, "rev-parse", "HEAD")
    await expect(commitWorkspaceGit(root, "missing author")).rejects.toThrow(
      "git config --global user.name"
    )
    expect(await git(root, "rev-parse", "HEAD")).toBe(head)
    expect((await readWorkspaceGitStatus(root)).entries).toContainEqual(
      expect.objectContaining({ path: "tracked.txt", staged: true })
    )
  })

  it("does not execute hooks or signing programs during manual commits", async () => {
    const helper = path.join(root, "commit-helper")
    await writeFile(
      helper,
      '#!/bin/sh\nprintf invoked >> "$0.marker"\nexit 1\n'
    )
    await chmod(helper, 0o755)
    await git(root, "config", "core.hooksPath", root)
    await writeFile(
      path.join(root, "pre-commit"),
      `#!/bin/sh\nexec "${helper}"\n`
    )
    await chmod(path.join(root, "pre-commit"), 0o755)
    await git(root, "config", "gpg.program", helper)
    await git(root, "config", "commit.gpgSign", "true")
    await writeFile(path.join(root, "tracked.txt"), "safe manual commit\n")
    await stageWorkspaceGitFiles(root, ["tracked.txt"])
    await commitWorkspaceGit(root, "manual with disabled helpers")
    await expect(readFile(helper + ".marker")).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("checks staged and unstaged whitespace without modifying the index or HEAD", async () => {
    await writeFile(path.join(root, "tracked.txt"), "staged  \n")
    await git(root, "add", "tracked.txt")
    await writeFile(path.join(root, "tracked.txt"), "working  \n")
    await writeFile(path.join(root, "untracked.txt"), "new\n")
    const index = await readFile(path.join(root, ".git", "index"))
    const head = await git(root, "rev-parse", "HEAD")
    const report = await checkWorkspaceEngineering(root)
    expect(report).toMatchObject({
      repository: true,
      conflicts: [],
      staged: 1,
      unstaged: 1,
      untracked: 1,
    })
    expect(report.whitespace).toEqual([
      expect.objectContaining({ scope: "staged", ok: false }),
      expect.objectContaining({ scope: "unstaged", ok: false }),
    ])
    expect(
      report.whitespace.every((item) =>
        item.output.includes("trailing whitespace")
      )
    ).toBe(true)
    expect(await readFile(path.join(root, ".git", "index"))).toEqual(index)
    expect(await git(root, "rev-parse", "HEAD")).toBe(head)
  })

  it("returns an empty non-repository result", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-git-empty-"))
    try {
      await expect(readWorkspaceGitStatus(directory)).resolves.toMatchObject({
        repository: false,
        entries: [],
      })
      await expect(readWorkspaceGitDiff(directory)).resolves.toMatchObject({
        repository: false,
        diff: "",
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("preserves Unicode, whitespace, newlines, arrows, and rename source paths", async () => {
    const source = "旧文件 -> before\n name.txt"
    const destination = "新文件 -> after\n name.txt"
    const untracked = ["中文 文件.txt", "tab\tname.txt", "literal -> name.txt"]
    await writeFile(path.join(root, source), "rename content\n")
    await git(root, "add", "--", source)
    await git(root, "commit", "-qm", "rename fixture")
    await rename(path.join(root, source), path.join(root, destination))
    await git(root, "add", "-A")
    for (const name of untracked) await writeFile(path.join(root, name), "new")

    const status = await readWorkspaceGitStatus(root)
    expect(status.entries).toHaveLength(4)
    expect(status.entries).toContainEqual({
      path: destination,
      renamedFrom: source,
      index: "R",
      worktree: " ",
      staged: true,
      untracked: false,
    })
    expect(
      status.entries
        .filter((entry) => entry.untracked)
        .map((entry) => entry.path)
    ).toEqual(expect.arrayContaining(untracked))
    const diff = await readWorkspaceGitDiff(root, destination)
    expect(diff.diff).toContain("+rename content")
  })

  it("treats glob and pathspec-magic file names as literal paths", async () => {
    const names = ["*.txt", ":(glob)*.txt"]
    for (const name of names) {
      await writeFile(path.join(root, name), "old literal\n")
      await git(root, "--literal-pathspecs", "add", "--", name)
    }
    await git(root, "commit", "-qm", "literal fixture")
    await writeFile(path.join(root, "tracked.txt"), "unrelated change\n")
    for (const name of names) {
      await writeFile(path.join(root, name), `updated ${name}\n`)
      const diff = await readWorkspaceGitDiff(root, name)
      expect(diff.diff).toContain(`+updated ${name}`)
      expect(diff.diff).not.toContain("unrelated change")
      expect(diff.additions).toBe(1)
    }
  })

  it("reads deleted files even when their parent directories no longer exist", async () => {
    await mkdir(path.join(root, "removed", "nested"), { recursive: true })
    await writeFile(
      path.join(root, "removed/nested/file.txt"),
      "deleted content\n"
    )
    await git(root, "add", "removed")
    await git(root, "commit", "-qm", "deleted fixture")
    await rm(path.join(root, "removed"), { recursive: true })
    await expect(
      readWorkspaceGitDiff(root, "removed/nested/file.txt")
    ).resolves.toMatchObject({ additions: 0, deletions: 1 })
  })

  it("compares the current files with the empty tree in an unborn repository", async () => {
    await rm(path.join(root, ".git"), { recursive: true })
    await git(root, "init", "-q")
    await writeFile(path.join(root, "new.txt"), "staged content\n")
    await git(root, "add", "new.txt")
    await writeFile(path.join(root, "new.txt"), "working content\n")
    const status = await readWorkspaceGitStatus(root)
    expect(status.branch).not.toContain("No commits")
    const diff = await readWorkspaceGitDiff(root, "new.txt")
    expect(diff.diff).not.toContain("staged content")
    expect(diff.diff).toContain("+working content")
    expect(diff.diff.match(/^diff --git /gm)).toHaveLength(1)
    expect(diff.additions).toBe(1)
    expect(diff.deletions).toBe(0)
    expect(diff.truncated).toBe(false)
    const staged = await readWorkspaceGitDiff(
      root,
      "new.txt",
      undefined,
      "staged"
    )
    expect(staged.diff).toContain("+staged content")
  })

  it("ignores inherited Git repository, index, and config overrides", async () => {
    const other = path.join(root, "other")
    await mkdir(other)
    await git(other, "init", "-q")
    await writeFile(path.join(other, "foreign.txt"), "private\n")
    await writeFile(path.join(root, "tracked.txt"), "local change\n")
    await git(root, "config", "core.worktree", other)
    vi.stubEnv("GIT_DIR", path.join(other, ".git"))
    vi.stubEnv("GIT_WORK_TREE", other)
    vi.stubEnv("GIT_INDEX_FILE", path.join(other, ".git/index"))
    vi.stubEnv("GIT_CONFIG_COUNT", "1")
    vi.stubEnv("GIT_CONFIG_KEY_0", "core.worktree")
    vi.stubEnv("GIT_CONFIG_VALUE_0", other)
    const status = await readWorkspaceGitStatus(root)
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "tracked.txt", worktree: "M" })
    )
    expect(status.entries.some((entry) => entry.path === "foreign.txt")).toBe(
      false
    )
    const diff = await readWorkspaceGitDiff(root, "tracked.txt")
    expect(diff.diff).toContain("+local change")
    expect(diff.diff).not.toContain("private")
  })

  it("does not discover a parent repository outside the selected directory", async () => {
    const scoped = path.join(root, "scoped")
    await mkdir(scoped)
    await writeFile(path.join(root, "tracked.txt"), "outside change\n")
    await expect(readWorkspaceGitStatus(scoped)).resolves.toMatchObject({
      repository: false,
      entries: [],
    })
    await expect(readWorkspaceGitDiff(scoped)).resolves.toMatchObject({
      repository: false,
      diff: "",
    })
  })

  it("does not execute configured fsmonitor, textconv, or external diff helpers", async () => {
    const helper = path.join(root, "git-helper")
    await writeFile(
      helper,
      '#!/bin/sh\nprintf invoked >> "$0.marker"\nexit 1\n'
    )
    await chmod(helper, 0o755)
    await git(root, "config", "core.fsmonitor", helper)
    await git(root, "config", "diff.fixture.textconv", helper)
    await git(root, "config", "diff.fixture.command", helper)
    await git(root, "config", "diff.external", helper)
    await writeFile(
      path.join(root, ".gitattributes"),
      "tracked.txt diff=fixture\n"
    )
    await writeFile(path.join(root, "tracked.txt"), "safe diff\n")
    const status = await readWorkspaceGitStatus(root)
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "tracked.txt" })
    )
    expect((await readWorkspaceGitDiff(root, "tracked.txt")).diff).toContain(
      "+safe diff"
    )
    await expect(readFile(helper + ".marker")).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("does not inspect submodule worktrees even when recursion is configured", async () => {
    const module = path.join(root, "module")
    await mkdir(module)
    await git(module, "init", "-q")
    await git(module, "config", "user.email", "test@example.com")
    await git(module, "config", "user.name", "Buddy Test")
    await writeFile(path.join(module, "nested.txt"), "nested before\n")
    await git(module, "add", "nested.txt")
    await git(module, "commit", "-qm", "nested fixture")
    const commit = (await git(module, "rev-parse", "HEAD")).trim()
    await git(
      root,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${commit},module`
    )
    await git(root, "commit", "-qm", "submodule fixture")
    await git(root, "config", "submodule.recurse", "true")
    await writeFile(path.join(module, "nested.txt"), "nested after\n")
    await expect(readWorkspaceGitStatus(root)).resolves.toMatchObject({
      entries: [],
    })
    await expect(readWorkspaceGitDiff(root)).resolves.toMatchObject({
      diff: "",
      additions: 0,
      deletions: 0,
    })
  })

  it("rejects a linked worktree until external metadata has an authorization binding", async () => {
    const linked = path.join(root, "linked")
    await git(root, "worktree", "add", "--detach", linked)
    await writeFile(path.join(linked, "tracked.txt"), "linked change\n")
    const execute = vi.spyOn(executionProcess, "executeBounded")
    await expect(readWorkspaceGitStatus(linked)).rejects.toThrow(
      "linked worktree"
    )
    await expect(readWorkspaceGitDiff(linked)).rejects.toThrow("授权绑定")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects a symlinked Git directory before any Git process starts", async () => {
    await rename(path.join(root, ".git"), path.join(root, "metadata"))
    await symlink(path.join(root, "metadata"), path.join(root, ".git"))
    const execute = vi.spyOn(executionProcess, "executeBounded")
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow("符号链接")
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow("符号链接")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects object alternates and symbolic links inside Git metadata", async () => {
    const alternate = path.join(root, ".git/objects/info/alternates")
    await writeFile(alternate, path.join(root, "other-objects") + "\n")
    const execute = vi.spyOn(executionProcess, "executeBounded")
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow(
      "外部 Git 元数据"
    )
    await rm(alternate)
    await rename(path.join(root, ".git/objects"), path.join(root, "objects"))
    await symlink(path.join(root, "objects"), path.join(root, ".git/objects"))
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow("符号链接")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects config includes without reading the included configuration", async () => {
    const originalConfig = await readFile(
      path.join(root, ".git/config"),
      "utf8"
    )
    await git(root, "config", "include.path", path.join(root, "outside-config"))
    await writeFile(
      path.join(root, "outside-config"),
      "invalid content that must not be parsed\n"
    )
    const execute = vi.spyOn(executionProcess, "executeBounded")
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow(
      "引用了其他配置文件"
    )
    await expect(execute.mock.results[0]!.value).resolves.toMatchObject({
      code: 0,
      stdout: "include.path\n",
    })
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow(
      "引用了其他配置文件"
    )
    await writeFile(path.join(root, ".git/config"), originalConfig)
    await git(root, "config", "extensions.worktreeConfig", "true")
    await writeFile(
      path.join(root, ".git/config.worktree"),
      '[includeIf "gitdir:**"]\npath = ../outside-config\n'
    )
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow(
      "引用了其他配置文件"
    )
  })

  it("rejects symlink path filters and empty paths", async () => {
    await symlink(path.join(root, "tracked.txt"), path.join(root, "alias.txt"))
    await expect(readWorkspaceGitDiff(root, "alias.txt")).rejects.toThrow(
      "符号链接"
    )
    await expect(readWorkspaceGitDiff(root, "")).rejects.toThrow("路径无效")
  })

  it("rejects external clean filters before status can run repository commands", async () => {
    const helper = path.join(root, "clean-helper")
    await writeFile(helper, '#!/bin/sh\nprintf invoked >> "$0.marker"\ncat\n')
    await chmod(helper, 0o755)
    await git(root, "config", "filter.fixture.clean", helper)
    await writeFile(
      path.join(root, ".gitattributes"),
      "tracked.txt filter=fixture\n"
    )
    await writeFile(path.join(root, "tracked.txt"), "filter change\n")
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow("外部过滤器")
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow("外部过滤器")
    await expect(readFile(helper + ".marker")).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("rejects deadline and cancellation results even when the process exit code is zero", async () => {
    const execute = vi.spyOn(executionProcess, "executeBounded")
    execute.mockResolvedValue({
      code: 0,
      exitCode: 0,
      stdout: "## main\0",
      stderr: "",
      reason: "deadline",
    })
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow("超时")
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow("超时")
    execute.mockResolvedValue({
      code: 0,
      exitCode: 0,
      stdout: "",
      stderr: "",
      reason: "cancelled",
    })
    await expect(readWorkspaceGitDiff(root)).rejects.toThrow("取消")
  })

  it("rejects incomplete status and returns explicit truncated diffs with hunk counts", async () => {
    const execute = vi.spyOn(executionProcess, "executeBounded")
    execute.mockResolvedValue({
      code: -1,
      exitCode: null,
      stdout: "## main\0 M par",
      stderr: "",
      reason: "output-limit",
    })
    await expect(readWorkspaceGitStatus(root)).rejects.toThrow("输出过大")
    const diff =
      "diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n---old\n+++new\n"
    execute.mockImplementation(async ({ args }) => {
      if (args.includes("config"))
        return { code: 1, exitCode: 1, stdout: "", stderr: "" }
      return {
        code: -1,
        exitCode: null,
        stdout: diff,
        stderr: "",
        reason: "output-limit",
      }
    })
    await expect(readWorkspaceGitDiff(root)).resolves.toMatchObject({
      diff,
      additions: 1,
      deletions: 1,
      truncated: true,
    })
  })
})
