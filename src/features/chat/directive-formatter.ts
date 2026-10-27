export type DirectiveSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; type: string; id: string; label: string }

export type DirectiveInput = {
  type: string
  id: string
  label: string
}

const DIRECTIVE = /:([\w-]+)\[([^\]]*)\]\{([^}\n]*)\}/g

function attributes(value: string) {
  const result: Record<string, string> = {}
  for (const match of value.matchAll(
    /([\w-]+)=(?:"([^"\n]*)"|'([^'\n]*)'|([^\s}]+))/g
  )) {
    result[match[1]!] = match[2] ?? match[3] ?? match[4] ?? ""
  }
  return result
}

export function parseDirectiveText(text: string): DirectiveSegment[] {
  const segments: DirectiveSegment[] = []
  let end = 0
  for (const match of text.matchAll(DIRECTIVE)) {
    const index = match.index ?? 0
    if (index > end) segments.push({ kind: "text", text: text.slice(end, index) })
    const attrs = attributes(match[3] ?? "")
    segments.push({
      kind: "mention",
      type: match[1]!,
      label: match[2] ?? "",
      id: attrs.name ?? attrs.id ?? attrs.value ?? "",
    })
    end = index + match[0].length
  }
  if (end < text.length) segments.push({ kind: "text", text: text.slice(end) })
  if (!segments.length) segments.push({ kind: "text", text })
  return segments
}

export function serializeDirective(input: DirectiveInput): string {
  return input.label === input.id
    ? `:${input.type}[${input.label}]`
    : `:${input.type}[${input.label}]{name=${input.id}}`
}
