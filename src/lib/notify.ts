import { toast } from "@/components/ui/toast"

const shown = new Map<string, string>()

export function notifyError(message: string, extra?: { description?: string }) {
  const text = message.trim()
  if (!text || typeof document === "undefined") {
    return
  }
  const key = extra?.description ? `${text}\n${extra.description}` : text
  const id = toast.add({
    id: shown.get(key),
    title: text,
    description: extra?.description,
    type: "error",
    timeout: 5000,
    onRemove: () => {
      if (shown.get(key) === id) shown.delete(key)
    },
  })
  shown.set(key, id)
}
