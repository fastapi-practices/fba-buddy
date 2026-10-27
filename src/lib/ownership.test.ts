import { describe, expect, it } from "vitest"

import {
  canEditOwnedResource,
  isBuiltinOwner,
  SYSTEM_OWNER_USER_ID,
} from "@/lib/ownership"

describe("ownership", () => {
  it("treats missing or 0 as builtin and not editable", () => {
    expect(SYSTEM_OWNER_USER_ID).toBe(0)
    expect(isBuiltinOwner(0)).toBe(true)
    expect(isBuiltinOwner(undefined)).toBe(true)
    expect(isBuiltinOwner(null)).toBe(true)
    expect(canEditOwnedResource(0)).toBe(false)
    expect(canEditOwnedResource(undefined)).toBe(false)
  })

  it("lets the current user edit their own rows", () => {
    expect(isBuiltinOwner(12)).toBe(false)
    expect(canEditOwnedResource(12)).toBe(true)
  })
})
