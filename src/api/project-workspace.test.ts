import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectItem } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  validate: vi.fn(),
  source: "account-one",
}))
vi.mock("@/api/projects", () => ({
  createProject: mocks.create,
  listProjects: mocks.list,
}))
vi.mock("@/lib/project-workspace", () => ({
  setProjectDirectory: mocks.save,
  validateProjectDirectory: mocks.validate,
}))
vi.mock("@/lib/account-source", () => ({ dataSourceKey: () => mocks.source }))
import { createProjectWithDirectory } from "./project-workspace"

const project = (id: number, name = "demo"): ProjectItem => ({
  id,
  name,
  user_id: 1,
  sort: 0,
  archived: false,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.source = "account-one"
  mocks.create.mockResolvedValue(null)
  mocks.save.mockResolvedValue("/projects/demo")
  mocks.validate.mockImplementation(async (directory: string) => directory)
})

describe("creating a project with a device folder", () => {
  it("does not create a server project when desktop validation fails", async () => {
    mocks.validate.mockRejectedValueOnce(new Error("Restart desktop"))

    await expect(
      createProjectWithDirectory({
        name: "demo",
        directory: "/projects/demo",
      })
    ).rejects.toThrow("Restart desktop")

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("uses the validated directory and cancels creation if the account changes during validation", async () => {
    mocks.validate.mockResolvedValueOnce("/canonical/demo")
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([project(2)])
    await createProjectWithDirectory({
      name: "demo",
      directory: "/projects/demo",
    })
    expect(mocks.save).toHaveBeenCalledWith(2, "/canonical/demo")

    vi.clearAllMocks()
    mocks.validate.mockImplementationOnce(async () => {
      mocks.source = "account-two"
      return "/canonical/demo"
    })
    await expect(
      createProjectWithDirectory({
        name: "demo",
        directory: "/projects/demo",
      })
    ).rejects.toThrow("账号已切换")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("finds the created project id while preserving the existing name-only server contract", async () => {
    mocks.list
      .mockResolvedValueOnce([project(1)])
      .mockResolvedValueOnce([project(1), project(2)])
    const result = await createProjectWithDirectory({
      name: "demo",
      directory: "/projects/demo",
    })
    expect(mocks.create).toHaveBeenCalledWith("demo")
    expect(mocks.validate).toHaveBeenCalledWith("/projects/demo")
    expect(mocks.save).toHaveBeenCalledWith(2, "/projects/demo")
    expect(result).toEqual({ project: project(2), directoryError: null })
  })

  it("does not repeat project creation when local directory persistence fails", async () => {
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([project(2)])
    mocks.save.mockRejectedValueOnce(new Error("disk unavailable"))
    const result = await createProjectWithDirectory({
      name: "demo",
      directory: "/projects/demo",
    })
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(result.project?.id).toBe(2)
    expect(result.directoryError).toEqual(new Error("disk unavailable"))
  })

  it("refuses an ambiguous project identity instead of binding an unrelated project", async () => {
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([project(2), project(3)])
    const result = await createProjectWithDirectory({
      name: "demo",
      directory: "/projects/demo",
    })
    expect(result.directoryError).toBeInstanceOf(Error)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps projects without source folders available and avoids stale account writes", async () => {
    expect(
      await createProjectWithDirectory({ name: "demo", directory: null })
    ).toEqual({ project: null, directoryError: null })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.validate).not.toHaveBeenCalled()
    mocks.list.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      mocks.source = "account-two"
      return [project(2)]
    })
    const result = await createProjectWithDirectory({
      name: "demo",
      directory: "/projects/demo",
    })
    expect(result.directoryError).toBeInstanceOf(DOMException)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
