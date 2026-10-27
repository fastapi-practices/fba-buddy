import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { currentAccountSource, dataSourceKey } from "@/lib/account-source"
import { translateCurrent } from "@/lib/i18n"
import {
  copyProjectDirectoryPath,
  openProjectDirectory,
  validateProjectDirectory,
} from "@/lib/project-workspace"

vi.mock("@/lib/account-source", () => ({
  currentAccountSource: vi.fn(),
  dataSourceKey: vi.fn(),
}))

const source = { backendUrl: "https://buddy.example/api/v1", accountId: "1" }
const projectWorkspace = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentAccountSource).mockReturnValue(source)
  vi.mocked(dataSourceKey).mockReturnValue("account-one")
  vi.stubGlobal("window", { buddyDesktop: { projectWorkspace } })
})

afterEach(() => vi.unstubAllGlobals())

it("validates a local directory without persisting a project association", async () => {
  projectWorkspace.mockResolvedValueOnce({ directory: "/canonical/demo" })

  expect(await validateProjectDirectory("/projects/demo")).toBe(
    "/canonical/demo"
  )
  expect(projectWorkspace).toHaveBeenCalledExactlyOnceWith({
    action: "validate",
    directory: "/projects/demo",
    source,
  })
})

it("explains a stale desktop IPC handler with a restart instruction", async () => {
  projectWorkspace.mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'desktop:project-workspace': Error: No handler registered for 'desktop:project-workspace'"
    )
  )

  await expect(validateProjectDirectory("/projects/demo")).rejects.toThrow(
    translateCurrent("common.projectFolderRestartRequired")
  )
})

it("reports unavailable directories and rejects missing desktop support", async () => {
  projectWorkspace.mockRejectedValueOnce(
    new Error("ENOENT: no such file or directory, realpath '/projects/demo'")
  )
  await expect(validateProjectDirectory("/projects/demo")).rejects.toThrow(
    translateCurrent("common.projectFolderUnavailable")
  )

  vi.stubGlobal("window", { buddyDesktop: {} })
  await expect(validateProjectDirectory("/projects/demo")).rejects.toThrow(
    translateCurrent("common.projectFolderRequiresDesktop")
  )
})

it("ignores a stale desktop error after the account changes", async () => {
  projectWorkspace.mockImplementationOnce(async () => {
    vi.mocked(dataSourceKey).mockReturnValue("account-two")
    throw new Error("No handler registered for 'desktop:project-workspace'")
  })

  await expect(
    validateProjectDirectory("/projects/demo")
  ).rejects.toMatchObject({
    name: "AbortError",
  })
})

it("opens and copies the bound project directory through account-scoped desktop requests", async () => {
  projectWorkspace.mockResolvedValue({ directory: "/projects/完整目录" })
  expect(await openProjectDirectory(7)).toBe("/projects/完整目录")
  expect(await copyProjectDirectoryPath(7)).toBe("/projects/完整目录")
  expect(projectWorkspace.mock.calls).toEqual([
    [{ action: "open-folder", projectId: 7, source }],
    [{ action: "copy-path", projectId: 7, source }],
  ])
})

it("reports unavailable project folders when opening and preserves native open errors", async () => {
  projectWorkspace.mockRejectedValueOnce(
    new Error("ENOENT: no such file or directory, realpath '/projects/demo'")
  )
  await expect(openProjectDirectory(7)).rejects.toThrow(
    translateCurrent("common.projectFolderUnavailable")
  )
  projectWorkspace.mockRejectedValueOnce(
    new Error("打开项目目录失败：权限不足")
  )
  await expect(openProjectDirectory(7)).rejects.toThrow(
    "打开项目目录失败：权限不足"
  )
})

it.each([openProjectDirectory, copyProjectDirectoryPath])(
  "rejects native project directory actions without desktop support (%#)",
  async (action) => {
    vi.stubGlobal("window", { buddyDesktop: {} })
    await expect(action(7)).rejects.toThrow(
      translateCurrent("common.projectFolderRequiresDesktop")
    )
    expect(projectWorkspace).not.toHaveBeenCalled()
  }
)

it.each([openProjectDirectory, copyProjectDirectoryPath])(
  "rejects native directory action results after switching accounts (%#)",
  async (action) => {
    projectWorkspace.mockImplementationOnce(async () => {
      vi.mocked(dataSourceKey).mockReturnValue("account-two")
      return { directory: "/projects/other-account" }
    })
    await expect(action(7)).rejects.toMatchObject({ name: "AbortError" })
  }
)
