import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron"

import { shouldToggleDevTools } from "./devtools-keys"
import { backgroundDesktopSmoke } from "./background-smoke"



function toggleDevTools(win: BrowserWindow) {
  if (!backgroundDesktopSmoke) {
    win.webContents.toggleDevTools()
  } else if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools()
  } else {
    win.webContents.openDevTools({ mode: "bottom", activate: false })
  }
}

export function installDesktopMenu() {
  const isMac = process.platform === "darwin"
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        {
          label: "Toggle Developer Tools",
          click: (_item, focusedWindow) => {
            if (focusedWindow instanceof BrowserWindow) {
              toggleDevTools(focusedWindow)
            }
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function bindDevToolsShortcuts(win: BrowserWindow) {
  win.webContents.on("before-input-event", (event, input) => {
    if (!shouldToggleDevTools(input, process.platform)) {
      return
    }
    event.preventDefault()
    toggleDevTools(win)
  })
}
