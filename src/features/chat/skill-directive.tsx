import { MarkdownText } from "@/components/ai-elements/markdown-text"

export const SkillDirectiveText = ({ text }: { text?: string }) => (
  <MarkdownText text={text ?? ""} preserveLineBreaks />
)
