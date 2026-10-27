import { useId, useState } from "react"
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"

import {
  createMyKnowledgeBase,
  deleteMyKnowledgeBase,
  listMyKnowledgeBases,
  updateMyKnowledgeBase,
  uploadMyKnowledgeDocument,
} from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useComposerStore } from "@/features/chat/composer-store"
import { SidebarToolbarButton } from "@/features/shell/sidebar-toolbar-button"
import {
  KNOWLEDGE_UPLOAD_ACCEPT,
  supportsKnowledgeUpload,
} from "@/features/workspace/knowledge-file-types"
import {
  useKnowledgeBases,
  useKnowledgeWorkspaceStore,
  useSelectedKnowledgeBase,
} from "@/features/workspace/knowledge-workspace"
import { useWorkspaceSearchStore } from "@/features/workspace/workspace-search"
import { useT } from "@/hooks/use-t"
import { dataSourceKey, useAccountSourceStore } from "@/lib/account-source"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type {
  KnowledgeBaseItem,
  KnowledgeBaseWithDocuments,
  WorkspaceKnowledgeItem,
} from "@/lib/types"

function refreshKnowledge(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledge() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myKnowledgeBases() }),
  ])
}

export function WorkspaceKnowledgeAddButton() {
  const t = useT()
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const basesQuery = useKnowledgeBases()
  const selectedBase = useSelectedKnowledgeBase(basesQuery.data ?? [])

  return (
    <>
      <SidebarToolbarButton
        label={t("knowledge.newBase")}
        onClick={() => setCreating(true)}
      >
        <PlusIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      <SidebarToolbarButton
        label={t("common.uploadKnowledge")}
        onClick={() => setUploading(true)}
      >
        <UploadIcon strokeWidth={1.75} />
      </SidebarToolbarButton>
      {creating ? (
        <KnowledgeBaseEditor onClose={() => setCreating(false)} />
      ) : null}
      {uploading ? (
        <KnowledgeUploadDialog
          base={
            selectedBase && canEditOwnedResource(selectedBase.user_id)
              ? selectedBase
              : undefined
          }
          onClose={() => setUploading(false)}
        />
      ) : null}
    </>
  )
}

