export const SYSTEM_OWNER_USER_ID = 0

export function isBuiltinOwner(userId: number | null | undefined): boolean {
  return userId == null || userId === SYSTEM_OWNER_USER_ID
}

export function canEditOwnedResource(
  userId: number | null | undefined
): boolean {
  return !isBuiltinOwner(userId)
}
