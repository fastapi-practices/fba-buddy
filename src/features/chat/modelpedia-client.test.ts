import { describe, expect, it } from "vitest"

import {
  isExactCatalogId,
  pickExactCatalogModel,
  type CatalogModel,
} from "./modelpedia-client"

function model(
  partial: Partial<CatalogModel> & Pick<CatalogModel, "id" | "provider">
): CatalogModel {
  return {
    created_by: "openai",
    source: "official",
    last_updated: "2026-09-03",
    name: partial.id,
    ...partial,
  }
}

describe("isExactCatalogId", () => {
  it("accepts the bare id and provider-prefixed ids", () => {
    expect(isExactCatalogId("gpt-5.6-luna", "gpt-5.6-luna")).toBe(true)
    expect(isExactCatalogId("openai/gpt-5.6-luna", "gpt-5.6-luna")).toBe(true)
    expect(isExactCatalogId("openai.gpt-5.6-luna", "gpt-5.6-luna")).toBe(true)
  })

  it("rejects parent and sibling ids", () => {
    expect(isExactCatalogId("gpt-5.6", "gpt-5.6-luna")).toBe(false)
    expect(isExactCatalogId("gpt-5.6-luna-pro", "gpt-5.6-luna")).toBe(false)
    expect(isExactCatalogId("gpt-5.3-codex", "gpt-5.3-codex-spark")).toBe(false)
  })
})

describe("pickExactCatalogModel", () => {
  it("keeps the exact id and prefers the richest official record", () => {
    const picked = pickExactCatalogModel(
      [
        model({
          id: "gpt-5.6",
          provider: "azure",
          context_window: 1_000_000,
        }),
        model({
          id: "gpt-5.6-luna",
          provider: "opencode",
          context_window: 1_050_000,
        }),
        model({
          id: "gpt-5.6-luna",
          provider: "openai",
          context_window: 1_050_000,
          pricing: { input: 0.2, output: 1.2 },
          capabilities: { reasoning: true, vision: true, tool_call: true },
        }),
      ],
      "gpt-5.6-luna"
    )
    expect(picked?.provider).toBe("openai")
    expect(picked?.id).toBe("gpt-5.6-luna")
    expect(picked?.pricing?.input).toBe(0.2)
  })

  it("does not fall back to a parent model id", () => {
    expect(
      pickExactCatalogModel(
        [
          model({
            id: "gpt-5.3-codex",
            provider: "openai",
            context_window: 400_000,
            capabilities: { reasoning: true, vision: true, tool_call: true },
          }),
        ],
        "gpt-5.3-codex-spark"
      )
    ).toBeUndefined()
  })
})
