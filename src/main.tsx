import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { isBuddyDesktopMac } from "@/lib/desktop-chrome"

if (window.buddyDesktop) {
  document.documentElement.classList.add("is-desktop")
}
if (isBuddyDesktopMac()) {
  document.documentElement.classList.add("is-desktop-mac")
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </StrictMode>
)
