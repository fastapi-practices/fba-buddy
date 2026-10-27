import { parseDirectiveText } from "@/features/chat/directive-formatter"
import { parseFileReference } from "@/shared/file-reference"

type Node = {
  type: string
  value?: string
  url?: string
  meta?: string
  children?: Node[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
  lang?: string
  position?: { start: { line?: number } }
}

const plainText = (node: Node): string =>
  node.value ?? node.children?.map(plainText).join("") ?? ""

const htmlTags = new Set(
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(
    " "
  )
)

export function remarkPreserveLineBreaks() {
  return (tree: Node) => {
    const visit = (node: Node) => {
      if (!node.children || ["code", "inlineCode", "html"].includes(node.type))
        return
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          visit(child)
          return [child]
        }
        return (child.value ?? "")
          .split(/\r?\n/)
          .flatMap((value, index): Node[] =>
            index
              ? [{ type: "break" }, { type: "text", value }]
              : [{ type: "text", value }]
          )
      })
    }
    visit(tree)
  }
}

export function remarkTranscript() {
  return (tree: Node) => {
    const ids = new Map<string, number>()
    const visit = (node: Node) => {
      if (
        node.type === "paragraph" &&
        node.children?.length === 1 &&
        node.children[0]?.type === "text"
      ) {
        const match = /^::(?:codex-)?artifact-template\{([^\n]+)\}\s*$/.exec(
          node.children[0].value ?? ""
        )
        if (match) {
          const attrs = directiveAttributes(match[1]!)
          if (attrs.display_name && attrs.skill_name && attrs.artifact_kind) {
            node.data = {
              hName: "div",
              hProperties: { dataArtifactTemplate: JSON.stringify(attrs) },
            }
            node.children = []
            return
          }
        }
      }
      if (
        (node.type === "link" || node.type === "image") &&
        node.url &&
        parseFileReference(node.url)
      ) {
        const reference = parseFileReference(node.url)!
        const path = /^[A-Za-z]:[\\/]/.test(reference.path)
          ? `file:///${reference.path.replace(/\\/g, "/")}`
          : reference.path.startsWith("\\\\") ||
              (/^file:/i.test(node.url) && reference.path.startsWith("//"))
            ? `file:${reference.path.replace(/\\/g, "/")}`
            : reference.path
        node.url =
          path +
          (reference.line
            ? `#L${reference.line}${reference.column ? `C${reference.column}` : ""}`
            : "")
      }
      if (
        node.type === "link" &&
        node.url &&
        /^(?:file:\/\/)?(?:\/|\.\.?\/)?[\p{L}\p{N}_@()./-]+\.[a-zA-Z][a-zA-Z0-9]{0,11}:\d+(?::\d+|(?:-L?\d+))?$/u.test(
          node.url
        )
      ) {
        node.url = node.url.replace(/:(\d+)(?::\d+|(?:-L?\d+))?$/, "#L$1")
      }
      if (node.type === "heading") {
        const slug =
          plainText(node)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s+/g, "-") || "heading"
        const count = ids.get(slug) ?? 0
        ids.set(slug, count + 1)
        node.data = {
          hProperties: { id: `${slug}${count ? `-${count}` : ""}` },
        }
      }
      if (node.type === "code" && node.meta) {
        const title =
          /(?:title|filename)=["']([^"']+)["']|(?:title|filename)=([^\s]+)|^([^\s=]+)$/.exec(
            node.meta
          )
        if (title)
          node.data = {
            hProperties: { dataFenceTitle: title[1] ?? title[2] ?? title[3] },
          }
      }
      if (node.type === "blockquote") {
        const first = node.children?.[0]?.children?.[0]
        const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(
          first?.value ?? ""
        )
        if (match && first) {
          node.data = { hProperties: { dataAlert: match[1] } }
          first.value = first.value!.slice(match[0].length)
        }
      }
      if (!node.children || ["code", "inlineCode", "link"].includes(node.type))
        return
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          visit(child)
          return [child]
        }
        return splitFileCitations(child.value ?? "").flatMap((segment) =>
          segment.type !== "text"
            ? [segment]
            : parseDirectiveText(segment.value ?? "")
                .map((segment): Node =>
                  segment.kind === "text"
                    ? { type: "text", value: segment.text }
                    : {
                        type: "link",
                        url: `#aui-directive/${encodeURIComponent(segment.type)}/${encodeURIComponent(segment.id)}/${encodeURIComponent(segment.label)}`,
                        children: [{ type: "text", value: segment.label }],
                      }
                )
        )
      })
    }
    visit(tree)
  }
}

