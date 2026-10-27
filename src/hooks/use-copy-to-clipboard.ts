"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "@/components/ui/toast"
import { useT } from "@/hooks/use-t"

export type UseCopyToClipboardOptions = {
  copiedDuration?: number
}

export const useCopyToClipboard = ({
  copiedDuration = 3000,
}: UseCopyToClipboardOptions = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const t = useT()
  useEffect(() => () => clearTimeout(timer.current), [])

  const copyToClipboard = async (value: string): Promise<boolean> => {
    if (!value) return false
    clearTimeout(timer.current)
    setIsCopied(false)
    setCopyError(null)
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard)
        throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(value)
      setIsCopied(true)
      timer.current = setTimeout(() => setIsCopied(false), copiedDuration)
      return true
    } catch {
      const error = t("common.copyFailed")
      setCopyError(error)
      toast.add({ title: error, type: "error" })
      return false
    }
  }

  return { isCopied, copyError, copyToClipboard }
}
