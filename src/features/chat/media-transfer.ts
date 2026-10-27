export async function copyImageSource(src: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Image clipboard unavailable")
  const png = fetch(src).then(async (response) => {
    if (!response.ok)
      throw new Error(`Image request failed: ${response.status}`)
    const blob = await response.blob()
    if (blob.type === "image/png") return blob
    const url = URL.createObjectURL(blob)
    const image = new Image()
    try {
      image.src = url
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Image conversion unavailable")
      context.drawImage(image, 0, 0)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Image conversion failed")),
          "image/png"
        )
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  })
  void png.catch(() => {})
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
}

export async function downloadMediaSource(
  src: string,
  name: string
): Promise<void> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
