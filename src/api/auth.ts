import { apiRequest } from "@/api/http"
import { useSessionStore } from "@/lib/session"
import type { CaptchaData, LoginData } from "@/lib/types"

export function getCaptcha() {
  return apiRequest<CaptchaData>("/auth/captcha", {
    skipAuth: true,
    silent: true,
  })
}

export async function login(body: {
  username: string
  password: string
  uuid?: string
  captcha?: string
}) {
  const data = await apiRequest<LoginData>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    skipAuth: true,
    silent: true,
  })
  useSessionStore.getState().setSession({
    accessToken: data.access_token,
    accessTokenExpireTime: data.access_token_expire_time,
    sessionUuid: data.session_uuid,
    user: data.user,
  })
  return data
}

export async function logout() {
  try {
    await apiRequest<null>("/auth/logout", { method: "POST", silent: true })
  } finally {
    useSessionStore.getState().clearSession()
  }
}
