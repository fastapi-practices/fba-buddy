export type AuthUser = {
  id: number
  uuid: string
  username: string
  nickname: string
  avatar: string | null
  email: string | null
  is_superuser: boolean
  is_staff: boolean
  is_multi_login: boolean
}

export type LoginData = {
  access_token: string
  access_token_expire_time: string
  session_uuid: string
  password_expire_days_remaining: number | null
  user: AuthUser
}

export type CaptchaData = {
  is_enabled: boolean
  expire_seconds: number
  uuid: string
  image: string
}

export type RefreshData = {
  access_token: string
  access_token_expire_time: string
  session_uuid: string
}
