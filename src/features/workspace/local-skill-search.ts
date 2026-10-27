import type {
  DesktopLocalSkillHit,
  DesktopLocalSkillPayload,
} from "@/shared/desktop"

export function filterLocalSkills(
  hits: DesktopLocalSkillHit[],
  query: string
): DesktopLocalSkillHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return hits
  }
  return hits.filter((hit) => {
    const blob = `${hit.name} ${hit.description} ${hit.source}`.toLowerCase()
    return blob.includes(needle)
  })
}

export function filesFromLocalSkill(
  payload: DesktopLocalSkillPayload
): File[] {
  return payload.files.map((file) => {
    const binary = Uint8Array.from(atob(file.contentBase64), (char) =>
      char.charCodeAt(0)
    )
    return new File([binary], `${payload.name}/${file.relativePath}`)
  })
}
