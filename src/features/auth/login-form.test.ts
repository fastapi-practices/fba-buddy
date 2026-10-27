import { describe, expect, it } from "vitest"

import { loginFormSchema } from "@/features/auth/login-form"

describe("loginFormSchema", () => {
  it("requires username and password", () => {
    const result = loginFormSchema({
      captchaEnabled: false,
      captchaExpired: false,
    }).safeParse({
      username: "  ",
      password: "",
      captcha: "",
    })
    expect(result.success).toBe(false)
  })

  it("requires captcha when enabled", () => {
    const result = loginFormSchema({
      captchaEnabled: true,
      captchaExpired: false,
    }).safeParse({
      username: "admin",
      password: "secret",
      captcha: "  ",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an expired captcha", () => {
    const result = loginFormSchema({
      captchaEnabled: true,
      captchaExpired: true,
    }).safeParse({
      username: "admin",
      password: "secret",
      captcha: "ab12",
    })
    expect(result.success).toBe(false)
  })
})
