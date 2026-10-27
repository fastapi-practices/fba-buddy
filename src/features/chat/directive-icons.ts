import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CalendarClockIcon,
  FileTextIcon,
  LayersIcon,
  PlugIcon,
  QuoteIcon,
  SlashIcon,
  SparklesIcon,
  TagIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

/* 指令类型与工作区、附件入口共用同一套图标，引用标记才能一眼看出指向什么 */
export const DIRECTIVE_ICONS: Record<string, LucideIcon> = {
  skill: SparklesIcon,
  knowledge: BookOpenIcon,
  artifact: LayersIcon,
  memory: BrainIcon,
  mcp: PlugIcon,
  acp: TerminalIcon,
  cron: CalendarClockIcon,
  phrase: QuoteIcon,
  assistant: BotIcon,
  file: FileTextIcon,
  tool: WrenchIcon,
  command: SlashIcon,
  slash: SlashIcon,
}

/* 未知类型用中性标记，不再借用技能图标 */
export const DIRECTIVE_FALLBACK_ICON: LucideIcon = TagIcon

export function directiveIcon(type: string): LucideIcon {
  return DIRECTIVE_ICONS[type] ?? DIRECTIVE_FALLBACK_ICON
}
