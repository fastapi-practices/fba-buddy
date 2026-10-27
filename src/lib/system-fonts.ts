/** 系统字体枚举：走 Local Font Access API 取已安装字体族，拿不到时退回空列表 */

type LocalFontData = { family?: string }

let cache: string[] | null = null

export async function listSystemFontFamilies(): Promise<string[]> {
  if (cache) {
    return cache
  }
  const queryLocalFonts = (
    window as unknown as {
      queryLocalFonts?: () => Promise<LocalFontData[]>
    }
  ).queryLocalFonts
  if (!queryLocalFonts) {
    return []
  }
  try {
    const fonts = await queryLocalFonts()
    const families = new Set<string>()
    for (const font of fonts) {
      const family = font.family?.trim()
      if (family) {
        families.add(family)
      }
    }
    cache = [...families].sort((a, b) => a.localeCompare(b))
    return cache
  } catch {
    /* 权限被拒或环境不支持时不缓存，下次挂载还有机会重试 */
    return []
  }
}
