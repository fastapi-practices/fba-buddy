import { qrcodeSvgMarkup } from "@/features/settings/channel-qrcode-svg"

import { qrcodeImageSrc, qrcodePageUrl } from "@/features/settings/channel-bind"

export function ChannelQrcodeImage({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const imageSrc = qrcodeImageSrc(value)
  const pageUrl = qrcodePageUrl(value)
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={label}
        className="size-48 rounded-lg bg-white object-contain p-2"
      />
    )
  }
  return (
    <div
      className="flex size-48 items-center justify-center overflow-hidden rounded-lg bg-white p-2 [&_svg]:size-full"
      role="img"
      aria-label={label}
      data-page-url={pageUrl ?? undefined}
      dangerouslySetInnerHTML={{ __html: qrcodeSvgMarkup(value) }}
    />
  )
}
