import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import { describe, expect, it } from "vitest"
import {
  remarkPlugins,
  userRemarkPlugins,
  rehypePlugins,
  markdownUrl,
} from "./markdown-plugins"
import { toolOutputImages } from "./tool-output"
import { serializeInlineQuote } from "@/shared/inline-quotes"

const render = (text: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins, rehypePlugins, urlTransform: markdownUrl },
      text
    )
  )

describe("transcript Markdown", () => {
  it("retains Windows, UNC, extensionless file links and generated citations", () => {
    expect(render("[source](<C:/Work Space/Makefile:12:4>)")).toContain(
      'href="file:///C:/Work%20Space/Makefile#L12C4"'
    )
    expect(render("[source](<file://server/share/a b.ts:3>)")).toContain(
      'href="file://server/share/a%20b.ts#L3"'
    )
    expect(
      render(':codex-file-citation{path="src/main.ts" line_range_start=9}')
    ).toContain('href="src/main.ts#L9"')
    expect(render("[Makefile](Makefile:7)")).toContain('href="Makefile#L7"')
  })
  it("preserves inline quotes, conversation chips and templates through sanitization", () => {
    expect(
      render(serializeInlineQuote({ messageId: "a1", text: "quoted phrase" }))
    ).toContain("fba-citation://v1/")
    expect(render("[Earlier](fba-thread://abc-123)")).toContain(
      'href="fba-thread://abc-123"'
    )
    expect(
      render(
        '::artifact-template{artifact_kind="spreadsheet" display_name="Budget" skill_name="budget-template"}'
      )
    ).toContain("data-artifact-template=")
  })
  it("distinguishes standalone media from inline badges", () => {
    expect(render("![chart](./chart.png)")).toContain('data-standalone="true"')
    expect(
      render("Build ![status](https://example.com/badge.svg) passed")
    ).not.toContain('data-standalone="true"')
  })
  it("keeps bare uppercase anchor placeholders visible", () => {
    expect(render("Use <A> as the placeholder")).toContain("&lt;A&gt;")
    expect(render('<a href="https://example.com">Actual link</a>')).toContain(
      'href="https://example.com"'
    )
  })
  it("preserves generic type placeholders including paired uppercase tags", () => {
    const html = render(
      "泛型 <A> 与 <T>、<TData>、<T>item</T>\n\n<DIV>valid HTML</DIV>"
    )
    expect(html).toContain("&lt;A&gt;")
    expect(html).toContain("&lt;T&gt;item&lt;/T&gt;")
    expect(html).toContain("&lt;TData&gt;")
    expect(html).toContain("<div>valid HTML</div>")
  })
  it.each(["<A>", "<a>", "<a >", "<a/>", "<A/>", "<a />"])(
    "keeps unmatched %s literal even before a real link",
    (token) => {
      const html = render(
        `Use ${token} as a label\n\nSee <a href="https://example.com">the link</a>`
      )
      expect(html).toContain(token.replace("<", "&lt;").replace(">", "&gt;"))
      expect(html).toContain('href="https://example.com"')
    }
  )
  it("recovers excess same-line list indentation while preserving intentional code", () => {
    const recovered = render(
      "-       **strong** <redacted>\n\n        -       nested"
    )
    expect(recovered).toContain("<strong>strong</strong>")
    expect(recovered).toContain("&lt;redacted&gt;")
    expect(recovered).toContain("<li>nested</li>")
    expect(recovered).not.toContain("<pre>")
    expect(render("-     const value = 1;")).toContain("<pre>")
    expect(render("-\n      const value = 1;")).toContain("<pre>")
  })
  it("preserves user line breaks without changing standard assistant Markdown or fenced code", () => {
    const source = "first\nsecond\n\n```ts\nconst A = 1\nconst B = 2\n```"
    const user = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { remarkPlugins: userRemarkPlugins, rehypePlugins },
        source
      )
    )
    expect(user).toContain("first<br/>\nsecond")
    expect(render(source)).toContain("first\nsecond")
    expect(user).toContain("const A = 1\nconst B = 2")
  })
  it("retains embedded image data while rejecting other data URLs", () => {
    const source = "data:image/png;base64,iVBORw0KGgo="
    expect(render(`![sample](${source})`)).toContain(`src="${source}"`)
    expect(markdownUrl("data:text/html;base64,PHNjcmlwdD4=", "src")).toBe("")
    expect(markdownUrl(source, "href")).toBe("")
    expect(markdownUrl("javascript:alert(1)", "src")).toBe("")
  })
  it("retains workspace file line anchors while rejecting executable protocols", () => {
    expect(render("[source](README.md:12)")).toContain('href="README.md#L12"')
    expect(render("[source](file:///demo/配置.ts:7)")).toContain("#L7")
    expect(markdownUrl("file:///demo/配置.ts:7", "href")).toBe(
      "file:///demo/配置.ts:7"
    )
    expect(markdownUrl("javascript:run.ts:7", "href")).toBe("")
  })
  it("keeps skill labels alongside Markdown but leaves fenced code literal", () => {
    const html = render(
      ":skill[摘要]{name=17} **bold**\n\n```text\n:skill[摘要]{name=17}\n```"
    )
    expect(html).toContain('href="#aui-directive/skill/17/')
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain(":skill[摘要]{name=17}")
  })
  it("retains safe disclosures and removes executable HTML", () => {
    const html = render(
      '<details open><summary>More</summary><p>Visible</p></details>\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="x"></iframe>'
    )
    expect(html).toContain('<details open="">')
    expect(html).toContain("<summary>More</summary>")
    expect(html).not.toMatch(/<script|onerror|<iframe/)
  })
  it("preserves alerts, unique heading ids, code titles and mathematical rendering", () => {
    const html = render(
      '# Same\n\n# Same\n\n> [!WARNING]\n> Careful\n\n```ts title="example.ts"\nconst a = 1\n```\n\n$x^2$'
    )
    expect(html).toContain('id="same"')
    expect(html).toContain('id="same-1"')
    expect(html).toContain('data-alert="WARNING"')
    expect(html).toContain('data-fence-title="example.ts"')
    expect(html).toContain("katex")
  })
})

describe("explicit tool media", () => {
  it("extracts images from MCP content and ignores arbitrary URLs and unsupported sources", () => {
    expect(
      toolOutputImages(
        JSON.stringify({
          content: [
            { type: "image", mimeType: "image/png", data: "YWJj" },
            { type: "text", text: "https://example.com" },
            { type: "image", image: "javascript:alert(1)" },
          ],
        })
      )
    ).toEqual([{ src: "data:image/png;base64,YWJj", alt: "" }])
    expect(toolOutputImages("plain output")).toEqual([])
  })
})
