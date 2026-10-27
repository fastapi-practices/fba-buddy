import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"
import { Controller } from "react-hook-form"

import {
  createMyExpert,
  deleteMyExpert,
  listKnowledgeBases,
  listMcps,
  listSkills,
  updateMyExpert,
} from "@/api"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { FormFieldError } from "@/components/form-field-error"
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
import {
  expertEditorFormSchema,
  parseExpertEditorInput,
} from "@/features/assistants/expert-apply"
import { StarterFields } from "@/features/assistants/starter-fields"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type { ExpertDetail } from "@/lib/types"

export function ExpertEditorDialog({
  open,
  expert,
  onOpenChange,
}: {
  open: boolean
  expert: ExpertDetail | null
  onOpenChange: (open: boolean) => void
}) {
  if (!open) {
    return null
  }
  return (
    <ExpertEditorForm
      key={expert?.id ?? "create"}
      expert={expert}
      onOpenChange={onOpenChange}
    />
  )
}

function ExpertEditorForm({
  expert,
  onOpenChange,
}: {
  expert: ExpertDetail | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const formId = useId()
  const form = useZodForm(expertEditorFormSchema, {
    defaultValues: {
      name: expert?.name ?? "",
      description: expert?.description ?? "",
      prompt: expert?.prompt ?? "",
      starters: expert?.starters ?? [],
      mcp_ids: expert?.mcps.map((item) => item.id) ?? [],
      skill_ids: expert?.skills.map((item) => item.id) ?? [],
      knowledge_ids: expert?.knowledge_bases.map((item) => item.id) ?? [],
    },
  })
  const [removing, setRemoving] = useState(false)
  const owned = canEditOwnedResource(expert?.user_id)
  const readOnly = expert != null && !owned
  const mcpsQuery = useQuery({
    queryKey: queryKeys.mcps(),
    queryFn: listMcps,
  })
  const skillsQuery = useQuery({
    queryKey: queryKeys.skills(),
    queryFn: listSkills,
  })
  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledgeBases(),
    queryFn: listKnowledgeBases,
  })

  async function onSubmit(values: {
    name: string
    prompt: string
    description: string
    starters: string[]
    mcp_ids: number[]
    skill_ids: number[]
    knowledge_ids: number[]
  }) {
    if (readOnly) {
      return
    }
    const parsed = parseExpertEditorInput({
      ...values,
      sort: expert?.sort ?? 0,
    })
    if (!parsed.ok) {
      for (const [key, message] of Object.entries(parsed.errors)) {
        if (message) {
          form.setError(key as "name" | "prompt", { message })
        }
      }
      return
    }
    try {
      if (expert) {
        await updateMyExpert(expert.id, parsed.body)
      } else {
        await createMyExpert(parsed.body)
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.experts() })
      onOpenChange(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotSaveTheExpert")))
    }
  }

  async function remove() {
    if (!expert || !owned) {
      return
    }
    setRemoving(true)
    try {
      await deleteMyExpert(expert.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.experts() })
      onOpenChange(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotDeleteTheExpert")))
    } finally {
      setRemoving(false)
    }
  }

  const saving = form.formState.isSubmitting

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {expert ? t("common.editExpert") : t("common.newExpert")}
          </DialogTitle>
          {expert ? (
            <DialogDescription>
              {t("hints.onlyEditYourOwnExpertsBuiltInExpertsAreReadOnly")}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) => onSubmit(values))(event)
          }}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid || undefined}
                  data-disabled={readOnly || undefined}
                >
                  <FieldLabel htmlFor="expert-name">
                    {t("common.name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="expert-name"
                    required
                    disabled={readOnly}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field data-disabled={readOnly || undefined}>
                  <FieldLabel htmlFor="expert-description">
                    {t("common.description")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="expert-description"
                    rows={2}
                    disabled={readOnly}
                  />
                </Field>
              )}
            />
            <Controller
              name="prompt"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid || undefined}
                  data-disabled={readOnly || undefined}
                >
                  <FieldLabel htmlFor="expert-prompt">
                    {t("fields.prompt")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="expert-prompt"
                    required
                    rows={6}
                    disabled={readOnly}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="mcp_ids"
              control={form.control}
              render={({ field }) => (
                <ResourceMultiSelect
                  id="expert-mcps"
                  label={t("common.mcp")}
                  items={(mcpsQuery.data ?? []).map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  value={field.value}
                  disabled={readOnly}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              name="skill_ids"
              control={form.control}
              render={({ field }) => (
                <ResourceMultiSelect
                  id="expert-skills"
                  label={t("common.skills")}
                  items={(skillsQuery.data ?? []).map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  value={field.value}
                  disabled={readOnly}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              name="knowledge_ids"
              control={form.control}
              render={({ field }) => (
                <ResourceMultiSelect
                  id="expert-knowledge"
                  label={t("knowledge.title")}
                  items={(knowledgeQuery.data ?? []).map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  value={field.value}
                  disabled={readOnly}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              name="starters"
              control={form.control}
              render={({ field }) => (
                <StarterFields
                  values={field.value}
                  disabled={readOnly}
                  onChange={field.onChange}
                />
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          {expert && owned ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={removing || saving}
              onClick={() => void remove()}
            >
              {removing ? <Spinner data-icon="inline-start" /> : null}
              {t("common.delete")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={saving || readOnly}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResourceMultiSelect({
  id,
  label,
  items,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  items: Array<{ value: string; label: string }>
  value: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const t = useT()
  const selected = value.map(String)
  const labels = new Map(items.map((item) => [item.value, item.label]))

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        multiple
        value={selected}
        disabled={disabled}
        onValueChange={(next) => {
          const ids = (Array.isArray(next) ? next : [])
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0)
          onChange(ids)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(current: string[]) =>
              current.length === 0
                ? t("common.noneSelected")
                : current.map((item) => labels.get(item) ?? item).join("、")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
