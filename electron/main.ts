import {
  ensureAcpWorkspace,
  resolveLocalLaunch,
  prepareLocalAcp,
  setAcpWorkspaceDir,
  startLocalAcp,
  stopLocalAcp,
  stopLocalAcps,
} from "./local-acp"
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
} from "electron"
import {
  ConversationExecutionProfiles,
  readExecutionSettings,
  writeExecutionSettings,
} from "./desktop-execution-settings"
import { desktopExecutionStatus } from "./desktop-execution-status"
import {
  prepareLocalExecution,
  startLocalExecution,
  stopLocalExecution,
  stopLocalExecutions,
} from "./local-execution"
import { runtimeDownloadFetch } from "./runtime-network"
import { createRuntimeManager } from "./runtimes"
import { HistoryCache } from "./history-cache"
import { registerHistoryCacheIpc } from "./history-cache-ipc"
import {
  accountSourceHash,
  executionProfileKey,
  normalizeAccountSource,
} from "./account-source"
import type { AccountSource } from "../src/shared/account-source"
import type { ProjectWorkspaceRequest } from "../src/shared/project-workspace"
import type { ExecutionSettings } from "../src/shared/execution"
import { ProjectWorkspaces } from "./project-workspace"
import path from "node:path"
import { workspaceRequest, stopWorkspaceCommands } from "./workspace-ipc"
import { openWebPreview } from "./web-preview"
import { openSystemBrowser } from "./system-browser"
import type { WorkspaceRequest } from "../src/shared/workspace"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  DESKTOP_CHANNELS,
  type DesktopNotifyPayload,
  type DesktopSessionPayload,
} from "../src/shared/desktop"
import {
  clearSecureSession,
  loadSecureSession,
  saveSecureSession,
} from "./secure-session"
import { setupAutoUpdate } from "./auto-update"
import { showSystemNotification } from "./system-notify"
import { bindDevToolsShortcuts, installDesktopMenu } from "./devtools"
import { backgroundDesktopSmoke } from "./background-smoke"
import {
  defaultSkillRoots,
  readSkillFiles,
  scanSkillRoots,
} from "./local-skills"
import {
  applyProxy,
  normalizeProxyPayload,
  readDesktopSettings,
  writeDesktopSettings,
} from "./settings"
import {
  createWindowMaterialApplier,
  type WindowMaterialAddon,
} from "./window-material"
import { normalizeDesktopWindowMaterial } from "../src/shared/window-material"
import { desktopPermissionAllowed } from "./permissions"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let historyCacheIpc: ReturnType<typeof registerHistoryCacheIpc> | undefined

if (backgroundDesktopSmoke && process.platform === "darwin") {
  app.setActivationPolicy("accessory")
}

app.setName("FbaBuddy")
/* Windows 通知走 AppUserModelID，不设任务栏通知不显示；与打包 appId 保持一致 */
app.setAppUserModelId("com.fastapi.fba-buddy")

function appIconPath() {
  return path.join(
    __dirname,
    app.isPackaged ? "../../dist/icon.png" : "../../build/icon.png"
  )
}

function loadWindowMaterialAddon(): WindowMaterialAddon | null {
  const addonPath = app.isPackaged
    ? path.resolve(
        process.resourcesPath,
        "..",
        "Frameworks",
        "fba-window-material.node"
      )
    : path.resolve(
        __dirname,
        "../../.electron-runtime/window-material/fba-window-material.node"
      )
  try {
    const addonModule: { exports: Partial<WindowMaterialAddon> } = {
      exports: {},
    }
    process.dlopen(addonModule, addonPath)
    const { setBackgroundBlurRadius } = addonModule.exports
    if (typeof setBackgroundBlurRadius !== "function") {
      throw new Error("setBackgroundBlurRadius export is missing")
    }
    return { setBackgroundBlurRadius }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`窗口背景模糊组件不可用，已保留系统 vibrancy: ${message}`)
    return null
  }
}

const applyWindowMaterial = createWindowMaterialApplier(loadWindowMaterialAddon)

