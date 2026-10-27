import { useEffect, useState } from "react"
import { RotateCcwIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import {
  findShortcutConflict,
  isMacShortcutPlatform,
  isShortcutOverridden,
  hasShortcutOverrides,
  resolveShortcut,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutTokens,
  comboFromKeyboardEvent,
  type ShortcutId,
} from "@/features/shell/keyboard-shortcuts"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import { useShortcutStore } from "@/features/shell/shortcut-store"
import { useT } from "@/hooks/use-t"
import { notifyError } from "@/lib/notify"

export function ShortcutSettings() {
  const t = useT()
  const isMac = isMacShortcutPlatform(
    window.buddyDesktop?.platform ?? navigator.platform
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <SettingsPageHeader
        title={t("common.shortcuts")}
        action={<ShortcutSettingsAction />}
      />
      {SHORTCUT_GROUPS.map((group) => {
        const items = SHORTCUTS.filter((item) => item.group === group.id)
        if (items.length === 0) {
          return null
        }
        return (
          <SettingsBlock key={group.id} title={t(group.label)}>
            <SettingsCard>
              {items.map((item) => (
                <ShortcutRow
                  key={item.id}
                  id={item.id}
                  label={t(item.label)}
                  isMac={isMac}
                />
              ))}
            </SettingsCard>
          </SettingsBlock>
        )
      })}
    </div>
  )
}

function ShortcutSettingsAction() {
  const t = useT()
  const overrides = useShortcutStore((state) => state.overrides)
  const resetAll = useShortcutStore((state) => state.resetAll)
  const canResetAll = hasShortcutOverrides(overrides)

  return (
    <Button
      type="button"
      variant="outline"
      disabled={!canResetAll}
      onClick={resetAll}
    >
      <RotateCcwIcon data-icon="inline-start" />
      {t("common.resetAll")}
    </Button>
  )
}

function ShortcutRow({
  id,
  label,
  isMac,
}: {
  id: ShortcutId
  label: string
  isMac: boolean
}) {
  const t = useT()
  const overrides = useShortcutStore((state) => state.overrides)
  const setShortcut = useShortcutStore((state) => state.setShortcut)
  const clearShortcut = useShortcutStore((state) => state.clearShortcut)
  const resetShortcut = useShortcutStore((state) => state.resetShortcut)
  const setRecording = useShortcutStore((state) => state.setRecording)
  const [capturing, setCapturing] = useState(false)
  const combo = resolveShortcut(id, overrides)
  const overridden = isShortcutOverridden(id, overrides)

  useEffect(() => {
    if (!capturing) {
      return undefined
    }

    function stopCapture() {
      setCapturing(false)
      setRecording(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) {
        return
      }
      if (event.key === "Escape") {
        stopCapture()
        return
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        clearShortcut(id)
        stopCapture()
        return
      }
      const next = comboFromKeyboardEvent(event)
      if (!next) {
        return
      }
      const conflict = findShortcutConflict(
        id,
        next,
        useShortcutStore.getState().overrides
      )
      if (conflict) {
        const occupied = SHORTCUTS.find((item) => item.id === conflict)
        notifyError(t("common.shortcutAlreadyInUse"), {
          description: occupied ? t(occupied.label) : conflict,
        })
        return
      }
      setShortcut(id, next)
      stopCapture()
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      setRecording(false)
    }
  }, [capturing, clearShortcut, id, setRecording, setShortcut, t])

  function startCapture() {
    setCapturing(true)
    setRecording(true)
  }

  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
      </FieldContent>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={capturing}
          onClick={startCapture}
        >
          {capturing ? (
            t("common.pressAShortcut")
          ) : combo ? (
            <span className="flex items-center gap-1">
              {shortcutTokens(combo, isMac).map((token) => (
                <kbd
                  key={`${id}-${token}`}
                  className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {token}
                </kbd>
              ))}
            </span>
          ) : (
            t("common.notSet")
          )}
        </Button>
        {combo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("common.removeShortcut")}
            onClick={() => clearShortcut(id)}
          >
            <Trash2Icon />
          </Button>
        ) : null}
        {overridden ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("common.resetShortcut")}
            onClick={() => resetShortcut(id)}
          >
            <RotateCcwIcon />
          </Button>
        ) : null}
      </div>
    </Field>
  )
}
