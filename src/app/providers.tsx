import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"

import { createAppQueryClient } from "@/app/query-client"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient)
  useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster>{children}</Toaster>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
