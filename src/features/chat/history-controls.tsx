import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"

export function HistoryControls({
  hasOlder,
  loading,
  loadOlder,
}: {
  hasOlder: boolean
  loading: boolean
  loadOlder: () => Promise<boolean>
}) {
  const t = useT()
  const [error, setError] = useState("")
  if (!hasOlder && !error) return null
  return (
    <div className="mx-auto flex w-full max-w-176 flex-wrap justify-center gap-2 px-4 py-1 text-sm">
      {hasOlder && (
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() =>
            void loadOlder().catch((cause) => setError(String(cause)))
          }
        >
          {t(loading ? "common.loading" : "common.loadOlderMessages")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
