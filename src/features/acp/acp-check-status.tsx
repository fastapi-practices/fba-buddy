import { CheckCircle2Icon, CircleDashedIcon, CircleXIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import type { AcpCheckResult } from "@/lib/types/acp"

export type AcpCheckState = {
  key: string
  checking: boolean
  result?: AcpCheckResult
  error?: string
  checkedAt?: number
}

export function AcpCheckStatus({ check }: { check?: AcpCheckState }) {
  const t = useT()
  const available = check?.result?.available
  return (
    <Badge
      variant={available === false || check?.error ? "destructive" : "outline"}
      className={cn(
        check?.checking &&
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
        !check?.checking &&
          available === true &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      )}
    >
      {check?.checking ? (
        <Spinner />
      ) : available === true ? (
        <CheckCircle2Icon />
      ) : available === false || check?.error ? (
        <CircleXIcon />
      ) : (
        <CircleDashedIcon />
      )}
      {check?.checking
        ? t("common.checking")
        : check?.error
          ? t("common.checkFailed")
          : available === true
            ? t("common.connected")
            : available === false
              ? t("common.unavailable")
              : t("common.notChecked")}
    </Badge>
  )
}

export function AcpCheckDetail({ check }: { check?: AcpCheckState }) {
  const t = useT()
  if (
    check?.checking ||
    (!check?.error && check?.result?.available !== false)
  ) {
    return null
  }

  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {check.error ??
        (check.result?.message ||
          t("common.connectionUnavailableCheckTheConfiguration"))}
    </p>
  )
}
