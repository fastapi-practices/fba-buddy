export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}
