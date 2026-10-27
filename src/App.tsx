import { useEffect } from "react"
import { HashRouter, Navigate, useLocation } from "react-router"
import { useQueryClient } from "@tanstack/react-query"

import { NavigationBinder } from "@/app/navigation-binder"
import { AppProviders } from "@/app/providers"
import { SessionGate } from "@/app/session-gate"
import { ErrorBoundary } from "@/components/error-boundary"
import { ThemeCustomizationBinder } from "@/components/theme-customization-binder"
import { LoginPage } from "@/features/auth/LoginPage"
import { loginReturnPath } from "@/features/auth/require-session"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { WorkspaceShell } from "@/features/shell/WorkspaceShell"
import {
  applyCodeFontSize,
  applyLocale,
  applyUiFontSize,
} from "@/lib/general-settings"
import { useSessionStore } from "@/lib/session"
import { initializeAccountSource } from "@/app/account-source"
import { useAccountSourceStore } from "@/lib/account-source"
import { AccountSourceLoading } from "@/components/account-source-status"

function WorkspaceAccess() {
  const accessToken = useSessionStore((state) => state.accessToken)
  const location = useLocation()
  if (location.pathname === "/auth/login") {
    return accessToken ? (
      <Navigate to={loginReturnPath(location.search)} replace />
    ) : (
      <LoginPage />
    )
  }
  return accessToken ? <WorkspaceShell /> : <LoginPage />
}

function HistoryCacheConnectivity() {
  const client = useQueryClient()
  useEffect(() => {
    const online = () => {
      void client.invalidateQueries()
    }
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [client])
  return null
}

function App() {
  const source = useAccountSourceStore()
  const account = useSessionStore((state) =>
    String(state.user?.id ?? "anonymous")
  )
  const locale = usePrefsStore((state) => state.locale)
  const uiFontSize = usePrefsStore((state) => state.uiFontSize)
  const codeFontSize = usePrefsStore((state) => state.codeFontSize)

  useEffect(() => {
    void initializeAccountSource()
  }, [])

  useEffect(() => {
    applyLocale(locale)
    applyUiFontSize(uiFontSize)
    applyCodeFontSize(codeFontSize)
  }, [locale, uiFontSize, codeFontSize])

  return (
    <HashRouter key={source.epoch}>
      <AppProviders key={source.epoch}>
        <ThemeCustomizationBinder />
        <HistoryCacheConnectivity />
        <NavigationBinder />
        <SessionGate>
          {!source.ready || source.account !== account ? (
            <AccountSourceLoading />
          ) : (
            <ErrorBoundary>
              <WorkspaceAccess />
            </ErrorBoundary>
          )}
        </SessionGate>
      </AppProviders>
    </HashRouter>
  )
}

export default App
