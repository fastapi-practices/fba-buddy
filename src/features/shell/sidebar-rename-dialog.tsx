import { useEffect, useId } from "react"
import { Controller } from "react-hook-form"
import { z } from "zod"

import { FormFieldError } from "@/components/form-field-error"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"

const renameSchema = z.object({
  name: z.string().trim().min(1, "common.nameIsRequired"),
})

export function RenameDialog({
  open,
  onOpenChange,
  title,
  value,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onSubmit: (next: string) => void | Promise<void>
}) {
  const t = useT()
  const inputId = useId()
  const formId = useId()
  const form = useZodForm(renameSchema, {
    defaultValues: { name: value },
  })
  const name = form.watch("name")

  useEffect(() => {
    if (open) {
      form.reset({ name: value })
    }
  }, [form, open, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              void onSubmit(values.name)
              onOpenChange(false)
            })(event)
          }}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor={inputId} className="sr-only">
                    {title}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={inputId}
                    required
                    autoFocus
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
          <Button type="submit" form={formId} disabled={!name.trim()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
