import { QueryClient } from "@tanstack/react-query"

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}
