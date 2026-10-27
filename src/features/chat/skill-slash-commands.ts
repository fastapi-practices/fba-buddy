import type { MentionItem } from "@/features/chat/slash-commands"

import type { WorkspaceSkillItem } from "@/lib/types"

export function skillsToSkillMentions(
  skills: readonly WorkspaceSkillItem[]
): MentionItem[] {
  return skills.map((skill) => ({
    id: String(skill.id),
    type: "skill",
    label: skill.name,
    description: skill.description ?? undefined,
    icon: "skill",
  }))
}
