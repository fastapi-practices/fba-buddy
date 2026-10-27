import { useId, useState } from "react"
import { FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/hooks/use-t"
import { ProjectSourceFolder } from "./project-source-folder"

export function CreateProjectDialog({
  open,
  name,
  pending,
  directory,
  onOpenChange,
  onNameChange,
  onDirectoryChange,
  onSubmit,
}: {
  open: boolean
  name: string
  pending: boolean
  directory: string | null
  onOpenChange: (open: boolean) => void
  onNameChange: (name: string) => void
  onDirectoryChange: (directory: string | null) => void
  onSubmit: (name: string) => void
}) {
  const t = useT()
  const inputId = useId()
  const formId = useId()
  const [choosingFolder, setChoosingFolder] = useState(false)
  const busy = pending || choosingFolder

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("common.createProject")}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() && !busy) onSubmit(name.trim())
          }}
        >
          <FieldGroup>
            <Field data-disabled={pending || undefined}>
              <FieldLabel htmlFor={inputId} className="sr-only">
                {t("common.projectName")}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <FolderIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  id={inputId}
                  autoFocus
                  required
                  value={name}
                  disabled={pending}
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder={t("common.projectName")}
                />
              </InputGroup>
            </Field>
            <ProjectSourceFolder
              directory={directory}
              pending={pending}
              onChange={onDirectoryChange}
              onBusyChange={setChoosingFolder}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!name.trim() || busy}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t("common.createProject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