export function KnowledgeBaseActions({ base }: { base: KnowledgeBaseItem }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function remove() {
    if (removing) return
    const source = dataSourceKey()
    setRemoving(true)
    try {
      await deleteMyKnowledgeBase(base.id)
      if (source !== dataSourceKey()) return
      const composer = useComposerStore.getState()
      const documents = queryClient
        .getQueriesData<WorkspaceKnowledgeItem[]>({
          queryKey: queryKeys.knowledgeDocuments(base.id),
        })
        .flatMap(([, items]) => items ?? [])
      if (
        composer.workspace_ref?.kind === "knowledge" &&
        (documents.some((item) => item.id === composer.workspace_ref?.id) ||
          queryClient
            .getQueryData<KnowledgeBaseWithDocuments[]>(queryKeys.knowledge())
            ?.find((item) => item.id === base.id)
            ?.documents.some((item) => item.id === composer.workspace_ref?.id))
      ) {
        composer.setWorkspaceRef(null)
      }
      queryClient.setQueriesData<KnowledgeBaseItem[]>(
        { queryKey: queryKeys.knowledgeBases() },
        (items) => items?.filter((item) => item.id !== base.id)
      )
      queryClient.setQueriesData<KnowledgeBaseItem[]>(
        { queryKey: queryKeys.myKnowledgeBases() },
        (items) => items?.filter((item) => item.id !== base.id)
      )
      queryClient.removeQueries({
        queryKey: queryKeys.knowledgeDocuments(base.id),
      })
      setConfirmDelete(false)
      await refreshKnowledge(queryClient)
    } catch (error) {
      if (source !== dataSourceKey()) return
      notifyError(apiErrorMessage(error, t("knowledge.deleteFailed")))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("knowledge.editBase")}
        title={t("knowledge.editBase")}
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={t("knowledge.deleteBase")}
        title={t("knowledge.deleteBase")}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("common.uploadKnowledge")}
        title={t("common.uploadKnowledge")}
        onClick={() => setUploading(true)}
      >
        <UploadIcon />
      </Button>
      {editing ? (
        <KnowledgeBaseEditor base={base} onClose={() => setEditing(false)} />
      ) : null}
      {uploading ? (
        <KnowledgeUploadDialog
          base={base}
          onClose={() => setUploading(false)}
        />
      ) : null}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!removing) setConfirmDelete(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("knowledge.deleteBase")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("knowledge.deleteHint", { name: base.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={() => void remove()}
            >
              {removing ? <Spinner data-icon="inline-start" /> : null}
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function KnowledgeBaseEditor({
  base,
  onClose,
  onCreated,
}: {
  base?: KnowledgeBaseItem
  onClose: () => void
  onCreated?: (base: KnowledgeBaseItem) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const formId = useId()
  const [name, setName] = useState(base?.name ?? "")
  const [description, setDescription] = useState(base?.description ?? "")
  const [invalidName, setInvalidName] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    if (!name.trim()) {
      setInvalidName(true)
      return
    }
    setSaving(true)
    const source = dataSourceKey()
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
      }
      if (base) {
        await updateMyKnowledgeBase(base.id, {
          ...body,
          provider_id: base.provider_id ?? null,
          model_id: base.model_id ?? null,
        })
      } else {
        const created = await createMyKnowledgeBase(body)
        if (source !== dataSourceKey()) return
        useKnowledgeWorkspaceStore.getState().selectBase(created.id)
        useWorkspaceSearchStore.getState().setQuery("")
        onCreated?.(created)
      }
      if (source !== dataSourceKey()) return
      await refreshKnowledge(queryClient)
      if (source !== dataSourceKey()) return
      onClose()
    } catch (error) {
      if (source !== dataSourceKey()) return
      notifyError(apiErrorMessage(error, t("common.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(base ? "knowledge.editBase" : "knowledge.newBase")}
          </DialogTitle>
          <DialogDescription>{t("knowledge.baseHint")}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <FieldGroup>
            <Field data-invalid={invalidName || undefined}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t("knowledge.baseName")}
              </FieldLabel>
              <Input
                id={`${formId}-name`}
                value={name}
                maxLength={128}
                disabled={saving}
                required
                aria-invalid={invalidName || undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setInvalidName(false)
                }}
              />
              {invalidName ? (
                <FieldError>{t("knowledge.nameRequired")}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-description`}>
                {t("common.description")}
              </FieldLabel>
              <Textarea
                id={`${formId}-description`}
                value={description}
                maxLength={512}
                disabled={saving}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KnowledgeUploadDialog({
  base,
  onClose,
}: {
  base?: KnowledgeBaseItem
  onClose: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const fieldId = useId()
  const [baseId, setBaseId] = useState<number | null>(base?.id ?? null)
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const source = useAccountSourceStore(dataSourceKey)
  const basesQuery = useQuery({
    queryKey: [...queryKeys.myKnowledgeBases(), source],
    queryFn: listMyKnowledgeBases,
  })
  const bases = basesQuery.data ?? []
  const selectedBase = bases.find((item) => item.id === baseId)
  const unsupportedFiles = files.filter(
    (file) => !supportsKnowledgeUpload(file.name)
  )

  async function upload() {
    if (
      !selectedBase ||
      files.length === 0 ||
      unsupportedFiles.length > 0 ||
      uploading
    )
      return
    setUploading(true)
    try {
      await uploadMyKnowledgeDocument(selectedBase.id, files)
      if (source !== dataSourceKey()) return
      await refreshKnowledge(queryClient)
      if (source !== dataSourceKey()) return
      useKnowledgeWorkspaceStore.getState().selectBase(selectedBase.id)
      useWorkspaceSearchStore.getState().setQuery("")
      onClose()
    } catch (error) {
      if (source !== dataSourceKey()) return
      notifyError(apiErrorMessage(error, t("common.couldNotUploadKnowledge")))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !uploading) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.uploadKnowledge")}</DialogTitle>
          <DialogDescription>{t("knowledge.uploadHint")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-base`}>
              {t("knowledge.targetBase")}
            </FieldLabel>
            <Select
              value={selectedBase?.id ?? null}
              onValueChange={setBaseId}
              items={bases.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              disabled={uploading || basesQuery.isPending || basesQuery.isError}
            >
              <SelectTrigger id={`${fieldId}-base`} className="w-full">
                <SelectValue placeholder={t("knowledge.chooseBase")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {bases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {basesQuery.isError ? (
              <FieldError>{apiErrorMessage(basesQuery.error)}</FieldError>
            ) : basesQuery.isSuccess && bases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("knowledge.createFirst")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => setCreating(true)}
              >
                <PlusIcon data-icon="inline-start" />
                {t("knowledge.newBase")}
              </Button>
              {basesQuery.isError ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void basesQuery.refetch()}
                >
                  {t("common.retry")}
                </Button>
              ) : null}
            </div>
          </Field>
          <Field
            data-disabled={uploading || undefined}
            data-invalid={unsupportedFiles.length > 0 || undefined}
          >
            <FieldLabel htmlFor={`${fieldId}-files`}>
              {t("knowledge.documents")}
            </FieldLabel>
            <Input
              id={`${fieldId}-files`}
              type="file"
              accept={KNOWLEDGE_UPLOAD_ACCEPT}
              aria-invalid={unsupportedFiles.length > 0 || undefined}
              aria-describedby={
                unsupportedFiles.length > 0
                  ? `${fieldId}-files-error`
                  : undefined
              }
              multiple
              disabled={uploading}
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
            />
            {files.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {files.map((file) => file.name).join("、")}
              </p>
            ) : null}
            {unsupportedFiles.length > 0 ? (
              <FieldError id={`${fieldId}-files-error`}>
                {t("knowledge.unsupportedFiles", {
                  names: unsupportedFiles.map((file) => file.name).join("、"),
                })}
              </FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={uploading} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={
              !selectedBase ||
              files.length === 0 ||
              unsupportedFiles.length > 0 ||
              uploading ||
              basesQuery.isError
            }
            onClick={() => void upload()}
          >
            {uploading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {t("knowledge.upload")}
          </Button>
        </DialogFooter>
        {creating ? (
          <KnowledgeBaseEditor
            onClose={() => setCreating(false)}
            onCreated={(created) => {
              queryClient.setQueryData<KnowledgeBaseItem[]>(
                [...queryKeys.myKnowledgeBases(), source],
                (current) => [created, ...(current ?? [])]
              )
              setBaseId(created.id)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
