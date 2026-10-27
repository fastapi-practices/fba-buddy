import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { AppProviders } from "@/app/providers"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeCustomizationBinder } from "@/components/theme-customization-binder"
import { usePrefsStore } from "@/features/shell/prefs-store"
import {
  applyCodeFontSize,
  applyLocale,
  applyUiFontSize,
} from "@/lib/general-settings"
import { pauseSourcePersistence } from "@/lib/account-source"
import { useSessionStore } from "@/lib/session"
import { initializeAccountSource } from "@/app/account-source"
import { useComposerStore } from "@/features/chat/composer-store"
import { installLocalPreviewApi } from "./local-api"
import { installLocalPreviewDesktop } from "./desktop-stub"
import { RenderingPreview } from "./preview"
import "@/index.css"

installLocalPreviewApi()
// 预览页跑在浏览器里，补上桌面能力才能看到工作位置、分支与 Worktree 菜单
installLocalPreviewDesktop()
pauseSourcePersistence(true)
// 预览会话只存在当前页面内存中，不写入或覆盖用户登录信息
useSessionStore.persist.setOptions({
  storage: {
    getItem: async () => null,
    setItem: () => {},
    removeItem: () => {},
  },
})
await useSessionStore.persist.rehydrate()
useSessionStore.setState({ accessToken: "local-rendering-preview", user: null })
// 预览页按已登录账号处理，接口才会真正发起请求，菜单里才有真实条目
await initializeAccountSource()
useComposerStore.setState({
  provider_id: 1,
  model_id: "gpt-5",
  enabledAcpRunners: ["claude_code", "codex"],
})
// 上下文用量默认关闭，预览页打开才看得到输入框上的用量指示
usePrefsStore.setState({ showContextUsage: true })

const preferences = usePrefsStore.getState()
applyLocale(preferences.locale)
applyUiFontSize(preferences.uiFontSize)
applyCodeFontSize(preferences.codeFontSize)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme="dark"
      storageKey="fba-buddy.rendering-preview.theme"
    >
      <ThemeCustomizationBinder />
      <MemoryRouter>
        <AppProviders>
          <RenderingPreview />
        </AppProviders>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>
)
