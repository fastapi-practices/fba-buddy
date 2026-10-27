import { contextBridge, ipcRenderer } from "electron"

import {
  DESKTOP_CHANNELS,
  type BuddyDesktopApi,
  type DesktopNotifyPayload,
  type DesktopProxyMode,
  type DesktopSessionPayload,
} from "../src/shared/desktop"
import type { DesktopWindowMaterial } from "../src/shared/window-material"

const buddyDesktop: BuddyDesktopApi = {
  openWebPreview: (url) => ipcRenderer.invoke(DESKTOP_CHANNELS.webPreview, url),
  openExternal: (url) => ipcRenderer.invoke(DESKTOP_CHANNELS.openExternal, url),
  historyCache: (request) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.historyCache, request),
  workspace: (request) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.workspace, request),
  projectWorkspace: (request) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.projectWorkspace, request),
  getExecutionStatus: (defaults) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.getExecutionStatus, defaults),
  setExecutionSettings: (config) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.setExecutionSettings, config),
  chooseExecutionWorkspace: () =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.chooseExecutionWorkspace),
  installRuntime: (name) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.installRuntime, name),
  prepareExecution: (conversationId, defaults, source) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.prepareExecution,
      conversationId,
      defaults,
      source
    ),
  startExecution: (payload) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.startExecution, payload),
  stopExecution: (bridgeId) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.stopExecution, bridgeId),
  prepareAcp: (config, conversationId, source) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.prepareAcp,
      config,
      conversationId,
      source
    ),
  startAcp: (payload) => ipcRenderer.invoke(DESKTOP_CHANNELS.startAcp, payload),
  stopAcp: (bridgeId) => ipcRenderer.invoke(DESKTOP_CHANNELS.stopAcp, bridgeId),
  platform: process.platform,
  getDesktopSettings: () => ipcRenderer.invoke(DESKTOP_CHANNELS.getSettings),
  setOpenAtLogin: (openAtLogin: boolean) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.setOpenAtLogin, openAtLogin),
  setProxy: (payload: { mode: DesktopProxyMode; url: string }) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.setProxy, payload),
  setWindowMaterial: (material: DesktopWindowMaterial) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.setWindowMaterial, material),
  isWindowFocused: () => ipcRenderer.invoke(DESKTOP_CHANNELS.isFocused),
  notify: (payload: DesktopNotifyPayload) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.notify, payload),
  loadSession: () => ipcRenderer.invoke(DESKTOP_CHANNELS.loadSession),
  saveSession: (payload: DesktopSessionPayload) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.saveSession, payload),
  clearSession: () => ipcRenderer.invoke(DESKTOP_CHANNELS.clearSession),
  scanLocalSkills: () => ipcRenderer.invoke(DESKTOP_CHANNELS.scanLocalSkills),
  readLocalSkill: (skillPath: string) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.readLocalSkill, skillPath),
}

contextBridge.exposeInMainWorld("buddyDesktop", buddyDesktop)
