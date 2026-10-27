import { useEffect, useId, useMemo } from "react"
import { Controller, type Control } from "react-hook-form"

import { createMyMcp, importMyMcps, updateMyMcp } from "@/api"
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
import {
  Field,
  FieldDescription,
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
import {
  EMPTY_MCP_EDITOR,
  MCP_TYPE_ITEMS,
  mcpEditorSchema,
  mcpEditorValuesFromItem,
  mcpImportSchema,
  mcpWriteBodyFromEditor,
  type McpEditorValues,
} from "@/features/mcp/mcp"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { notifyError } from "@/lib/notify"
import { useSessionStore } from "@/lib/session"
import type { McpItem } from "@/lib/types"

export function CreateMcpDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<unknown> | void
}) {
  const t = useT()
  const formId = useId()
  const isSuperuser =
    useSessionStore((state) => state.user?.is_superuser) === true
  const typeItems = useMemo(
    () =>
      isSuperuser
        ? MCP_TYPE_ITEMS
        : MCP_TYPE_ITEMS.filter((item) => item.value !== "0"),
    [isSuperuser]
  )
  const form = useZodForm(mcpEditorSchema, {
    defaultValues: EMPTY_MCP_EDITOR,
  })
  const type = form.watch("type")

  useEffect(() => {
    if (!open) {
      form.reset(EMPTY_MCP_EDITOR)
    }
  }, [form, open])

  async function onSubmit(values: McpEditorValues) {
    try {
      await createMyMcp(mcpWriteBodyFromEditor(values))
      await onCreated()
      onOpenChange(false)
      form.reset(EMPTY_MCP_EDITOR)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotCreateTheMcp")))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.createMcp")}</DialogTitle>
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
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="mcp-name">{t("common.name")}</FieldLabel>
                  <Input
                    {...field}
                    id="mcp-name"
                    required
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="mcp-type">{t("common.type")}</FieldLabel>
                  <Select
                    items={typeItems.map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) {
                        field.onChange(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      id="mcp-type"
                      className="w-full"
                      aria-required
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {typeItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <McpConnectionFields
              control={form.control}
              type={type}
              idPrefix="mcp"
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
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditMcpDialog({
  mcp,
  open,
  onOpenChange,
  onSaved,
}: {
  mcp: McpItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<unknown> | void
}) {
  const t = useT()
  const formId = useId()
  const isSuperuser =
    useSessionStore((state) => state.user?.is_superuser) === true
  const form = useZodForm(mcpEditorSchema, {
    defaultValues: mcp ? mcpEditorValuesFromItem(mcp) : EMPTY_MCP_EDITOR,
  })
  const mcpType = mcp?.type ?? 2

  useEffect(() => {
    if (open && mcp) {
      form.reset(mcpEditorValuesFromItem(mcp))
    }
    if (!open) {
      form.reset(EMPTY_MCP_EDITOR)
    }
  }, [form, mcp, open])

  async function onSubmit(values: McpEditorValues) {
    if (!mcp) {
      return
    }
    if (mcpType === 0 && !isSuperuser) {
      notifyError(t("common.stdioIsAvailableToSuperusersOnly"))
      return
    }
    try {
      await updateMyMcp(
        mcp.id,
        mcpWriteBodyFromEditor(values, {
          type: mcpType,
          description: mcp.description,
          timeout: mcp.timeout,
          read_timeout: mcp.read_timeout,
          tool_prefix: mcp.tool_prefix,
          include_instructions: mcp.include_instructions,
        })
      )
      await onSaved()
      onOpenChange(false)
      form.reset(EMPTY_MCP_EDITOR)
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotSaveTheMcp")))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.editMcp")}</DialogTitle>
          <DialogDescription>
            {t("hints.savesToYourCopyOnlyBuiltInMcpIsNotChanged")}
          </DialogDescription>
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
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="edit-mcp-name">
                    {t("common.name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="edit-mcp-name"
                    required
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <McpConnectionFields
              control={form.control}
              type={mcpType === 0 ? "0" : mcpType === 1 ? "1" : "2"}
              idPrefix="edit-mcp"
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

export function ImportMcpJsonDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => Promise<unknown> | void
}) {
  const t = useT()
  const formId = useId()
  const form = useZodForm(mcpImportSchema, {
    defaultValues: { jsonText: "" },
  })

  useEffect(() => {
    if (!open) {
      form.reset({ jsonText: "" })
    }
  }, [form, open])

  async function onSubmit(values: { jsonText: string }) {
    try {
      const result = await importMyMcps(values.jsonText)
      await onImported()
      onOpenChange(false)
      form.reset({ jsonText: "" })
      if (result.created === 0 && result.skipped.length > 0) {
        notifyError(t("common.nothingCreatedThoseNamesAlreadyExist"))
      }
    } catch (error) {
      notifyError(apiErrorMessage(error, t("common.couldNotImportMcp")))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.importJson")}</DialogTitle>
          <DialogDescription>
            {t("common.pasteClaudeDesktopOrCursorMcpserversJson")}
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) => onSubmit(values))(event)
          }}
        >
          <Controller
            name="jsonText"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="mcp-json" className="sr-only">
                  {t("common.mcpJson")}
                </FieldLabel>
                <Textarea
                  {...field}
                  id="mcp-json"
                  required
                  className="min-h-48 font-mono"
                  placeholder={`{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/"
    }
  }
}`}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FormFieldError fieldState={fieldState} />
              </Field>
            )}
          />
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
            {t("common.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function McpConnectionFields({
  control,
  type,
  idPrefix,
}: {
  control: Control<McpEditorValues>
  type: string
  idPrefix: string
}) {
  const t = useT()
  if (type === "0") {
    return (
      <>
        <Controller
          name="command"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-command`}>
                {t("common.command")}
              </FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-command`}
                required
                placeholder="npx"
                aria-invalid={fieldState.invalid || undefined}
              />
              <FormFieldError fieldState={fieldState} />
            </Field>
          )}
        />
        <Controller
          name="argsText"
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-args`}>
                {t("common.arguments")}
              </FieldLabel>
              {/* 一行一个参数，空行忽略 */}
              <Textarea
                {...field}
                id={`${idPrefix}-args`}
                className="font-mono"
                placeholder={"-y\n@modelcontextprotocol/server-github"}
              />
            </Field>
          )}
        />
        <Controller
          name="envText"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-env`}>
                {t("common.environmentVariables")}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${idPrefix}-env`}
                className="font-mono"
                placeholder='{"GITHUB_PERSONAL_ACCESS_TOKEN":"..."}'
                aria-invalid={fieldState.invalid || undefined}
              />
              <FieldDescription>
                {t("common.optionalJsonObject")}
              </FieldDescription>
              <FormFieldError fieldState={fieldState} />
            </Field>
          )}
        />
      </>
    )
  }
  return (
    <>
      <Controller
        name="url"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-url`}>
              {t("common.url")}
            </FieldLabel>
            <Input
              {...field}
              id={`${idPrefix}-url`}
              required
              placeholder="https://example.com/mcp"
              aria-invalid={fieldState.invalid || undefined}
            />
            <FormFieldError fieldState={fieldState} />
          </Field>
        )}
      />
      <Controller
        name="headersText"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-headers`}>
              {t("common.headers")}
            </FieldLabel>
            <Textarea
              {...field}
              id={`${idPrefix}-headers`}
              className="font-mono"
              placeholder='{"Authorization":"Bearer ..."}'
              aria-invalid={fieldState.invalid || undefined}
            />
            <FieldDescription>
              {t("common.optionalJsonObject")}
            </FieldDescription>
            <FormFieldError fieldState={fieldState} />
          </Field>
        )}
      />
    </>
  )
}
