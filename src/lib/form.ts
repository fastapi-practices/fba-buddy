export function zodFieldErrors<T extends string>(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
}): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === "string" && !(field in errors)) {
      errors[field as T] = issue.message
    }
  }
  return errors
}
