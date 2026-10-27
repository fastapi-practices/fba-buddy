import { isTranslationKey } from "@/lib/i18n"
import { FieldError } from "@/components/ui/field"
import { useT } from "@/hooks/use-t"

export function FormFieldError({
  fieldState,
}: {
  fieldState: { invalid: boolean; error?: { message?: string } }
}) {
  const t = useT()
  if (!fieldState.invalid || !fieldState.error?.message) {
    return null
  }
  return (
    <FieldError>
      {isTranslationKey(fieldState.error.message)
        ? t(fieldState.error.message)
        : fieldState.error.message}
    </FieldError>
  )
}
