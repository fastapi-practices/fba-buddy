import { useSyncExternalStore } from "react"

const codeWrapKey = "fba-buddy.code-wrap"
const preferenceEvent = "fba-buddy-render-preferences"
let fallbackValue: boolean | undefined
const read = () => {
  if (fallbackValue !== undefined) return fallbackValue
  try {
    return localStorage.getItem(codeWrapKey) === "true"
  } catch {
    return false
  }
}
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify)
  window.addEventListener(preferenceEvent, notify)
  return () => {
    window.removeEventListener("storage", notify)
    window.removeEventListener(preferenceEvent, notify)
  }
}

export function useCodeWrapPreference() {
  const wrapped = useSyncExternalStore(subscribe, read, () => false)
  const setWrapped = (value: boolean) => {
    try {
      localStorage.setItem(codeWrapKey, String(value))
      fallbackValue = undefined
    } catch {
      fallbackValue = value
    }
    window.dispatchEvent(new Event(preferenceEvent))
  }
  return [wrapped, setWrapped] as const
}
