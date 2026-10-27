import { useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"
import { Controller } from "react-hook-form"

import { createMyAssistant, deleteMyAssistant, updateMyAssistant } from "@/api"
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
  assistantEditorFormSchema,
  NONE_ASSISTANT_CATEGORY,
  parseAssistantEditorInput,
} from "@/features/assistants/assistant"
import { StarterFields } from "@/features/assistants/starter-fields"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import { canEditOwnedResource } from "@/lib/ownership"
import type { AssistantCategoryItem, AssistantItem } from "@/lib/types"

export function AssistantEditorDialog({
  open,
  assistant,
  categories,
  onOpenChange,
}: {
  open: boolean
  assistant: AssistantItem | null
  categories: AssistantCategoryItem[]
  onOpenChange: (open: boolean) => void
}) {
  if (!open) {
    return null
  }
  return (
    <AssistantEditorForm
      key={assistant?.id ?? "create"}
      assistant={assistant}
      categories={categories}
      onOpenChange={onOpenChange}
    />
  )
}

function AssistantEditorForm({
  assistant,
  categories,
  onOpenChange,
}: {
  assistant: AssistantItem | null
  categories: AssistantCategoryItem[]
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const formId = useId()
  const form = useZodForm(assistantEditorFormSchema, {
    defaultValues: {
      name: assistant?.name ?? "",
      description: assistant?.description ?? "",
      prompt: assistant?.prompt ?? "",
      category: assistant?.category?.trim() || NONE_ASSISTANT_CATEGORY,
      starters: assistant?.starters ?? [],
    },
  })
  const [removing, setRemoving] = useState(false)
  const owned = canEditOwnedResource(assistant?.user_id)
  const readOnly = assistant != null && !owned

  async function onSubmit(values: {
    name: string
    prompt: string
    description: string
    category: string
    starters: string[]
  }) {
    if (readOnly) {
      return
    }
    const parsed = parseAssistantEditorInput({
      ...values,
      sort: assistant?.sort ?? 0,
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
      if (assistant) {
        await updateMyAssistant(assistant.id, parsed.body)
      } else {
        await createMyAssistant(parsed.body)
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.assistantLists(),
      })
      onOpenChange(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotSaveTheAssistant")))
    }
  }

  async function remove() {
    if (!assistant || !owned) {
      return
    }
    setRemoving(true)
    try {
      await deleteMyAssistant(assistant.id)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.assistantLists(),
      })
      onOpenChange(false)
    } catch (error) {
      notifyError(
        apiErrorMessage(error, t("common.couldNotDeleteTheAssistant"))
      )
    } finally {
      setRemoving(false)
    }
  }

  const categoryItems = [
    { value: NONE_ASSISTANT_CATEGORY, label: t("common.uncategorized") },
    ...categories.map((item) => ({ value: item.code, label: item.name })),
  ]
  const saving = form.formState.isSubmitting

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {assistant ? t("common.editAssistant") : t("common.newAssistant")}
          </DialogTitle>
          {assistant ? (
            <DialogDescription>
              {t("hints.onlyEditYourOwnPersonasBuiltInAssistantsAreReadOnly")}
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
                  <FieldLabel htmlFor="assistant-name">
                    {t("common.name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="assistant-name"
                    required
                    disabled={readOnly}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="category"
              control={form.control}
              render={({ field }) => (
                <Field data-disabled={readOnly || undefined}>
                  <FieldLabel htmlFor="assistant-category">
                    {t("common.category")}
                  </FieldLabel>
                  <Select
                    items={categoryItems}
                    value={field.value}
                    disabled={readOnly}
                    onValueChange={(value) => {
                      if (value) {
                        field.onChange(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      id="assistant-category"
                      className="w-full"
                      aria-required
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categoryItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field data-disabled={readOnly || undefined}>
                  <FieldLabel htmlFor="assistant-description">
                    {t("common.description")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="assistant-description"
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
                  <FieldLabel htmlFor="assistant-prompt">
                    {t("fields.prompt")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="assistant-prompt"
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
          {assistant && owned ? (
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
