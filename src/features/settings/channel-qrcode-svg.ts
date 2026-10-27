import { renderSVG } from "uqr"

export function qrcodeSvgMarkup(value: string): string {
  const svg = renderSVG(value, {
    border: 2,
    pixelSize: 8,
    whiteColor: "#ffffff",
    blackColor: "#111111",
  })
  return svg.replace("<svg ", '<svg width="192" height="192" ')
}