function createWindow() {
  const windowMaterialOptions: BrowserWindowConstructorOptions =
    process.platform === "darwin"
      ? {
          vibrancy: "under-window",
          visualEffectState: "followWindow",
          backgroundColor: "#00000000",
        }
      : {
          backgroundColor: nativeTheme.shouldUseDarkColors
            ? "#181818"
            : "#ffffff",
        }
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "FbaBuddy",
    icon: appIconPath(),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    ...windowMaterialOptions,
    autoHideMenuBar: true,
    show: false,
    focusable: !backgroundDesktopSmoke,
    skipTaskbar: backgroundDesktopSmoke,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !backgroundDesktopSmoke,
      disableDialogs: backgroundDesktopSmoke,
    },
  })

  const ownerId = win.webContents.id
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("destroyed", () => {
    void stopLocalAcps(ownerId)
    void stopLocalExecutions(ownerId)
    void stopWorkspaceCommands(ownerId)
  })
  win.webContents.on("render-process-gone", () => {
    void stopLocalAcps(ownerId)
    void stopLocalExecutions(ownerId)
    void stopWorkspaceCommands(ownerId)
  })
  win.once("ready-to-show", () => {
    if (!backgroundDesktopSmoke) {
      win.show()
      win.focus()
    }
  })
  bindDevToolsShortcuts(win)

  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173"
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "../../dist/index.html"))
  } else {
    void win.loadURL(devUrl)
  }
}