function directiveAttributes(value: string) {
  const result: Record<string, string> = {}
  for (const match of value.matchAll(
    /([\w-]+)=(?:"([^"\n]*)"|'([^'\n]*)'|([^\s}]+))/g
  ))
    result[match[1]!] = match[2] ?? match[3] ?? match[4] ?? ""
  return result
}

function splitFileCitations(value: string): Node[] {
  const nodes: Node[] = []
  let end = 0
  for (const match of value.matchAll(/:codex-file-citation\{([^}\n]+)\}/g)) {
    const attrs = directiveAttributes(match[1]!)
    const reference = parseFileReference(attrs.path)
    if (!reference) continue
    nodes.push({ type: "text", value: value.slice(end, match.index) })
    const line = Number(attrs.line_range_start)
    nodes.push({
      type: "link",
      url:
        reference.path +
        (Number.isSafeInteger(line) && line > 0 ? `#L${line}` : ""),
      children: [
        {
          type: "text",
          value: reference.path.split(/[\\/]/).at(-1) ?? reference.path,
        },
      ],
    })
    end = match.index + match[0].length
  }
  nodes.push({ type: "text", value: value.slice(end) })
  return nodes
}

export function remarkMarkdownCompatibility(this: {
  parse: (text: string) => Node
}) {
  const parse = this.parse.bind(this)
  return (tree: Node) => {
    const rawHtml: Node[] = []
    const collect = (node: Node) => {
      if (node.type === "html") rawHtml.push(node)
      node.children?.forEach(collect)
    }
    collect(tree)
    for (const node of rawHtml)
      node.value = node.value?.replace(
        /<\/?([A-Z][A-Za-z\d_]*)\s*\/?\s*>/g,
        (token: string, tag: string) =>
          htmlTags.has(tag.toLowerCase())
            ? token
            : token.replace(/</g, "&lt;").replace(/>/g, "&gt;")
      )
    const escaped = new Map<Node, { start: number; end: number }[]>()
    let pending: { node: Node; start: number; end: number } | undefined
    const preserve = (anchor: NonNullable<typeof pending>) => {
      const items = escaped.get(anchor.node) ?? []
      items.push(anchor)
      escaped.set(anchor.node, items)
    }
    for (const node of rawHtml) {
      for (const match of (node.value ?? "").matchAll(
        /<\/?a(?:\s[^<>]*|\/?)>/gi
      )) {
        const token = match[0]
        if (/^<\/a\s*>$/i.test(token)) {
          pending = undefined
          continue
        }
        if (pending) preserve(pending)
        pending = undefined
        if (/^<a\s*\/?\s*>$/i.test(token)) {
          const anchor = {
            node,
            start: match.index,
            end: match.index + token.length,
          }
          if (/\/\s*>$/.test(token)) preserve(anchor)
          else pending = anchor
        }
      }
    }
    if (pending) preserve(pending)
    for (const [node, spans] of escaped) {
      let value = node.value ?? ""
      for (const span of spans.reverse())
        value =
          value.slice(0, span.start) +
          value
            .slice(span.start, span.end)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;") +
          value.slice(span.end)
      node.value = value
    }
    const visit = (node: Node) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (
          node.type === "listItem" &&
          child.type === "code" &&
          !child.lang &&
          /^\s/.test(child.value ?? "") &&
          child.position?.start.line === node.position?.start.line
        ) {
          const recovered = parse(child.value!.trim()).children ?? [child]
          const escapeHtml = (part: Node) => {
            if (part.type === "html") part.type = "text"
            part.children?.forEach(escapeHtml)
          }
          recovered.forEach((part) => {
            escapeHtml(part)
            visit(part)
          })
          return recovered
        }
        visit(child)
        return [child]
      })
    }
    visit(tree)
  }
}

