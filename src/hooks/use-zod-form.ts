import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type FieldValues, type UseFormProps } from "react-hook-form"
import type { z } from "zod"

export function useZodForm<TValues extends FieldValues>(
  schema: z.ZodType<TValues, TValues>,
  options: Omit<UseFormProps<TValues>, "resolver">
) {
  return useForm<TValues>({
    ...options,
    resolver: zodResolver(schema),
  })
}
