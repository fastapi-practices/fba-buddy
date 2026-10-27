import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { initializeAccountSource } from "@/app/account-source"
import { useT } from "@/hooks/use-t"
import { useAccountSourceStore } from "@/lib/account-source"

export function AccountSourceLoading() {
  const t = useT()
  const error = useAccountSourceStore((state) => state.error)
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      {error ? (
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>{t("common.requestFailed")}</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              onClick={() => void initializeAccountSource()}
            >
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Spinner aria-label={t("common.loading")} />
      )}
    </div>
  )
}
