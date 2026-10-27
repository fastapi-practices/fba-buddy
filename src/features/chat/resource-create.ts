import { listSkills } from "@/api"
import { startDraftChat } from "@/app/navigation"
import { useComposerStore } from "@/features/chat/composer-store"
import { skillDirectiveText } from "@/features/chat/workspace-ref"
import { translateCurrent, type TranslationKey } from "@/lib/i18n"
import { isBuiltinOwner } from "@/lib/ownership"
import { notifyError } from "@/lib/notify"
import type { WorkspaceSkillItem } from "@/lib/types"

export type ResourceCreateKind = "cron" | "assistant" | "expert" | "skill"

const RESOURCE_CREATE_SKILLS = {
  cron: "create-cron",
  assistant: "create-assistant",
  expert: "create-expert",
  skill: "create-skill",
} as const satisfies Record<ResourceCreateKind, string>

const RESOURCE_CREATE_PROMPTS = {
  cron: "resourceCreate.cronPrompt",
  assistant: "resourceCreate.assistantPrompt",
  expert: "resourceCreate.expertPrompt",
  skill: "resourceCreate.skillPrompt",
} as const satisfies Record<ResourceCreateKind, TranslationKey>

export function findBuiltinResourceSkill(
  skills: readonly WorkspaceSkillItem[],
  kind: ResourceCreateKind
): WorkspaceSkillItem | null {
  const name = RESOURCE_CREATE_SKILLS[kind]
  return (
    skills.find((skill) => isBuiltinOwner(skill.user_id) && skill.name === name) ??
    null
  )
}

export function resourceCreateDraft(
  skill: Pick<WorkspaceSkillItem, "id" | "name">,
  prompt: string
): string {
  return `${skillDirectiveText(skill.id, skill.name)} ${prompt.trim()}`
}

export async function startResourceCreateChat(
  kind: ResourceCreateKind
): Promise<boolean> {
  const skills = await listSkills()
  const skill = findBuiltinResourceSkill(skills, kind)
  if (!skill) {
    notifyError(translateCurrent("hints.builtinResourceSkillNotReady"))
    return false
  }
  startDraftChat()
  const composer = useComposerStore.getState()
  const prompt = translateCurrent(RESOURCE_CREATE_PROMPTS[kind])
  composer.setDraft(resourceCreateDraft(skill, prompt))
  composer.setWorkspaceRef({ kind: "skill", id: skill.id })
  return true
}
