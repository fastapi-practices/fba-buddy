import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import {
  getProjectDirectory,
  setProjectDirectory,
} from "@/lib/project-workspace"
import { ProjectSourceFolder } from "./project-source-folder"
import type { ProjectItem } from "@/lib/types"
import { useT } from "@/hooks/use-t"

export function ProjectDirectoryDialog({
  project,
  onClose,
}: {
  project: ProjectItem
  onClose: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const [directory, setDirectory] = useState<string | null | undefined>()
  const [pending, setPending] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [error, setError] = useState("")
  const [source] = useState(dataSourceKey)
  const currentSource = useAccountSourceStore(dataSourceKey)
  const ready = useAccountSourceStore((state) => state.ready)
  const active = useRef(true)
  const lock = useRef(false)
  const directoryQueryKey = ["project-directory", source, project.id] as const
  const localDirectory = useQuery({
    queryKey: directoryQueryKey,
    queryFn: () => getProjectDirectory(project.id),
    enabled: ready && source === currentSource,
  })
  const busy = pending || choosingFolder
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const save = async () => {
    if (
      lock.current ||
      busy ||
      directory === undefined ||
      localDirectory.isPending ||
      localDirectory.isError ||
      !useAccountSourceStore.getState().ready ||
      source !== dataSourceKey()
    )
      return
    lock.current = true
    setPending(true)
    setError("")
    try {
      await queryClient.cancelQueries({ queryKey: directoryQueryKey })
      if (!active.current || source !== dataSourceKey()) return
      const savedDirectory = await setProjectDirectory(project.id, directory)
      if (!active.current || source !== dataSourceKey()) return
      queryClient.setQueryData(directoryQueryKey, savedDirectory)
      void queryClient.invalidateQueries({ queryKey: directoryQueryKey })
      onClose()
    } catch (cause) {
      if (active.current && source === dataSourceKey())
        setError(
          cause instanceof Error ? cause.message : t("common.requestFailed")
        )
    } finally {
      lock.current = false
      if (active.current && source === dataSourceKey()) setPending(false)
    }
  }
  if (source !== currentSource) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{t("common.projectDirectory")}</DialogTitle>
          <DialogDescription>
            {t("common.projectDirectoryHint")}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {localDirectory.isPending ? (
            <Spinner aria-label={t("common.loading")} />
          ) : null}
          <ProjectSourceFolder
            directory={
              directory !== undefined
                ? directory
                : (localDirectory.data ?? null)
            }
            pending={
              pending ||
              !ready ||
              localDirectory.isPending ||
              localDirectory.isError
            }
            onChange={setDirectory}
            onBusyChange={setChoosingFolder}
          />
          {localDirectory.isError ? (
            <FieldGroup>
              <FieldError>{localDirectory.error.message}</FieldError>
              <Button
                variant="outline"
                size="sm"
                disabled={localDirectory.isFetching}
                onClick={() => void localDirectory.refetch()}
                className="self-start"
              >
                {t("common.retry")}
              </Button>
            </FieldGroup>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={
              busy ||
              !ready ||
              directory === undefined ||
              localDirectory.isPending ||
              localDirectory.isError
            }
            onClick={() => void save()}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
