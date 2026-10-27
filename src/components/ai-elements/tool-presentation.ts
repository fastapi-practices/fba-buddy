import type { TranslationKey } from "@/lib/i18n"
import {
  BrainIcon,
  DownloadIcon,
  FilePenLineIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  ListIcon,
  SearchIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from "lucide-react"

export const TOOL_STEP_META: Record<
  string,
  { verb: TranslationKey; activeVerb: TranslationKey; icon: LucideIcon }
> = {
  ask_user: {
    verb: "common.asked",
    activeVerb: "common.waitingForAnswer",
    icon: ListIcon,
  },
  read: {
    verb: "common.read",
    activeVerb: "common.reading",
    icon: FileTextIcon,
  },
  read_file: {
    verb: "common.read",
    activeVerb: "common.reading",
    icon: FileTextIcon,
  },
  write: {
    verb: "common.wrote",
    activeVerb: "common.writing",
    icon: FilePlusIcon,
  },
  write_file: {
    verb: "common.wrote",
    activeVerb: "common.writing",
    icon: FilePlusIcon,
  },
  write_artifact: {
    verb: "common.wroteArtifact",
    activeVerb: "common.writing",
    icon: FilePlusIcon,
  },
  deliver_file: {
    verb: "common.deliveredArtifact",
    activeVerb: "common.deliveringArtifact",
    icon: DownloadIcon,
  },
  edit: {
    verb: "common.edited",
    activeVerb: "common.editing",
    icon: FilePenLineIcon,
  },
  edit_file: {
    verb: "common.edited",
    activeVerb: "common.editing",
    icon: FilePenLineIcon,
  },
  bash: {
    verb: "common.ran",
    activeVerb: "common.running",
    icon: SquareTerminalIcon,
  },
  run_command: {
    verb: "common.ran",
    activeVerb: "common.running",
    icon: SquareTerminalIcon,
  },
  run_tests: {
    verb: "common.testCommandRan",
    activeVerb: "common.testCommandRunning",
    icon: SquareTerminalIcon,
  },
  ls: { verb: "common.listed", activeVerb: "common.reading", icon: ListIcon },
  glob: {
    verb: "common.matched",
    activeVerb: "common.searching",
    icon: SearchIcon,
  },
  grep: {
    verb: "common.searched",
    activeVerb: "common.searching",
    icon: SearchIcon,
  },
  write_memory: {
    verb: "common.wroteMemory",
    activeVerb: "common.working",
    icon: BrainIcon,
  },
  edit_memory: {
    verb: "common.updatedMemory",
    activeVerb: "common.working",
    icon: BrainIcon,
  },
  delete_memory: {
    verb: "common.deletedMemory",
    activeVerb: "common.working",
    icon: BrainIcon,
  },
  web_search: {
    verb: "common.searchedTheWeb",
    activeVerb: "common.searching",
    icon: GlobeIcon,
  },
}

export function toolTarget(args: unknown, fallback: string): string {
  if (args && typeof args === "object") {
    const record = args as Record<string, unknown>
    for (const key of [
      "path",
      "command",
      "query",
      "q",
      "file",
      "files",
      "paths",
      "target",
      "title",
      "url",
    ]) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) {
        return value
      }
      if (Array.isArray(value)) {
        const items = value.flatMap((item) =>
          typeof item === "string" && item.trim() ? [item.trim()] : []
        )
        if (items.length) return items.join(", ")
      }
    }
  }
  return fallback
}
