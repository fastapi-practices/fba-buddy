import { useId } from "react"
import { Controller } from "react-hook-form"

import { createMyQuickPhrase, updateMyQuickPhrase } from "@/api"
import { apiErrorMessage } from "@/api/http"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  parsePhraseEditorInput,
  phraseEditorSchema,
} from "@/features/workspace/phrase"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import type { QuickPhraseItem } from "@/lib/types"

export function PhraseEditorDialog({
  open,
  phrase,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  phrase: QuickPhraseItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<unknown> | void
}) {
  if (!open) {
    return null
  }
  return (
    <PhraseEditorForm
      key={phrase?.id ?? "create"}
      phrase={phrase}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  )
}

function PhraseEditorForm({
  phrase,
  onOpenChange,
  onSaved,
}: {
  phrase: QuickPhraseItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<unknown> | void
}) {
  const t = useT()
  const formId = useId()
  const form = useZodForm(phraseEditorSchema, {
    defaultValues: {
      title: phrase?.title ?? "",
      content: phrase?.content ?? "",
    },
  })

  async function onSubmit(values: { title: string; content: string }) {
    const parsed = parsePhraseEditorInput(values)
    if (!parsed.ok) {
      for (const [key, message] of Object.entries(parsed.errors)) {
        if (message) {
          form.setError(key as "title" | "content", { message })
        }
      }
      return
    }
    try {
      if (phrase) {
        await updateMyQuickPhrase(phrase.id, {
          ...parsed.body,
          sort: phrase.sort,
        })
      } else {
        await createMyQuickPhrase(parsed.body)
      }
      await onSaved()
      onOpenChange(false)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.saveFailed")))
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {phrase ? t("common.editQuickPhrase") : t("common.newQuickPhrase")}
          </DialogTitle>
          {phrase ? (
            <DialogDescription>
              {t(
                "hints.theTitleAppearsInTheCommandPaletteTheContentIsInsertedIntoTheComposer"
              )}
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
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="phrase-title">
                    {t("common.title")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="phrase-title"
                    required
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="content"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="phrase-content">
                    {t("common.content")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="phrase-content"
                    required
                    rows={5}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
