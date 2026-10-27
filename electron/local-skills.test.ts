import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  filterLocalSkills,
  parseSkillFrontmatter,
  readSkillFiles,
  scanSkillRoots,
} from "./local-skills"

const tempDirs: string[] = []

function makeSkillDir(root: string, name: string, markdown: string) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "SKILL.md"), markdown)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

describe("local skills", () => {
  it("parses YAML frontmatter", () => {
    expect(
      parseSkillFrontmatter(
        "---\nname: weekly\ndescription: 写周报\nmetadata:\n  version: 1.2.0\n---\nbody\n"
      )
    ).toEqual({
      name: "weekly",
      description: "写周报",
      version: "1.2.0",
    })
  })

  it("scans skill folders under known roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-skills-"))
    tempDirs.push(root)
    makeSkillDir(
      root,
      "weekly",
      "---\nname: weekly\ndescription: 写周报\n---\n"
    )
    const hits = scanSkillRoots([root])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.name).toBe("weekly")
    expect(hits[0]?.description).toBe("写周报")
  })

  it("filters by name and description", () => {
    const hits = filterLocalSkills(
      [
        {
          path: "/a",
          name: "weekly",
          description: "写周报",
          version: "0.1.0",
          source: "/skills",
        },
        {
          path: "/b",
          name: "review",
          description: "代码审查",
          version: "0.1.0",
          source: "/skills",
        },
      ],
      "周报"
    )
    expect(hits.map((item) => item.name)).toEqual(["weekly"])
  })

  it("reads skill files for import", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-skills-"))
    tempDirs.push(root)
    const skillDir = makeSkillDir(
      root,
      "weekly",
      "---\nname: weekly\ndescription: 写周报\n---\n"
    )
    const packed = readSkillFiles(skillDir)
    expect(packed.name).toBe("weekly")
    expect(packed.files.some((file) => file.relativePath === "SKILL.md")).toBe(
      true
    )
  })
})
