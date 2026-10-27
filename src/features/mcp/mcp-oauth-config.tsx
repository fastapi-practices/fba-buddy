import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon } from "lucide-react"
import type { FormEvent } from "react"
import { useId, useState } from "react"

import {
  getMcpOauthConfig,
  updateMcpOauthConfig,
  type McpOauthConfig,
  type McpOauthTokenEndpointAuthMethod,
} from "@/api/mcp-oauth"
import { apiErrorMessage } from "@/api/http"
import { queryKeys } from "@/api/query-keys"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { useT } from "@/hooks/use-t"
import type { TranslationKey } from "@/lib/i18n"
import type { McpItem } from "@/lib/types"

type OauthConfigDraft = {
  enabled: boolean
  authorization_url: string
  token_url: string
  client_id: string
  client_secret: string
  scope: string
  token_endpoint_auth_method: McpOauthTokenEndpointAuthMethod
}

const AUTH_METHOD_ITEMS: {
  value: McpOauthTokenEndpointAuthMethod
  label: TranslationKey
}[] = [
  { value: "none", label: "oauth.authMethodNone" },
  { value: "client_secret_post", label: "oauth.authMethodPost" },
  { value: "client_secret_basic", label: "oauth.authMethodBasic" },
]

function configDraft(config?: McpOauthConfig): OauthConfigDraft {
  return {
    enabled: config?.enabled ?? true,
    authorization_url: config?.authorization_url ?? "",
    token_url: config?.token_url ?? "",
    client_id: config?.client_id ?? "",
    client_secret: "",
    scope: config?.scope ?? "",
    token_endpoint_auth_method: config?.token_endpoint_auth_method ?? "none",
  }
}

export function McpOauthConfig({ mcp }: { mcp: McpItem }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const enabledId = useId()
  const authorizationId = useId()
  const tokenId = useId()
  const clientIdId = useId()
  const secretId = useId()
  const scopeId = useId()
  const configQuery = useQuery({
    queryKey: queryKeys.mcpOauthConfig(mcp.id),
    queryFn: ({ signal }) => getMcpOauthConfig(mcp.id, signal),
    retry: false,
  })
  const [draftOverride, setDraftOverride] = useState<OauthConfigDraft | null>(
    null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const config = configQuery.data
  const draft = draftOverride ?? configDraft(config)

  function update(patch: Partial<OauthConfigDraft>) {
    setDraftOverride({ ...draft, ...patch })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const authorizationUrl = draft.authorization_url.trim()
    const tokenUrl = draft.token_url.trim()
    const clientId = draft.client_id.trim()
    if (!authorizationUrl || !tokenUrl || !clientId) {
      setError(t("common.requiredFields"))
      return
    }
    if (
      draft.token_endpoint_auth_method !== "none" &&
      !draft.client_secret.trim() &&
      !configQuery.data?.has_client_secret
    ) {
      setError(t("oauth.clientSecretRequired"))
      return
    }

    setSaving(true)
    setError("")
    try {
      await updateMcpOauthConfig(mcp.id, {
        enabled: draft.enabled,
        authorization_url: authorizationUrl,
        token_url: tokenUrl,
        client_id: clientId,
        client_secret: draft.client_secret.trim() || null,
        scope: draft.scope.trim(),
        token_endpoint_auth_method: draft.token_endpoint_auth_method,
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.mcpOauthConfig(mcp.id),
        }),
        queryClient.invalidateQueries({ queryKey: ["mcp-oauth"] }),
      ])
      setDraftOverride(null)
      toast.add({ title: t("oauth.configSaved"), type: "success" })
    } catch (cause) {
      setError(apiErrorMessage(cause, t("common.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("oauth.configuration")}
    >
      <Separator />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("oauth.configuration")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("oauth.configurationDescription")}
        </p>
      </div>
      {configQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t("common.loading")}
        </div>
      ) : configQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {apiErrorMessage(configQuery.error, t("oauth.configFailed"))}
          </AlertDescription>
        </Alert>
      ) : config ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("oauth.redirectUri")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 text-xs break-all">
                {config.redirect_uri}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyToClipboard(config.redirect_uri)}
              >
                <CopyIcon data-icon="inline-start" />
                {isCopied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("oauth.redirectUriHint")}
            </p>
          </div>

          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={enabledId}>
                  {t("oauth.enabled")}
                </FieldLabel>
              </FieldContent>
              <Switch
                id={enabledId}
                checked={draft.enabled}
                onCheckedChange={(enabled) => update({ enabled })}
                disabled={saving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={authorizationId}>
                {t("oauth.authorizationUrl")}
              </FieldLabel>
              <Input
                id={authorizationId}
                type="url"
                value={draft.authorization_url}
                onChange={(event) =>
                  update({ authorization_url: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={tokenId}>{t("oauth.tokenUrl")}</FieldLabel>
              <Input
                id={tokenId}
                type="url"
                value={draft.token_url}
                onChange={(event) => update({ token_url: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={clientIdId}>
                {t("oauth.clientId")}
              </FieldLabel>
              <Input
                id={clientIdId}
                value={draft.client_id}
                onChange={(event) => update({ client_id: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={secretId}>
                {t("oauth.clientSecret")}
              </FieldLabel>
              <Input
                id={secretId}
                type="password"
                autoComplete="new-password"
                value={draft.client_secret}
                placeholder={
                  config.has_client_secret
                    ? t("oauth.clientSecretConfigured")
                    : undefined
                }
                onChange={(event) =>
                  update({ client_secret: event.target.value })
                }
              />
              <FieldDescription>
                {config.has_client_secret
                  ? t("oauth.clientSecretKeep")
                  : undefined}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={scopeId}>{t("oauth.scope")}</FieldLabel>
              <Input
                id={scopeId}
                value={draft.scope}
                onChange={(event) => update({ scope: event.target.value })}
              />
              <FieldDescription>{t("oauth.scopeHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t("oauth.tokenEndpointAuthMethod")}</FieldLabel>
              <SettingsSelect
                items={AUTH_METHOD_ITEMS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                value={draft.token_endpoint_auth_method}
                onValueChange={(value) => {
                  const method = AUTH_METHOD_ITEMS.find(
                    (item) => item.value === value
                  )?.value
                  if (method) update({ token_endpoint_auth_method: method })
                }}
                disabled={saving}
              >
                <SettingsSelectTrigger className="w-full">
                  <SettingsSelectValue />
                </SettingsSelectTrigger>
                <SettingsSelectContent>
                  <SettingsSelectGroup>
                    {AUTH_METHOD_ITEMS.map((item) => (
                      <SettingsSelectItem key={item.value} value={item.value}>
                        {t(item.label)}
                      </SettingsSelectItem>
                    ))}
                  </SettingsSelectGroup>
                </SettingsSelectContent>
              </SettingsSelect>
            </Field>
          </FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" className="self-end" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </form>
      ) : null}
    </section>
  )
}
