import { describe, expect, it } from "vitest"

import {
  fanPose,
  IMAGE_TEMPLATES,
  isFanVisible,
  templateIndexById,
  visibleFanTemplates,
  wrapOffset,
} from "@/features/image/image-templates"

describe("image template fan", () => {
  it("wraps the shortest circular offset", () => {
    expect(wrapOffset(0, 0, 5)).toBe(0)
    expect(wrapOffset(1, 0, 5)).toBe(1)
    expect(wrapOffset(4, 0, 5)).toBe(-1)
    expect(wrapOffset(0, 4, 5)).toBe(1)
    expect(wrapOffset(2, 0, 5)).toBe(2)
    expect(wrapOffset(3, 0, 5)).toBe(-2)
  })

  it("keeps a five-card window around the center", () => {
    expect(isFanVisible(0)).toBe(true)
    expect(isFanVisible(2)).toBe(true)
    expect(isFanVisible(-2)).toBe(true)
    expect(isFanVisible(3)).toBe(false)
  })

  it("tilts side cards and keeps the center upright and unscaled", () => {
    expect(fanPose(0)).toMatchObject({
      rotate: 0,
      rotateY: 0,
      offsetY: 0,
      translateX: 0,
      scale: 1,
      brightness: 1,
    })
    expect(fanPose(-2).rotate).toBe(-16)
    expect(fanPose(1).scale).toBeLessThan(1)
    expect(fanPose(2).offsetY).toBeGreaterThan(fanPose(1).offsetY)
    expect(fanPose(2).brightness).toBeLessThan(fanPose(0).brightness)
  })

  it("finds a template by id", () => {
    expect(templateIndexById(IMAGE_TEMPLATES[2]?.id ?? "")).toBe(2)
    expect(templateIndexById("missing")).toBe(0)
  })

  it("rotates neighboring cards into a five-card window", () => {
    expect(visibleFanTemplates(2).map((item) => item.offset)).toEqual([
      -2, -1, 0, 1, 2,
    ])
    expect(visibleFanTemplates(0).map((item) => item.template.id)).toEqual([
      IMAGE_TEMPLATES.at(-2)?.id,
      IMAGE_TEMPLATES.at(-1)?.id,
      IMAGE_TEMPLATES[0]?.id,
      IMAGE_TEMPLATES[1]?.id,
      IMAGE_TEMPLATES[2]?.id,
    ])
  })
})
