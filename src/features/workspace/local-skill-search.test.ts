import { describe, expect, it } from "vitest"

import {
  filesFromLocalSkill,
  filterLocalSkills,
} from "@/features/workspace/local-skill-search"

describe("local skill search", () => {
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

  it("builds upload files from a local skill payload", () => {
    const files = filesFromLocalSkill({
      name: "weekly",
      files: [
        {
          relativePath: "SKILL.md",
          contentBase64: btoa("---\nname: weekly\n---\n"),
        },
      ],
    })
    expect(files[0]?.name).toBe("weekly/SKILL.md")
  })
})