function assertExecutionFrame(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame
  const trusted = app.isPackaged
    ? frame?.url.split(/[?#]/)[0] ===
      pathToFileURL(path.join(__dirname, "../../dist/index.html")).href
    : Boolean(
        frame &&
        new URL(frame.url).origin ===
          new URL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173")
            .origin
      )
  if (frame !== event.sender.mainFrame || !trusted)
    throw new Error("无法从此页面访问桌面执行环境")
}

function registerIpc() {
  ipcMain.handle(DESKTOP_CHANNELS.openExternal, async (event, url: unknown) => {
    assertExecutionFrame(event)
    await openSystemBrowser(url, (address) => shell.openExternal(address))
  })
  ipcMain.handle(
    DESKTOP_CHANNELS.setWindowMaterial,
    (event, rawMaterial: unknown) => {
      assertExecutionFrame(event)
      const material = normalizeDesktopWindowMaterial(rawMaterial)
      const owner = BrowserWindow.fromWebContents(event.sender)
      if (process.platform !== "darwin" || !material || !owner) return false
      return applyWindowMaterial(owner, material)
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.webPreview, async (event, url: unknown) => {
    assertExecutionFrame(event)
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new Error("无法找到网页预览所属窗口")
    await openWebPreview(owner, url)
  })
  const userDataPath = app.getPath("userData")
  const historyCache = new HistoryCache(path.join(userDataPath, "cache"))
  const home = app.getPath("home")
  const configPath = path.join(
    app.getPath("userData"),
    "execution-settings.json"
  )
  const runtimeDirectory = path.join(app.getPath("userData"), "runtimes")
  const requireAccountSource = (value: AccountSource) => {
    const source = normalizeAccountSource(value)
    const user = loadSecureSession()?.user as { id?: unknown } | undefined
    if (user?.id == null || source.accountId !== String(user.id))
      throw new Error("账号数据源不匹配")
    return source
  }
  const checkpointDirectory = (source: AccountSource) =>
    path.join(userDataPath, "checkpoints", accountSourceHash(source))
  const profiles = new ConversationExecutionProfiles(
    path.join(app.getPath("userData"), "execution-profiles.json"),
    home
  )
  const projectWorkspaces = new ProjectWorkspaces(
    path.join(userDataPath, "project-workspaces.json"),
    home
  )
  ipcMain.handle(
    DESKTOP_CHANNELS.projectWorkspace,
    async (event, request: ProjectWorkspaceRequest) => {
      assertExecutionFrame(event)
      if (!request || typeof request !== "object")
        throw new Error("项目目录请求无效")
      const source = requireAccountSource(request.source)
      let directory: string | null
      switch (request.action) {
        case "validate":
          directory = await projectWorkspaces.validateDirectory(
            request.directory
          )
          break
        case "get":
          directory = await projectWorkspaces.get(source, request.projectId)
          break
        case "set":
          directory = await projectWorkspaces.set(
            source,
            request.projectId,
            request.directory
          )
          break
        case "remove":
          directory = await projectWorkspaces.set(
            source,
            request.projectId,
            null
          )
          break
        case "open-folder":
          directory = await projectWorkspaces.openDirectory(
            source,
            request.projectId,
            async (selected) => {
              requireAccountSource(source)
              return shell.openPath(selected)
            }
          )
          break
        case "copy-path":
          directory = await projectWorkspaces.copyDirectoryPath(
            source,
            request.projectId,
            async (selected) => {
              requireAccountSource(source)
              await clipboard.writeText(selected)
            }
          )
          break
        case "bind-conversation":
          directory = await projectWorkspaces.bindConversation(
            source,
            request.projectId,
            request.conversationId,
            profiles
          )
          break
        default:
          throw new Error("项目目录操作无效")
      }
      requireAccountSource(source)
      return { directory }
    }
  )
  historyCacheIpc = registerHistoryCacheIpc(
    ipcMain,
    historyCache,
    assertExecutionFrame,
    requireAccountSource,
    (source, conversationId) =>
      profiles.delete(executionProfileKey(source, conversationId))
  )
  const status = async () =>
    desktopExecutionStatus(await readExecutionSettings(configPath, home), {
      home,
      documents: app.getPath("documents"),
      runtimeDirectory,
    })
  ipcMain.handle(
    DESKTOP_CHANNELS.workspace,
    async (event, request: WorkspaceRequest) => {
      assertExecutionFrame(event)
      if (
        !request ||
        typeof request !== "object" ||
        typeof request.action !== "string"
      )
        throw new Error("会话标识无效")
      const source = requireAccountSource(request.source!)
      if (request.action === "list-worktrees") {
        const worktrees = await profiles.listWorktrees(
          accountSourceHash(source)
        )
        requireAccountSource(source)
        return { worktrees }
      }
      if (
        request.action === "environment" ||
        request.action === "lock-environment" ||
        request.action === "configure-environment"
      ) {
        if (
          request.conversationId !== undefined &&
          (typeof request.conversationId !== "string" ||
            !/^[a-zA-Z0-9_-]{1,128}$/.test(request.conversationId))
        )
          throw new Error("会话标识无效")
        let defaults: ExecutionSettings = await readExecutionSettings(
          configPath,
          home
        )
        if (request.projectId !== undefined) {
          const directory = await projectWorkspaces.get(
            source,
            request.projectId
          )
          if (directory)
            defaults = {
              backend: "local",
              workspaceMode: "custom",
              workspaceDir:
                await projectWorkspaces.validateDirectory(directory),
            }
        }
        const key = request.conversationId
          ? executionProfileKey(source, request.conversationId)
          : undefined
        const environment =
          request.action === "configure-environment"
            ? await profiles.configureEnvironment(
                key!,
                defaults,
                request.mode,
                request.baseBranch,
                request.backend,
                request.sandboxProvider
              )
            : request.action === "lock-environment"
              ? await profiles.lockEnvironment(key!, defaults)
              : await profiles.environment(key, defaults)
        requireAccountSource(source)
        return { environment }
      }
      if ("projectId" in request && request.projectId !== undefined) {
        if (
          request.conversationId !== undefined ||
          ![
            "git-status",
            "git-diff",
            "git-stage",
            "git-unstage",
            "git-commit",
            "checkout-branch",
            "engineering-check",
            "read",
            "read-asset",
            "find-file",
            "reveal",
            "open",
          ].includes(request.action)
        )
          throw new Error("项目工作区操作无效")
        const directory = await projectWorkspaces.get(source, request.projectId)
        if (!directory) throw new Error("项目尚未关联本地目录")
        const workspaceDir =
          await projectWorkspaces.validateDirectory(directory)
        requireAccountSource(source)
        return workspaceRequest(
          event,
          request,
          { backend: "local", workspaceMode: "custom", workspaceDir },
          runtimeDirectory,
          checkpointDirectory(source)
        )
      }
      if (
        typeof request.conversationId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(request.conversationId)
      )
        throw new Error("会话标识无效")
      if (request.action === "handoff-environment") {
        const key = executionProfileKey(source, request.conversationId)
        await profiles.getOrCreate(
          key,
          await readExecutionSettings(configPath, home)
        )
        const environment = await profiles.handoffEnvironment(
          key,
          request.mode,
          request.worktreeName
        )
        requireAccountSource(source)
        return { environment }
      }
      if (request.action === "open-worktree") {
        await profiles.openWorktree(
          executionProfileKey(source, request.conversationId),
          (directory) => shell.openPath(directory)
        )
        requireAccountSource(source)
        return null
      }
      if (
        ["resume-worktree", "remove-worktree", "mark-worktree-active"].includes(
          request.action
        )
      ) {
        const key = executionProfileKey(source, request.conversationId)
        const profile = await profiles.getExisting(key)
        const binding = profile?.worktree ?? profile?.associatedWorktree
        if (!profile || !binding) throw new Error("此对话没有独立 Worktree")
        const { beginWorkspaceWrite } = await import("./workspace-run")
        const release =
          request.action === "remove-worktree"
            ? beginWorkspaceWrite(binding.target)
            : undefined
        let target: typeof profile
        try {
          target = await profiles.manageWorktree(
            key,
            request.action === "remove-worktree"
              ? "remove"
              : request.action === "mark-worktree-active"
                ? "active"
                : "resume",
            request.action === "remove-worktree" && request.force === true
          )
        } finally {
          release?.()
        }
        requireAccountSource(source)
        return request.action === "resume-worktree"
          ? {
              worktree: {
                path: target.workspaceDir,
                head: target.worktree!.head,
                sourcePath: target.worktree!.sourceRepo,
                branch: target.worktree!.branch,
              },
            }
          : null
      }
      const config = await profiles.getOrCreate(
        executionProfileKey(source, request.conversationId),
        await readExecutionSettings(configPath, home)
      )
      if (config.worktreeIntent)
        throw new Error("Worktree 尚未创建，发送首条消息后再操作工作区文件")
      if (request.action === "fork-profile") {
        if (
          typeof request.targetConversationId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(request.targetConversationId)
        )
          throw new Error("目标会话标识无效")
        await profiles.fork(
          executionProfileKey(source, request.conversationId),
          executionProfileKey(source, request.targetConversationId)
        )
        requireAccountSource(source)
        return null
      }
      return workspaceRequest(
        event,
        request,
        config,
        runtimeDirectory,
        checkpointDirectory(source)
      )
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.getExecutionStatus, async (event) => {
    assertExecutionFrame(event)
    return status()
  })
  let settingsWrite = Promise.resolve()
  ipcMain.handle(
    DESKTOP_CHANNELS.setExecutionSettings,
    async (event, config: unknown) => {
      assertExecutionFrame(event)
      const operation = settingsWrite.then(async () => {
        await writeExecutionSettings(configPath, config, home)
        return status()
      })
      settingsWrite = operation.then(
        () => {},
        () => {}
      )
      return operation
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.chooseExecutionWorkspace, async (event) => {
    assertExecutionFrame(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("桌面窗口不可用")
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: (await readExecutionSettings(configPath, home)).workspaceDir,
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(
    DESKTOP_CHANNELS.installRuntime,
    async (event, name: unknown) => {
      assertExecutionFrame(event)
      if (name !== "python" && name !== "node")
        throw new Error("运行时名称无效")
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error("桌面窗口不可用")
      const confirmation = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["取消", "安装"],
        defaultId: 0,
        cancelId: 0,
        title: "安装编码运行时",
        message: `下载并安装 ${name === "node" ? "Node.js" : "Python"}？`,
        detail: "运行时将保存在应用数据目录，仅使用固定版本并校验 SHA256",
      })
      if (confirmation.response === 1)
        await createRuntimeManager({
          directory: runtimeDirectory,
          fetch: runtimeDownloadFetch,
        }).install(name)
      return status()
    }
  )
  ipcMain.handle(
    DESKTOP_CHANNELS.prepareExecution,
    async (
      event,
      conversationId: unknown,
      _defaults: unknown,
      requestedSource: AccountSource
    ) => {
      assertExecutionFrame(event)
      if (
        typeof conversationId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId)
      )
        throw new Error("会话标识无效")
      const source = requireAccountSource(requestedSource)
      const key = executionProfileKey(source, conversationId)
      let config = await profiles.getOrCreate(key, {
        ...(await readExecutionSettings(configPath, home)),
      })
      if (config.backend === "sandbox")
        return {
          backend: "sandbox" as const,
          ...(config.sandboxProvider
            ? { sandboxProvider: config.sandboxProvider }
            : {}),
        }
      config = await profiles.materialize(key)
      return prepareLocalExecution(
        config,
        event.sender.id,
        checkpointDirectory(source)
      )
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.startExecution, async (event, payload) => {
    assertExecutionFrame(event)
    await startLocalExecution(payload, event.sender.id, runtimeDirectory)
  })
  ipcMain.handle(
    DESKTOP_CHANNELS.stopExecution,
    async (event, bridgeId: unknown) => {
      assertExecutionFrame(event)
      if (typeof bridgeId !== "string") throw new Error("执行连接标识无效")
      await stopLocalExecution(bridgeId, event.sender.id)
    }
  )
  ipcMain.handle(
    DESKTOP_CHANNELS.prepareAcp,
    async (
      event,
      config,
      conversationId: unknown,
      requestedSource: AccountSource
    ) => {
      assertExecutionFrame(event)
      const source = requireAccountSource(requestedSource)
      let cwd: string
      let worktree:
        import("./workspace-worktree").WorkspaceWorktreeBinding | undefined
      if (conversationId !== undefined) {
        if (
          typeof conversationId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId)
        )
          throw new Error("会话标识无效")
        const key = executionProfileKey(source, conversationId)
        const existing = await profiles.getExisting(key)
        if (existing?.backend === "sandbox")
          throw new Error("当前对话绑定云端工作区，请新建对话使用本地 Agent")
        if (!existing)
          await profiles.getOrCreate(key, {
            ...(await readExecutionSettings(configPath, home)),
            backend: "local",
          })
        const profile = await profiles.materialize(key)
        cwd = profile.workspaceDir
        worktree = profile.worktree
      } else {
        cwd = await ensureAcpWorkspace()
      }
      const launch = await resolveLocalLaunch(config, cwd)
      requireAccountSource(source)
      return prepareLocalAcp({
        owner: event.sender.id,
        account: accountSourceHash(source),
        config: { command: launch.command, args: launch.args, cwd: launch.cwd },
        checkpointDirectory: conversationId
          ? checkpointDirectory(source)
          : undefined,
        worktree,
      })
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.startAcp, async (event, payload) => {
    const frame = event.senderFrame
    const trusted = app.isPackaged
      ? frame?.url.split(/[?#]/)[0] ===
        pathToFileURL(path.join(__dirname, "../../dist/index.html")).href
      : Boolean(
          frame &&
          new URL(frame.url).origin ===
            new URL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173")
              .origin
        )
    if (frame !== event.sender.mainFrame || !trusted)
      throw new Error("无法从此页面启动本地 Agent")
    const source = requireAccountSource(payload.source)
    await startLocalAcp(payload, event.sender.id, accountSourceHash(source))
  })
  ipcMain.handle(DESKTOP_CHANNELS.stopAcp, (event, bridgeId: string) =>
    stopLocalAcp(bridgeId, event.sender.id)
  )
  ipcMain.handle(DESKTOP_CHANNELS.getSettings, () => {
    const stored = readDesktopSettings()
    return {
      openAtLogin: app.getLoginItemSettings().openAtLogin,
      proxyMode: stored.proxyMode,
      proxyUrl: stored.proxyUrl,
      updateUrl: stored.updateUrl,
    }
  })

  ipcMain.handle(
    DESKTOP_CHANNELS.setOpenAtLogin,
    (_event, openAtLogin: unknown) => {
      const enabled = openAtLogin === true
      app.setLoginItemSettings({ openAtLogin: enabled })
      writeDesktopSettings({
        ...readDesktopSettings(),
        openAtLogin: enabled,
      })
      return app.getLoginItemSettings().openAtLogin
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.setProxy,
    async (_event, payload: { mode?: unknown; url?: unknown }) => {
      const next = {
        ...readDesktopSettings(),
        ...normalizeProxyPayload(payload ?? {}),
      }
      writeDesktopSettings(next)
      await applyProxy(next)
      return true
    }
  )

  ipcMain.handle(DESKTOP_CHANNELS.isFocused, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return Boolean(win && !win.isDestroyed() && win.isFocused())
  })

  ipcMain.handle(
    DESKTOP_CHANNELS.notify,
    (event, payload: DesktopNotifyPayload) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const delivered = showSystemNotification({
        title:
          typeof payload?.title === "string" && payload.title.trim()
            ? payload.title
            : "FbaBuddy",
        body: typeof payload?.body === "string" ? payload.body : "回复已完成",
        onClick: () => {
          if (backgroundDesktopSmoke || !win || win.isDestroyed()) {
            return
          }
          if (win.isMinimized()) {
            win.restore()
          }
          win.show()
          win.focus()
        },
      })
      if (
        delivered &&
        !backgroundDesktopSmoke &&
        process.platform === "darwin" &&
        app.dock &&
        win &&
        !win.isDestroyed() &&
        !win.isFocused()
      ) {
        app.dock.bounce("informational")
      }
      return delivered
    }
  )

  ipcMain.handle(DESKTOP_CHANNELS.loadSession, () => loadSecureSession())
  ipcMain.handle(
    DESKTOP_CHANNELS.saveSession,
    (_event, payload: DesktopSessionPayload) => {
      saveSecureSession(payload)
      return true
    }
  )
  ipcMain.handle(DESKTOP_CHANNELS.clearSession, () => {
    clearSecureSession()
    return true
  })

  ipcMain.handle(DESKTOP_CHANNELS.scanLocalSkills, () => {
    return scanSkillRoots(defaultSkillRoots())
  })

  ipcMain.handle(
    DESKTOP_CHANNELS.readLocalSkill,
    (_event, skillPath: unknown) => {
      if (typeof skillPath !== "string" || !skillPath.trim()) {
        throw new Error("技能路径无效")
      }
      return readSkillFiles(skillPath)
    }
  )
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (backgroundDesktopSmoke) return
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.show()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    if (backgroundDesktopSmoke && process.platform === "darwin") app.dock?.hide()
    const settings = readDesktopSettings()
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
    await applyProxy(settings)

    setAcpWorkspaceDir(path.join(app.getPath("home"), ".fbabuddy", "acp"))
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(desktopPermissionAllowed(permission))
      }
    )
    /* 多数 Web API 先做权限检查再发请求，两个 hook 都接上才算完整放行 */
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => desktopPermissionAllowed(permission)
    )

    registerIpc()
    installDesktopMenu()
    createWindow()
    void setupAutoUpdate()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

let acpShutdownComplete = false
app.on("before-quit", (event) => {
  if (acpShutdownComplete) return
  event.preventDefault()
  historyCacheIpc?.close()
  void Promise.allSettled([
    stopLocalAcps(),
    stopLocalExecutions(),
    stopWorkspaceCommands(),
  ]).finally(() => {
    acpShutdownComplete = true
    app.quit()
  })
})
