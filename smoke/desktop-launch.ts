export function desktopSmokeEnvironment(baseURL: string, headless = true) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "ELECTRON_RUN_AS_NODE"
    )
  )
  delete env.FBA_BUDDY_UPDATE_URL
  env.FBA_BUDDY_SMOKE_BACKGROUND = headless ? "1" : "0"
  env.VITE_DEV_SERVER_URL = baseURL
  return env
}

export function desktopSmokeBootstrap(profile: string) {
  return `
import { app, BrowserWindow, dialog, Notification, shell } from "electron"
app.setPath("userData", ${JSON.stringify(profile)})
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined })
dialog.showMessageBox = async (...args) => ({ response: args.at(-1)?.cancelId ?? 1, checkboxChecked: false })
dialog.showOpenDialogSync = () => undefined
dialog.showSaveDialogSync = () => undefined
dialog.showMessageBoxSync = (...args) => args.at(-1)?.cancelId ?? 1
dialog.showErrorBox = () => {}
Notification.prototype.show = () => {}
BrowserWindow.prototype.flashFrame = () => {}
if (app.dock) app.dock.bounce = () => 0
shell.openExternal = async () => {}
shell.openPath = async () => ""
shell.showItemInFolder = () => {}
`
}
