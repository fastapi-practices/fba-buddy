import { useId, useState } from "react"
import { GitBranchIcon, GitCommitHorizontalIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/hooks/use-t"
import type { WorkspaceGitStatusEntry } from "@/shared/workspace"

export function WorkspaceGitCommit({
  open,
  onOpenChange,
  branch,
  entries,
  loading = false,
  busy,
  disabled = false,
  error,
  onCommit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch: string | null
  entries: WorkspaceGitStatusEntry[]
  loading?: boolean
  busy: boolean
  disabled?: boolean
  error: string
  onCommit: (message: string) => Promise<boolean>
}) {
  const t = useT()
  const [message, setMessage] = useState("")
  const formId = useId()
  const inputId = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("common.gitCommitTitle")}</DialogTitle>
          <DialogDescription>
            {t("common.gitCommitHint", { count: entries.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <GitBranchIcon className="size-4" />
          <span>{branch ?? t("common.gitDetachedHead")}</span>
        </div>
        <ul className="flex max-h-40 flex-col gap-1 overflow-auto rounded-lg border p-3 text-xs">
          {loading && (
            <li
              role="status"
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Spinner />
              {t("common.loading")}
            </li>
          )}
          {entries.map((entry) => (
            <li key={entry.path} className="truncate" title={entry.path}>
              {entry.path}
            </li>
          ))}
        </ul>
        <form
          id={formId}
          aria-busy={busy || loading}
          onSubmit={async (event) => {
            event.preventDefault()
            if (!message.trim() || busy || disabled || !entries.length) return
            if (await onCommit(message.trim())) {
              setMessage("")
              onOpenChange(false)
            }
          }}
        >
          <FieldGroup>
            <Field data-disabled={busy || undefined}>
              <FieldLabel htmlFor={inputId}>
                {t("common.gitCommitMessage")}
              </FieldLabel>
              <Textarea
                id={inputId}
                aria-label={t("common.gitCommitMessage")}
                autoFocus
                required
                maxLength={8192}
                disabled={busy}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("common.gitCommitPlaceholder")}
                className="min-h-24"
              />
            </Field>
          </FieldGroup>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={busy || disabled || !entries.length || !message.trim()}
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <GitCommitHorizontalIcon data-icon="inline-start" />
            )}
            {t("common.gitCommit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
