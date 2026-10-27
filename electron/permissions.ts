/**
 * Electron 会话权限白名单
 *
 * local-fonts 给设置页字体下拉枚举系统已安装字体，Electron 类型未含此字面量
 * clipboard-sanitized-write 给复制消息、代码和图片写系统剪贴板
 */
const ALLOWED_DESKTOP_PERMISSIONS = new Set<string>([
  "local-fonts",
  "clipboard-sanitized-write",
])

export function desktopPermissionAllowed(permission: string): boolean {
  return ALLOWED_DESKTOP_PERMISSIONS.has(permission)
}
