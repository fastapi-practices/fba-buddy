import { useEffect, useRef, useState } from "react"
import { FolderOpenIcon, FolderPlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/hooks/use-t"
import { dataSourceKey } from "@/lib/account-source"
import { projectDirectoryName } from "@/lib/project-workspace"

export function ProjectSourceFolder({
  directory,
  pending,
  onChange,
  onBusyChange,
}: {
  directory: string | null
  pending: boolean
  onChange: (directory: string | null) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useT()
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const active = useRef(true)
  const desktop = window.buddyDesktop
  const disabled = pending || choosing
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  async function choose() {
    if (disabled || lock.current || !desktop?.chooseExecutionWorkspace) return
    lock.current = true
    const source = dataSourceKey()
    setChoosing(true)
    onBusyChange?.(true)
    setError("")
    try {
      const selected = await desktop.chooseExecutionWorkspace()
      if (active.current && source === dataSourceKey() && selected)
        onChange(selected)
    } catch (cause) {
      if (active.current && source === dataSourceKey())
        setError(
          cause instanceof Error ? cause.message : t("common.requestFailed")
        )
    } finally {
      lock.current = false
      if (active.current) {
        setChoosing(false)
        onBusyChange?.(false)
      }
    }
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel>{t("common.projectSourceFolder")}</FieldLabel>
      <FieldDescription>
        {t("common.projectFolderDescription")}
      </FieldDescription>
      {directory ? (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border p-4">
          <FolderOpenIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm font-medium">
              {projectDirectoryName(directory)}
            </span>
            <span
              className="truncate text-xs text-muted-foreground"
              title={directory}
            >
              {directory}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => void choose()}
          >
            {choosing ? <Spinner data-icon="inline-start" /> : null}
            {t("common.changeProjectFolder")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t("common.removeProjectFolder")}
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <Empty className="min-h-36 border border-solid">
          <EmptyHeader>
            <EmptyTitle>{t("common.projectFolderOnThisComputer")}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={
                disabled ||
                !desktop?.chooseExecutionWorkspace ||
                !desktop.projectWorkspace
              }
              onClick={() => void choose()}
            >
              {choosing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <FolderPlusIcon data-icon="inline-start" />
              )}
              {t("common.addProjectFolder")}
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {!desktop?.projectWorkspace && (
        <FieldDescription>
          {t("common.projectFolderRequiresDesktop")}
        </FieldDescription>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}
