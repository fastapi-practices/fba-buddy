import { describe, expect, it } from "vitest"

import { toProjectWriteBody } from "@/api/projects"

describe("toProjectWriteBody", () => {
  const project = {
    name: "周报",
    sort: 2,
    archived: false,
  }

  it("keeps sort and archive when only the name changes", () => {
    expect(toProjectWriteBody(project, { name: "月报" })).toEqual({
      name: "月报",
      sort: 2,
      archived: false,
    })
  })

  it("can archive without dropping the rest of the project", () => {
    expect(toProjectWriteBody(project, { archived: true })).toEqual({
      name: "周报",
      sort: 2,
      archived: true,
    })
  })
})
