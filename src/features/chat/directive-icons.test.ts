import { describe, expect, it } from "vitest"

import { WORKSPACE_KIND_IDS } from "@/features/workspace/workspace-nav"
import {
  DIRECTIVE_FALLBACK_ICON,
  DIRECTIVE_ICONS,
  directiveIcon,
} from "./directive-icons"

describe("directive icons", () => {
  it("covers every workspace kind with its own icon", () => {
    for (const kind of WORKSPACE_KIND_IDS) {
      expect(directiveIcon(kind), kind).toBe(DIRECTIVE_ICONS[kind])
      expect(directiveIcon(kind), kind).not.toBe(DIRECTIVE_FALLBACK_ICON)
    }
  })

  it("gives files, tools and slash commands distinct icons", () => {
    const file = directiveIcon("file")
    expect(file).not.toBe(directiveIcon("tool"))
    expect(directiveIcon("command")).toBe(directiveIcon("slash"))
    expect(directiveIcon("command")).not.toBe(file)
  })

  it("falls back to a neutral icon for unknown types", () => {
    expect(directiveIcon("unknown-type")).toBe(DIRECTIVE_FALLBACK_ICON)
  })
})