export function rehypeTranscriptMedia() {
  type Element = {
    type: string
    tagName?: string
    value?: string
    properties?: Record<string, unknown>
    children?: Element[]
  }
  return (tree: Element) => {
    const onlyImage = (node: Element): Element | undefined => {
      const children = node.children?.filter(
        (child) => child.type !== "text" || child.value?.trim()
      )
      const child = children?.length === 1 ? children[0] : undefined
      return child?.tagName === "img"
        ? child
        : child?.tagName === "a"
          ? onlyImage(child)
          : undefined
    }
    const visit = (node: Element) => {
      if (
        node.type === "root" ||
        ["p", "div", "li", "td", "th", "blockquote"].includes(
          node.tagName ?? ""
        )
      ) {
        const image = onlyImage(node)
        if (image)
          image.properties = { ...image.properties, dataStandalone: true }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

export function selectedMarkdown(fragment: DocumentFragment): string {
  const render = (dom: globalThis.Node): string => {
    if (dom.nodeType === 3) return dom.textContent ?? ""
    const element = dom as HTMLElement
    if (element.dataset?.quoteMarkdown) return element.dataset.quoteMarkdown
    if (element.matches?.("button, [data-find-ignore]")) return ""
    if (element.dataset?.directiveType)
      return `:${element.dataset.directiveType}[${element.textContent ?? ""}]{name=${element.dataset.directiveId}}`
    const children = Array.from(dom.childNodes)
      .map((child) => render(child))
      .join("")
    const tag = element.tagName?.toLowerCase()
    switch (tag) {
      case "strong":
      case "b":
        return `**${children}**`
      case "em":
      case "i":
        return `*${children}*`
      case "del":
        return `~~${children}~~`
      case "a":
        return `[${children}](${element.getAttribute("href") ?? ""})`
      case "img":
        return `![${element.getAttribute("alt") ?? ""}](${element.getAttribute("src") ?? ""})`
      case "pre": {
        const code = element.querySelector("code")
        const value = element.textContent ?? ""
        const fence = "`".repeat(
          Math.max(
            3,
            ...(value.match(/`+/g) ?? []).map((run) => run.length + 1)
          )
        )
        const language = code?.className.match(/language-(\S+)/)?.[1] ?? ""
        return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`
      }
      case "code": {
        const fence = "`".repeat(
          Math.max(
            1,
            ...(children.match(/`+/g) ?? []).map((run) => run.length + 1)
          )
        )
        return `${fence}${children}${fence}`
      }
      case "br":
        return "\n"
      case "li": {
        const parent = element.parentElement
        const marker =
          parent?.tagName === "OL"
            ? `${Number(parent.getAttribute("start") ?? 1) + Array.from(parent.children).indexOf(element)}.`
            : "-"
        const checkbox = element.querySelector<HTMLInputElement>(
          'input[type="checkbox"]'
        )
        return `${marker} ${checkbox ? `[${checkbox.checked ? "x" : " "}] ` : ""}${children.trim().replace(/\n/g, "\n  ")}\n`
      }
      case "table": {
        const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
          Array.from(row.children).map((cell) =>
            render(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>")
          )
        )
        if (!rows.length) return ""
        const header = rows.shift()!
        return `\n\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`
      }
      case "blockquote":
        return `\n${children
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n`
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return `\n\n${"#".repeat(Number(tag[1]))} ${children}\n\n`
      case "p":
      case "div":
      case "ul":
      case "ol":
        return `${children}\n\n`
      default:
        return children
    }
  }
  return render(fragment)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
