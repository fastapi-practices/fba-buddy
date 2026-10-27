import { useEffect } from "react"

import { useTheme } from "@/components/theme-provider"
import { useSidebar } from "@/components/ui/sidebar"
import {
  eventMatchesCombo,
  isEditableShortcutTarget,
  resolveShortcut,
} from "@/features/shell/keyboard-shortcuts"
import { useShortcutStore } from "@/features/shell/shortcut-store"

type ShortcutBindingsProps = {
  onToggleCommand: () => void
}

export function ShortcutBindings({ onToggleCommand }: ShortcutBindingsProps) {
  const { toggleSidebar } = useSidebar()
  const { theme, setTheme } = useTheme()
  const recording = useShortcutStore((state) => state.recording)
  const overrides = useShortcutStore((state) => state.overrides)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (recording || event.repeat) {
        return
      }

      const palette = resolveShortcut("command-palette", overrides)
      if (palette && eventMatchesCombo(event, palette)) {
        event.preventDefault()
        onToggleCommand()
        return
      }

      const sidebar = resolveShortcut("toggle-sidebar", overrides)
      if (sidebar && eventMatchesCombo(event, sidebar)) {
        event.preventDefault()
        toggleSidebar()
        return
      }

      if (isEditableShortcutTarget(event.target)) {
        return
      }

      const themeCombo = resolveShortcut("toggle-theme", overrides)
      if (themeCombo && eventMatchesCombo(event, themeCombo)) {
        event.preventDefault()
        if (theme === "system") {
          const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
          setTheme(systemDark ? "light" : "dark")
          return
        }
        setTheme(theme === "dark" ? "light" : "dark")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onToggleCommand, overrides, recording, setTheme, theme, toggleSidebar])

  return null
}
