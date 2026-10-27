import ts from "typescript"
import { afterEach, describe, expect, expectTypeOf, it } from "vitest"

import {
  EN,
  ZH,
  i18nSearchBlob,
  isTranslationKey,
  translate,
  translateCurrent,
  type TranslationKey,
  type Translator,
} from "@/lib/i18n"
import { getLocale, setRuntime } from "@/lib/runtime"

const originalLocale = getLocale()
afterEach(() => setRuntime({ locale: originalLocale }))

const placeholders = (text: string) =>
  [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort()

describe("i18n", () => {
  it("has identical semantic keys and placeholders in both locale files", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ZH).sort())
    for (const key of Object.keys(ZH) as TranslationKey[]) {
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/)
      expect(EN[key].trim(), key).not.toBe("")
      expect(ZH[key].trim(), key).not.toBe("")
      expect(placeholders(EN[key]), key).toEqual(placeholders(ZH[key]))
    }
    expectTypeOf<Translator>().parameter(0).toEqualTypeOf<TranslationKey>()
    expectTypeOf<"语言">().not.toExtend<TranslationKey>()
    expectTypeOf<string>().not.toExtend<TranslationKey>()
  })

  it("reads Chinese and English values using the same keys", () => {
    expect(translate("zh-CN", "common.language")).toBe("语言")
    expect(translate("en-US", "common.language")).toBe("Language")
    expect(translate("en-US", "common.opening")).toBe("Opening")
    expect(translate("en-US", "common.removeAssistant")).toBe(
      "Remove assistant"
    )
    expect(translate("en-US", "common.useArtifact")).toBe("Use artifact")
    expect(translate("zh-CN", "common.calledName", { name: "search" })).toBe(
      "调用 search"
    )
    expect(translate("en-US", "common.calledName", { name: "search" })).toBe(
      "Called search"
    )
    expect(translate("zh-CN", "common.nSteps", { n: 0 })).toBe("0 步操作")
    expect(translate("en-US", "common.nSteps", { n: 3 })).toBe("3 steps")
  })

  it("does not recursively interpolate values or consume missing placeholders", () => {
    expect(translate("en-US", "common.calledName")).toBe("Called {name}")
    expect(translate("en-US", "common.calledName", { name: "{n}", n: 5 })).toBe(
      "Called {n}"
    )
    expect(translate("en-US", "common.calledName", { name: "$&" })).toBe(
      "Called $&"
    )
    expect(translate("en-US", "common.calledName", { name: "" })).toBe(
      "Called "
    )
  })

  it("indexes both locale values but not the key names", () => {
    const blob = i18nSearchBlob(
      "common.appearance",
      undefined,
      "common.modeThemeColorsFontsFontSizesAndContrast"
    )
    expect(blob).toContain("theme")
    expect(blob).toContain("外观")
    expect(blob).not.toContain("common.")
    expect(i18nSearchBlob()).toBe("")
  })

  it("uses the current locale for non-React errors and notifications", () => {
    setRuntime({ locale: "en-US" })
    expect(translateCurrent("common.requestFailed")).toBe("Request failed")
    setRuntime({ locale: "zh-CN" })
    expect(translateCurrent("common.requestFailed")).toBe("请求失败")
  })

  it("recognizes only catalog keys at dynamic input boundaries", () => {
    expect(isTranslationKey("common.language")).toBe(true)
    for (const input of [
      "语言",
      "custom conversation",
      "common.unknown",
      "toString",
      "__proto__",
      null,
    ]) {
      expect(isTranslationKey(input)).toBe(false)
    }
  })

  it("keeps all literal translation callsites on catalog keys", () => {
    const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".")
    const invalid: string[] = []
    for (const file of parsed.fileNames.filter(
      (file) => !file.includes(".test.")
    )) {
      const source = ts.createSourceFile(
        file,
        ts.sys.readFile(file)!,
        ts.ScriptTarget.Latest,
        true
      )
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const name = node.expression.text
          const arg = node.arguments[name === "translate" ? 1 : 0]
          if (
            ["t", "translate", "translateCurrent"].includes(name) &&
            arg &&
            ts.isStringLiteral(arg) &&
            !isTranslationKey(arg.text)
          ) {
            invalid.push(`${file}: ${arg.text}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(invalid).toEqual([])
  })
})
