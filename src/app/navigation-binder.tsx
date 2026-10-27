import { useEffect } from "react"
import { useNavigate } from "react-router"

import { bindAppNavigate } from "@/app/navigation"
import { useAccountSourceStore } from "@/lib/account-source"

export function NavigationBinder() {
  const navigate = useNavigate()

  useEffect(() => {
    bindAppNavigate((path, options) => {
      const { account } = useAccountSourceStore.getState()
      navigate(path, {
        ...options,
        state: {
          buddyAccount: account,
        },
      })
    })
    return () => bindAppNavigate(null)
  }, [navigate])

  return null
}
