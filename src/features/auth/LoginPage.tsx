import { useCallback, useEffect, useRef, useState } from "react"
import { Controller } from "react-hook-form"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { FormFieldError } from "@/components/form-field-error"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { TooltipHint } from "@/components/ui/tooltip"
import { LoginCharacters } from "@/features/auth/LoginCharacters"
import { getCaptcha, login } from "@/features/auth/api"
import { loginFormSchema } from "@/features/auth/login-form"
import { BuddyLogo } from "@/features/shell/BuddyLogo"
import { useT } from "@/hooks/use-t"
import { useZodForm } from "@/hooks/use-zod-form"
import { isBuddyDesktopMac } from "@/lib/desktop-chrome"
import { ApiError } from "@/api/http"
import { cn } from "@/lib/utils"

export function LoginPage() {
  const t = useT()
  const [showPassword, setShowPassword] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)
  const [captchaImage, setCaptchaImage] = useState("")
  const [captchaUuid, setCaptchaUuid] = useState("")
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [captchaExpired, setCaptchaExpired] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useZodForm(loginFormSchema({ captchaEnabled, captchaExpired }), {
    defaultValues: {
      username: "",
      password: "",
      captcha: "",
    },
  })
  const password = form.watch("password")
  const setCaptchaValue = form.setValue
  const captchaTimerRef = useRef<number | null>(null)
  const captchaLoadingRef = useRef(false)

  const clearCaptchaTimer = useCallback(() => {
    if (captchaTimerRef.current != null) {
      window.clearTimeout(captchaTimerRef.current)
      captchaTimerRef.current = null
    }
  }, [])

  const loadCaptcha = useCallback(async () => {
    if (captchaLoadingRef.current) {
      return
    }
    captchaLoadingRef.current = true
    setCaptchaLoading(true)
    try {
      const data = await getCaptcha()
      setCaptchaEnabled(data.is_enabled)
      setCaptchaUuid(data.uuid)
      setCaptchaImage(data.image)
      setCaptchaValue("captcha", "")
      setCaptchaExpired(false)
      clearCaptchaTimer()
      if (!data.is_enabled) {
        return
      }
      const ttlMs = Math.max(data.expire_seconds, 0) * 1000
      if (ttlMs === 0) {
        setCaptchaExpired(true)
        return
      }
      captchaTimerRef.current = window.setTimeout(() => {
        setCaptchaExpired(true)
      }, ttlMs)
    } finally {
      captchaLoadingRef.current = false
      setCaptchaLoading(false)
    }
  }, [clearCaptchaTimer, setCaptchaValue])

  const refreshCaptcha = useCallback(() => {
    void loadCaptcha().catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : t("common.couldNotLoadCaptcha")
      )
    })
  }, [loadCaptcha, t])

  useEffect(() => {
    refreshCaptcha()
    return clearCaptchaTimer
  }, [clearCaptchaTimer, refreshCaptcha])

  async function onSubmit(values: {
    username: string
    password: string
    captcha: string
  }) {
    setError(null)
    try {
      await login({
        username: values.username,
        password: values.password,
        uuid: captchaEnabled ? captchaUuid : undefined,
        captcha: captchaEnabled ? values.captcha : undefined,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.signInFailed"))
      refreshCaptcha()
    }
  }

  const captchaSrc = captchaImage.startsWith("data:")
    ? captchaImage
    : `data:image/png;base64,${captchaImage}`

  return (
    <div className="electron-drag grid min-h-svh bg-[var(--app-content-surface)] lg:grid-cols-2">
      <section className="electron-no-drag relative hidden overflow-hidden bg-muted lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 70% 20%, color-mix(in oklch, #6C3FF5 22%, transparent), transparent 42%), radial-gradient(circle at 20% 80%, color-mix(in oklch, #FF9B6B 20%, transparent), transparent 46%)",
          }}
        />
        <div
          className={cn(
            "electron-drag shrink-0",
            isBuddyDesktopMac() ? "h-20" : "h-10"
          )}
          aria-hidden
        />
        <div
          className={cn(
            "electron-drag relative flex items-center gap-2 pr-8 pb-4",
            isBuddyDesktopMac() ? "pl-[88px]" : "pl-8"
          )}
        >
          <BuddyLogo className="size-8" />
          <span className="text-sm font-medium">FbaBuddy</span>
        </div>
        <div className="relative flex flex-1 items-center justify-center px-8">
          <LoginCharacters
            isTyping={usernameFocused}
            showPassword={showPassword}
            passwordLength={password.length}
          />
        </div>
      </section>

      <section className="electron-no-drag flex items-center justify-center p-6 lg:p-10">
        <form
          onSubmit={(event) => {
            void form.handleSubmit((values) => onSubmit(values))(event)
          }}
          className="flex w-full max-w-sm flex-col gap-8"
        >
          <div className="flex flex-col gap-2">
            <BuddyLogo className="mb-3 size-8 lg:hidden" />
            <h1 className="font-heading text-2xl font-medium tracking-tight">
              {t("common.welcomeBack")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("common.signInWithYourExistingFbaAccount")}
            </p>
          </div>
          <FieldGroup>
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="username">
                    {t("common.username")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="username"
                    required
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => {
                      field.onBlur()
                      setUsernameFocused(false)
                    }}
                    autoComplete="username"
                    placeholder={t("common.enterYourUsername")}
                    aria-invalid={fieldState.invalid || undefined}
                  />
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="password">
                    {t("common.password")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="password"
                      required
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={t("common.enterYourPassword")}
                      aria-invalid={fieldState.invalid || undefined}
                    />
                    <InputGroupAddon align="inline-end">
                      <TooltipHint
                        label={
                          showPassword
                            ? t("common.hidePassword")
                            : t("common.showPassword")
                        }
                        side="top"
                      >
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          aria-label={
                            showPassword
                              ? t("common.hidePassword")
                              : t("common.showPassword")
                          }
                          onClick={() => setShowPassword((open) => !open)}
                        >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </InputGroupButton>
                      </TooltipHint>
                    </InputGroupAddon>
                  </InputGroup>
                  <FormFieldError fieldState={fieldState} />
                </Field>
              )}
            />
            {captchaEnabled ? (
              <Controller
                name="captcha"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={
                      captchaExpired || fieldState.invalid || undefined
                    }
                  >
                    <FieldLabel htmlFor="captcha">
                      {t("common.captcha")}
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        {...field}
                        id="captcha"
                        required
                        autoComplete="off"
                        placeholder={t("common.enterTheCaptcha")}
                        aria-invalid={
                          captchaExpired || fieldState.invalid || undefined
                        }
                        className="w-auto min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={
                          captchaExpired
                            ? t("common.captchaExpiredClickToRefresh")
                            : t("common.clickToRefreshCaptcha")
                        }
                        className="relative h-10 w-[120px] shrink-0 overflow-hidden p-0"
                        disabled={captchaLoading}
                        onClick={refreshCaptcha}
                      >
                        {captchaLoading ? (
                          <Skeleton className="size-full rounded-none" />
                        ) : captchaImage ? (
                          <>
                            <img
                              src={captchaSrc}
                              alt={t("common.captcha")}
                              className={cn(
                                "h-full w-full object-contain",
                                captchaExpired && "opacity-40"
                              )}
                            />
                            {captchaExpired ? (
                              <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs">
                                {t("common.expiredClickToRefresh")}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          t("common.clickToRefresh")
                        )}
                      </Button>
                    </div>
                    <FormFieldError fieldState={fieldState} />
                  </Field>
                )}
              />
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            {form.formState.isSubmitting
              ? t("common.signingIn")
              : t("common.signIn")}
          </Button>
        </form>
      </section>
    </div>
  )
}
