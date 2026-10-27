import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type LocalSkillHit = {
  path: string
  name: string
  description: string
  version: string
  source: string
}

export type LocalSkillFile = {
  relativePath: string
  contentBase64: string
}

const SKILL_MARKDOWN = "skill.md"
const MAX_FILE_BYTES = 1 * 1024 * 1024

export function defaultSkillRoots(home = os.homedir()): string[] {
  return [
    path.join(home, ".agents", "skills"),
    path.join(home, ".claude", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".cursor", "skills"),
    path.join(home, ".grok", "skills"),
    path.join(home, ".config", "opencode", "skills"),
  ]
}

export function parseSkillFrontmatter(text: string): {
  name?: string
  description?: string
  version?: string
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  if ((lines[0] ?? "").trim() !== "---") {
    return {}
  }
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  )
  if (closing < 0) {
    return {}
  }
  const parsed: { name?: string; description?: string; version?: string } = {}
  for (const line of lines.slice(1, closing)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }
    const sep = trimmed.indexOf(":")
    if (sep < 0) {
      continue
    }
    const key = trimmed.slice(0, sep).trim()
    const raw = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "")
    if (key === "name" && raw) {
      parsed.name = raw
    }
    if (key === "description" && raw) {
      parsed.description = raw
    }
    if (key === "version" && raw) {
      parsed.version = raw
    }
    if (key === "metadata") {
      continue
    }
  }
  const metadataBlock = lines.slice(1, closing).join("\n")
  const versionMatch = metadataBlock.match(
    /(?:^|\n)\s*version:\s*['"]?([^\n'"]+)/
  )
  if (!parsed.version && versionMatch?.[1]) {
    parsed.version = versionMatch[1].trim()
  }
  return parsed
}

export function filterLocalSkills(
  hits: LocalSkillHit[],
  query: string
): LocalSkillHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return hits
  }
  return hits.filter((hit) => {
    const blob = `${hit.name} ${hit.description} ${hit.source}`.toLowerCase()
    return blob.includes(needle)
  })
}

export function scanSkillRoots(roots: string[]): LocalSkillHit[] {
  const hits: LocalSkillHit[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const skillDir = path.join(root, entry.name)
      const markdownPath = findSkillMarkdown(skillDir)
      if (!markdownPath) {
        continue
      }
      let text: string
      try {
        text = fs.readFileSync(markdownPath, "utf8")
      } catch {
        continue
      }
      const meta = parseSkillFrontmatter(text)
      const name = meta.name?.trim() || entry.name
      if (seen.has(skillDir)) {
        continue
      }
      seen.add(skillDir)
      hits.push({
        path: skillDir,
        name,
        description: meta.description?.trim() || "",
        version: meta.version?.trim() || "0.1.0",
        source: root,
      })
    }
  }
  return hits.sort((left, right) => left.name.localeCompare(right.name, "zh"))
}

export function readSkillFiles(skillDir: string): {
  name: string
  files: LocalSkillFile[]
} {
  const markdownPath = findSkillMarkdown(skillDir)
  if (!markdownPath) {
    throw new Error("未找到 SKILL.md")
  }
  const folderName = path.basename(skillDir)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const meta = parseSkillFrontmatter(markdown)
  const name = meta.name?.trim() || folderName
  const files: LocalSkillFile[] = []
  collectFiles(skillDir, "", files)
  if (files.length === 0) {
    files.push({
      relativePath: "SKILL.md",
      contentBase64: Buffer.from(markdown, "utf8").toString("base64"),
    })
  }
  return { name, files }
}

function findSkillMarkdown(skillDir: string): string | null {
  for (const name of ["SKILL.md", "skill.md"]) {
    const candidate = path.join(skillDir, name)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

function collectFiles(
  dir: string,
  relative: string,
  files: LocalSkillFile[]
): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue
    }
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(full, nextRelative, files)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    if (stat.size > MAX_FILE_BYTES) {
      continue
    }
    const bytes = fs.readFileSync(full)
    files.push({
      relativePath:
        nextRelative.toLowerCase() === SKILL_MARKDOWN ? "SKILL.md" : nextRelative,
      contentBase64: bytes.toString("base64"),
    })
  }
}
