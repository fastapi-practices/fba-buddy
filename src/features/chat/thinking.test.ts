import { translate } from "@/lib/i18n"
import { describe, expect, it } from "vitest"

import {
  buildEffortOptions,
  effortToThinking,
  resolveThinkingForModel,
  thinkingForApi,
  thinkingToEffort,
} from "./thinking"
import type { ModelThinking } from "@/lib/types"

const gpt52: ModelThinking = {
  supported: true,
  efforts: ["none", "low", "medium", "high", "xhigh"],
  default: "none",
  mandatory: false,
}

const o3: ModelThinking = {
  supported: true,
  efforts: ["low", "medium", "high"],
  default: "medium",
  mandatory: true,
}

describe("thinkingToEffort", () => {
  it("keeps named efforts and maps off to none", () => {
    expect(thinkingToEffort("minimal")).toBe("minimal")
    expect(thinkingToEffort("xhigh")).toBe("xhigh")
    expect(thinkingToEffort("max")).toBe("max")
    expect(thinkingToEffort(true)).toBe("high")
    expect(thinkingToEffort("off")).toBe("off")
    expect(thinkingToEffort(false)).toBe("none")
    expect(thinkingToEffort(null)).toBe("none")
  })
})

describe("thinkingForApi", () => {
  it("sends named efforts and maps off or boolean onto the backend enum", () => {
    expect(thinkingForApi("max")).toBe("max")
    expect(thinkingForApi("high")).toBe("high")
    expect(thinkingForApi(true)).toBe("high")
    expect(thinkingForApi("off")).toBe("off")
    expect(thinkingForApi(false)).toBeNull()
    expect(thinkingForApi(null)).toBeNull()
  })
})

describe("effortToThinking", () => {
  it("maps none to false and keeps provider effort ids", () => {
    expect(effortToThinking("none")).toBe(false)
    expect(effortToThinking("off")).toBe("off")
    expect(effortToThinking("minimal")).toBe("minimal")
    expect(effortToThinking("xhigh")).toBe("xhigh")
    expect(effortToThinking("max")).toBe("max")
  })
})

describe("buildEffortOptions", () => {
  it("returns undefined when thinking is unsupported", () => {
    expect(buildEffortOptions(null, (key) => translate("zh-CN", key))).toBeUndefined()
    expect(
      buildEffortOptions(
        { ...gpt52, supported: false, efforts: [] },
        (key) => translate("zh-CN", key)
      )
    ).toBeUndefined()
  })

  it("translates effort labels", () => {
    expect(buildEffortOptions(o3, (key) => translate("zh-CN", key))).toEqual([
      { id: "low", name: "低" },
      { id: "medium", name: "中" },
      { id: "high", name: "高" },
    ])
    expect(
      buildEffortOptions(
        {
          supported: true,
          efforts: ["none", "low", "high", "xhigh", "max"],
          default: "high",
          mandatory: false,
        },
        (key) => translate("zh-CN", key)
      )
    ).toEqual([
      { id: "none", name: "默认" },
      { id: "low", name: "低" },
      { id: "high", name: "高" },
      { id: "xhigh", name: "最高" },
      { id: "max", name: "最强" },
    ])
  })
})

describe("resolveThinkingForModel", () => {
  it("clears thinking when the model does not support it", () => {
    expect(resolveThinkingForModel(undefined, "high")).toBe(false)
  })

  it("keeps the current effort when it is still valid", () => {
    expect(resolveThinkingForModel(gpt52, "xhigh")).toBe("xhigh")
    expect(resolveThinkingForModel(gpt52, false)).toBe(false)
  })

  it("keeps explicit off separate from the model default", () => {
    const configured: ModelThinking = {
      supported: true,
      efforts: ["none", "low", "off"],
      default: "low",
      mandatory: false,
    }
    expect(buildEffortOptions(configured, (key) => translate("zh-CN", key))).toEqual([
      { id: "none", name: "默认" },
      { id: "low", name: "低" },
      { id: "off", name: "关闭" },
    ])
    expect(resolveThinkingForModel(configured, false)).toBe(false)
    expect(resolveThinkingForModel(configured, "off")).toBe("off")
    expect(
      resolveThinkingForModel(
        { ...configured, efforts: ["none", "low"] },
        "off"
      )
    ).toBe("low")
  })

  it("falls back to the model default when the current effort is invalid", () => {
    expect(resolveThinkingForModel(o3, false)).toBe("medium")
    expect(resolveThinkingForModel(gpt52, "minimal")).toBe(false)
  })
})
