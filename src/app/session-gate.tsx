import { useSyncExternalStore, type ReactNode } from "react"

import { BuddyLogo } from "@/features/shell/BuddyLogo"
import { useSessionStore } from "@/lib/session"

function subscribeHydration(onStoreChange: () => void) {
  if (useSessionStore.persist.hasHydrated()) {
    return () => {}
  }
  return useSessionStore.persist.onFinishHydration(onStoreChange)
}

function getHydrated() {
  return useSessionStore.persist.hasHydrated()
}

export function SessionGate({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribeHydration, getHydrated, () => false)

  if (!ready) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <BuddyLogo className="size-8" />
        FbaBuddy
      </div>
    )
  }

  return children
}
