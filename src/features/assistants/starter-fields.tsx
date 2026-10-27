import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { STARTER_MAX, STARTER_TEXT_MAX } from "@/features/assistants/starters"
import { useT } from "@/hooks/use-t"

export function StarterFields({
  values,
  onChange,
  disabled,
}: {
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const t = useT()
  const canAdd = !disabled && values.length < STARTER_MAX

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel>{t("common.opening")}</FieldLabel>
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={value}
              maxLength={STARTER_TEXT_MAX}
              placeholder={t(
                "hints.openingLinesTheUserCanPickWhenEnteringAChat"
              )}
              disabled={disabled}
              onChange={(event) => {
                const next = [...values]
                next[index] = event.target.value
                onChange(next)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={disabled}
              onClick={() =>
                onChange(values.filter((_, item) => item !== index))
              }
            >
              {t("common.delete")}
            </Button>
          </div>
        ))}
        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onChange([...values, ""])}
          >
            <PlusIcon data-icon="inline-start" />
            {t("common.addOpening")}
          </Button>
        ) : null}
      </div>
    </Field>
  )
}
