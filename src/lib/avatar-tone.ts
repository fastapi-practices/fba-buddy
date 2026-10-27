const AVATAR_TONES = [
  "bg-sky-500/20 text-sky-800 dark:text-sky-200",
  "bg-violet-500/20 text-violet-800 dark:text-violet-200",
  "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  "bg-rose-500/20 text-rose-800 dark:text-rose-200",
  "bg-cyan-500/20 text-cyan-800 dark:text-cyan-200",
  "bg-fuchsia-500/20 text-fuchsia-800 dark:text-fuchsia-200",
  "bg-orange-500/20 text-orange-800 dark:text-orange-200",
  "bg-lime-500/20 text-lime-800 dark:text-lime-200",
  "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200",
  "bg-teal-500/20 text-teal-800 dark:text-teal-200",
  "bg-pink-500/20 text-pink-800 dark:text-pink-200",
] as const

export function avatarFallbackTone(seed: string | number): string {
  const text = String(seed)
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length] ?? AVATAR_TONES[0]
}
