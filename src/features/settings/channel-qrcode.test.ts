import { describe, expect, it } from "vitest"

import { qrcodeSvgMarkup } from "@/features/settings/channel-qrcode-svg"

describe("qrcodeSvgMarkup", () => {
  it("renders dingTalk and QQ bind URLs as sized SVG", () => {
    const dingtalk = qrcodeSvgMarkup(
      "https://open-dev.dingtalk.com/openapp/registration/openClaw?user_code=NXHA-4PKH-PETX&source=OPEN_CLAW"
    )
    const qq = qrcodeSvgMarkup(
      "https://q.qq.com/qqbot/openclaw/connect.html?task_id=700bfffc-763f-4aff-8b57-251d5f55b4e0&source=ai-buddy&_wv=2"
    )
    expect(dingtalk.startsWith("<svg ")).toBe(true)
    expect(dingtalk).toContain('width="192"')
    expect(dingtalk).toContain('height="192"')
    expect(qq.startsWith("<svg ")).toBe(true)
    expect(qq).toContain('width="192"')
  })
})
