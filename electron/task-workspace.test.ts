import { lstat, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import {
  defaultTaskWorkspaceRoot,
  ensureTaskWorkspace,
  taskWorkspaceDirectory,
  validateTaskWorkspaceDirectory,
} from "./task-workspace"

it("builds a date-scoped task workspace under the user's .fbabuddy directory", () => {
  const home = "/Users/demo"
  const workspace = taskWorkspaceDirectory(
    home,
    "account-hash:conversation/one",
    new Date(2026, 9, 11)
  )
  expect(workspace).toBe(
    path.join(
      home,
      ".fbabuddy",
      "2026",
      "10",
      "11",
      "task_conversation_one_account-hash"
    )
  )
  expect(workspace).not.toContain(path.join(home, "Documents"))
  expect(workspace).not.toBe(home)
  expect(defaultTaskWorkspaceRoot(home)).toBe(path.join(home, ".fbabuddy"))
})

it.each([
  ["darwin", "/Users/demo"],
  ["linux", "/home/demo"],
  ["win32", "C:\\Users\\demo"],
] as const)(
  "validates persisted task dates and ownership on %s",
  (platform, home) => {
    const paths = platform === "win32" ? path.win32 : path.posix
    const root = defaultTaskWorkspaceRoot(home, platform)
    const task = "task_conversation_account"
    expect(() =>
      validateTaskWorkspaceDirectory(
        "account:conversation",
        paths.join(root, "2024", "02", "29", task),
        platform
      )
    ).not.toThrow()
    expect(() =>
      validateTaskWorkspaceDirectory(
        "account:conversation",
        paths.join(home, "AI Buddy", "workspaces", "2024", "02", "29", task),
        platform
      )
    ).not.toThrow()
    for (const directory of [
      root,
      paths.join(root, "2026", "02", "30", task),
      paths.join(root, "2026", "13", "01", task),
      paths.join(root, "2026", "10", "13", "task_other_account"),
    ])
      expect(() =>
        validateTaskWorkspaceDirectory(
          "account:conversation",
          directory,
          platform
        )
      ).toThrow()
  }
)

it("creates the task input, output, temporary, and metadata directories", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "buddy-task-workspace-"))
  const workspace = taskWorkspaceDirectory(
    home,
    "account:conversation",
    new Date(2026, 9, 11)
  )
  try {
    await ensureTaskWorkspace(workspace)
    for (const segment of ["inbound", "outbound", "tmp", ".fbabuddy"])
      expect((await lstat(path.join(workspace, segment))).isDirectory()).toBe(
        true
      )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
