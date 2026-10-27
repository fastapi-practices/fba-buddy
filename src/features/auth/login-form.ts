import { z } from "zod"

export function loginFormSchema(options: {
  captchaEnabled: boolean
  captchaExpired: boolean
}) {
  return z
    .object({
      username: z.string().trim().min(1, "common.enterYourUsername"),
      password: z.string().min(1, "common.enterYourPassword"),
      captcha: z.string(),
    })
    .superRefine((value, ctx) => {
      if (!options.captchaEnabled) {
        return
      }
      if (options.captchaExpired) {
        ctx.addIssue({
          code: "custom",
          path: ["captcha"],
          message: "common.captchaExpiredPleaseRefresh",
        })
        return
      }
      if (!value.captcha.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["captcha"],
          message: "common.enterTheCaptcha",
        })
      }
    })
}
