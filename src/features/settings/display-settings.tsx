import { CopyIcon, DownloadIcon } from "lucide-react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  SettingsSelect,
  SettingsSelectContent,
  SettingsSelectGroup,
  SettingsSelectItem,
  SettingsSelectTrigger,
  SettingsSelectValue,
} from "@/features/settings/settings-select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  SettingsBlock,
  SettingsCard,
  SettingsPageHeader,
  SETTINGS_ROW_CLASS,
} from "@/features/settings/settings-card"
import { usePrefsStore } from "@/features/shell/prefs-store"
import { useT } from "@/hooks/use-t"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import {
  codexFieldsFromTheme,
  codexThemeFromFields,
  parseCodexThemeV1,
  serializeCodexThemeV1,
} from "@/lib/codex-theme"
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_STEPS,
  uiFontSizeStepIndex,
} from "@/lib/general-settings"
import { notifyError } from "@/lib/notify"
import { listSystemFontFamilies } from "@/lib/system-fonts"
import {
  effectiveThemeColors,
  isWindowBlurUnavailable,
  presetColorsFor,
  resolveCssHex,
  resolveThemeVariant,
  subscribeWindowBlurStatus,
  THEME_CONTRAST_MAX,
  THEME_CONTRAST_MIN,
  THEME_PRESETS,
  UI_FONT_STYLE_OPTIONS,
} from "@/lib/theme-custom"
import { cn } from "@/lib/utils"
import {
  VIBRANCY_EQUIVALENT_BLUR_RADIUS,
  WINDOW_TRANSLUCENCY_BLUR_MAX,
  WINDOW_TRANSLUCENCY_BLUR_MIN,
  WINDOW_TRANSLUCENCY_OPACITY_MAX,
  WINDOW_TRANSLUCENCY_OPACITY_MIN,
  type WindowTranslucency,
} from "@/shared/window-material"

/** 字体下拉里的「无自定义」哨兵值，SettingsSelect 不用空字符串做值 */
const FONT_NONE = "__none__"

export function DisplaySettings() {
  const t = useT()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const [importOpen, setImportOpen] = useState(false)
  const density = usePrefsStore((state) => state.density)
  const setDensity = usePrefsStore((state) => state.setDensity)
  const uiFontSize = usePrefsStore((state) => state.uiFontSize)
  const setUiFontSize = usePrefsStore((state) => state.setUiFontSize)
  const codeFontSize = usePrefsStore((state) => state.codeFontSize)
  const setCodeFontSize = usePrefsStore((state) => state.setCodeFontSize)
  const themeId = usePrefsStore((state) => state.themeId)
  const setThemeId = usePrefsStore((state) => state.setThemeId)
  const themeOpaqueWindows = usePrefsStore((state) => state.themeOpaqueWindows)
  const setThemeOpaqueWindows = usePrefsStore(
    (state) => state.setThemeOpaqueWindows
  )
  const windowTranslucency = usePrefsStore((state) => state.windowTranslucency)
  const setWindowTranslucency = usePrefsStore(
    (state) => state.setWindowTranslucency
  )
  const themeAccent = usePrefsStore((state) => state.themeAccent)
  const setThemeAccent = usePrefsStore((state) => state.setThemeAccent)
  const themeBackground = usePrefsStore((state) => state.themeBackground)
  const setThemeBackground = usePrefsStore((state) => state.setThemeBackground)
  const themeForeground = usePrefsStore((state) => state.themeForeground)
  const setThemeForeground = usePrefsStore((state) => state.setThemeForeground)
  const themeFont = usePrefsStore((state) => state.themeFont)
  const setThemeFont = usePrefsStore((state) => state.setThemeFont)
  const themeUiFontStyle = usePrefsStore((state) => state.themeUiFontStyle)
  const setThemeUiFontStyle = usePrefsStore(
    (state) => state.setThemeUiFontStyle
  )
  const themeContentFont = usePrefsStore((state) => state.themeContentFont)
  const setThemeContentFont = usePrefsStore(
    (state) => state.setThemeContentFont
  )
  const themeCodeFont = usePrefsStore((state) => state.themeCodeFont)
  const setThemeCodeFont = usePrefsStore((state) => state.setThemeCodeFont)
  const themeContrast = usePrefsStore((state) => state.themeContrast)
  const setThemeContrast = usePrefsStore((state) => state.setThemeContrast)
  const themeDiffAdded = usePrefsStore((state) => state.themeDiffAdded)
  const setThemeDiffAdded = usePrefsStore((state) => state.setThemeDiffAdded)
  const themeDiffRemoved = usePrefsStore((state) => state.themeDiffRemoved)
  const setThemeDiffRemoved = usePrefsStore(
    (state) => state.setThemeDiffRemoved
  )
  const themeDirectiveColor = usePrefsStore(
    (state) => state.themeDirectiveColor
  )
  const setThemeDirectiveColor = usePrefsStore(
    (state) => state.setThemeDirectiveColor
  )

  const [fontFamilies, setFontFamilies] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void listSystemFontFamilies().then((families) => {
      if (alive) {
        setFontFamilies(families)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  /* 预设色组是颜色行的默认值，界面输入框显示的当前色以它为准 */
  const presetColors = presetColorsFor(themeId, resolvedTheme)

  const fontOptions = useMemo(
    () => fontFamilies.map((family) => ({ value: family, label: family })),
    [fontFamilies]
  )

  function copyTheme() {
    const state = usePrefsStore.getState()
    const variant = resolveThemeVariant(theme)
    const colors = effectiveThemeColors(
      {
        themeAccent: state.themeAccent,
        themeBackground: state.themeBackground,
        themeForeground: state.themeForeground,
        themeFont: state.themeFont,
        themeUiFontStyle: state.themeUiFontStyle,
        themeContentFont: state.themeContentFont,
        themeCodeFont: state.themeCodeFont,
        themeContrast: state.themeContrast,
        themeDiffAdded: state.themeDiffAdded,
        themeDiffRemoved: state.themeDiffRemoved,
        themeDirectiveColor: state.themeDirectiveColor,
      },
      presetColorsFor(state.themeId, variant)
    )
    const config = codexThemeFromFields(
      {
        themeAccent: colors.accent,
        themeAccentSource: "",
        themeBackground: colors.background,
        themeForeground: colors.foreground,
        themeContrast: state.themeContrast,
        themeFont: state.themeFont,
        themeCodeFont: state.themeCodeFont,
        themeDiffAdded: colors.diffAdded,
        themeDiffRemoved: colors.diffRemoved,
        themeDirectiveColor: colors.directive,
        themeOpaqueWindows: state.themeOpaqueWindows,
        themeCodeThemeId: state.themeCodeThemeId,
      },
      variant
    )
    copyToClipboard(serializeCodexThemeV1(config))
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsPageHeader
        title={t("common.appearance")}
        action={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <DownloadIcon strokeWidth={1.75} />
              {t("common.importTheme")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={copyTheme}
            >
              <CopyIcon strokeWidth={1.75} />
              {isCopied ? t("common.copied") : t("common.copyTheme")}
            </Button>
          </>
        }
      />
      <SettingsBlock title={t("common.display")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel id="setting-mode">{t("common.mode")}</FieldLabel>
            </FieldContent>
            <ModeOptionCards value={theme} onChange={setTheme} />
          </Field>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel id="setting-density">
                {t("common.density")}
              </FieldLabel>
            </FieldContent>
            <ToggleGroup
              variant="default"
              size="sm"
              spacing={2}
              className="text-muted-foreground"
              value={[density]}
              onValueChange={(value) => {
                const next = value[0]
                if (next === "default" || next === "compact") {
                  setDensity(next)
                }
              }}
              aria-labelledby="setting-density"
            >
              <ToggleGroupItem value="default">
                {t("common.default")}
              </ToggleGroupItem>
              <ToggleGroupItem value="compact">
                {t("common.compact")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel id="setting-window-material">
                {t("common.window")}
              </FieldLabel>
            </FieldContent>
            <ToggleGroup
              variant="default"
              size="sm"
              spacing={2}
              className="text-muted-foreground"
              value={[themeOpaqueWindows ? "solid" : "translucent"]}
              onValueChange={(value) => {
                const next = value[0]
                if (next === "solid" || next === "translucent") {
                  setThemeOpaqueWindows(next === "solid")
                }
              }}
              aria-labelledby="setting-window-material"
            >
              <ToggleGroupItem value="solid">
                {t("common.solid")}
              </ToggleGroupItem>
              <ToggleGroupItem value="translucent">
                {t("common.translucent")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {!themeOpaqueWindows ? (
            <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
              <FieldContent>
                <FieldLabel htmlFor="setting-window-sidebar-only">
                  {t("common.sidebarOnly")}
                </FieldLabel>
              </FieldContent>
              <Switch
                id="setting-window-sidebar-only"
                checked={windowTranslucency.sidebarOnly}
                onCheckedChange={(checked) =>
                  setWindowTranslucency({ sidebarOnly: checked })
                }
              />
            </Field>
          ) : null}
          {!themeOpaqueWindows ? (
            <WindowValueSliderRow
              inputId="setting-window-opacity"
              label={t("common.opacity")}
              value={windowTranslucency.opacity}
              min={WINDOW_TRANSLUCENCY_OPACITY_MIN}
              max={WINDOW_TRANSLUCENCY_OPACITY_MAX}
              suffix="%"
              onChange={(opacity) => setWindowTranslucency({ opacity })}
            />
          ) : null}
          {!themeOpaqueWindows ? (
            <WindowBlurRow
              value={windowTranslucency.blur}
              onChange={(blur) => setWindowTranslucency({ blur })}
            />
          ) : null}
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock title={t("common.colors")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="setting-theme">
                {t("common.theme")}
              </FieldLabel>
            </FieldContent>
            <SettingsSelect
              items={THEME_PRESETS.map((preset) => ({
                label: preset.name,
                value: preset.id,
              }))}
              value={themeId}
              onValueChange={(value) => {
                if (value) {
                  setThemeId(value)
                }
              }}
            >
              <SettingsSelectTrigger id="setting-theme">
                <SettingsSelectValue />
              </SettingsSelectTrigger>
              <SettingsSelectContent>
                <SettingsSelectGroup>
                  {THEME_PRESETS.map((preset) => {
                    const colors = presetColorsFor(preset.id, resolvedTheme)
                    return (
                      <SettingsSelectItem key={preset.id} value={preset.id}>
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 items-center gap-1"
                        >
                          {[
                            colors.background,
                            colors.foreground,
                            colors.accent,
                          ].map((color, index) => (
                            <span
                              key={index}
                              className="size-3 rounded-full ring-1 ring-foreground/15"
                              style={{ backgroundColor: color ?? undefined }}
                            />
                          ))}
                        </span>
                        <span>{preset.name}</span>
                      </SettingsSelectItem>
                    )
                  })}
                </SettingsSelectGroup>
              </SettingsSelectContent>
            </SettingsSelect>
          </Field>
          <ColorFieldRow
            inputId="setting-theme-accent"
            label={t("common.accentColor")}
            value={themeAccent}
            presetColor={presetColors.accent}
            defaultCss="var(--link)"
            onCommit={setThemeAccent}
          />
          <ColorFieldRow
            inputId="setting-theme-background"
            label={t("common.background")}
            value={themeBackground}
            presetColor={presetColors.background}
            defaultCss="var(--background)"
            onCommit={setThemeBackground}
          />
          <ColorFieldRow
            inputId="setting-theme-foreground"
            label={t("common.foreground")}
            value={themeForeground}
            presetColor={presetColors.foreground}
            defaultCss="var(--foreground)"
            onCommit={setThemeForeground}
          />
        </SettingsCard>
        <SettingsCard>
          <ContrastRow value={themeContrast} onChange={setThemeContrast} />
          <ColorFieldRow
            inputId="setting-diff-added"
            label={t("common.diffAdded")}
            value={themeDiffAdded}
            presetColor={presetColors.diffAdded}
            defaultCss="var(--diff-added)"
            onCommit={setThemeDiffAdded}
          />
          <ColorFieldRow
            inputId="setting-diff-removed"
            label={t("common.diffRemoved")}
            value={themeDiffRemoved}
            presetColor={presetColors.diffRemoved}
            defaultCss="var(--diff-removed)"
            onCommit={setThemeDiffRemoved}
          />
          <ColorFieldRow
            inputId="setting-directive-color"
            label={t("common.directiveColor")}
            value={themeDirectiveColor}
            presetColor={presetColors.directive}
            defaultCss="var(--directive, var(--link))"
            onCommit={setThemeDirectiveColor}
          />
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock title={t("common.font")}>
        <SettingsCard>
          <SettingsSelectRow
            inputId="setting-theme-font"
            label={t("common.font")}
            value={themeFont ?? FONT_NONE}
            options={[
              { value: FONT_NONE, label: t("usage.system") },
              ...fontOptions,
            ]}
            onChange={(next) => setThemeFont(next === FONT_NONE ? null : next)}
          />
          <SettingsSelectRow
            inputId="setting-ui-font-style"
            label={t("common.uiFontStyle")}
            value={themeUiFontStyle ?? "regular"}
            options={UI_FONT_STYLE_OPTIONS.map((option) => ({
              value: option.id,
              label: t(option.label),
            }))}
            onChange={setThemeUiFontStyle}
          />
          <SettingsSelectRow
            inputId="setting-content-font"
            label={t("common.contentFont")}
            value={themeContentFont ?? FONT_NONE}
            options={[
              { value: FONT_NONE, label: t("common.matchUiFont") },
              ...fontOptions,
            ]}
            onChange={(next) =>
              setThemeContentFont(next === FONT_NONE ? null : next)
            }
          />
          <SettingsSelectRow
            inputId="setting-code-font"
            label={t("common.codeFont")}
            value={themeCodeFont ?? FONT_NONE}
            options={[
              { value: FONT_NONE, label: t("common.monospace") },
              ...fontOptions,
            ]}
            onChange={(next) =>
              setThemeCodeFont(next === FONT_NONE ? null : next)
            }
          />
        </SettingsCard>
      </SettingsBlock>
      <SettingsBlock title={t("common.fontSizes")}>
        <SettingsCard>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="ui-font-size">
                {t("common.uiFontSize")}
              </FieldLabel>
            </FieldContent>
            <FontSizeSlider value={uiFontSize} onChange={setUiFontSize} />
          </Field>
          <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
            <FieldContent>
              <FieldLabel htmlFor="code-font-size">
                {t("common.codeFontSize")}
              </FieldLabel>
            </FieldContent>
            <Input
              id="code-font-size"
              className="w-20"
              type="number"
              min={CODE_FONT_SIZE_MIN}
              max={CODE_FONT_SIZE_MAX}
              value={codeFontSize}
              onChange={(event) => setCodeFontSize(Number(event.target.value))}
            />
          </Field>
        </SettingsCard>
      </SettingsBlock>
      <ThemeImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

/** 导入主题对话框：粘贴 codex-theme-v1 配置一次性应用 */
function ThemeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const { setTheme } = useTheme()
  const [text, setText] = useState("")

  function changeOpen(next: boolean) {
    if (!next) {
      setText("")
    }
    onOpenChange(next)
  }

  function submit() {
    const parsed = parseCodexThemeV1(text)
    if (!parsed) {
      notifyError(t("common.invalidThemeConfig"))
      return
    }
    usePrefsStore.getState().setThemeFromCodex(codexFieldsFromTheme(parsed))
    setTheme(parsed.variant)
    changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.importTheme")}</DialogTitle>
          <DialogDescription>
            {t("hints.pasteACodexThemeV1ConfigToApplyAllColorsAndFonts")}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-40 font-mono"
          placeholder='codex-theme-v1:{"codeThemeId":"codex","theme":{...},"variant":"dark"}'
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => changeOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={submit}>
            {t("common.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MODE_OPTIONS = [
  { value: "light", label: "common.light" },
  { value: "dark", label: "common.dark" },
  { value: "system", label: "common.system" },
] as const

type ModeOptionValue = (typeof MODE_OPTIONS)[number]["value"]

/** 模式选择：缩略图形式的浅色 / 深色 / 跟随系统 */
function ModeOptionCards({
  value,
  onChange,
}: {
  value: ModeOptionValue
  onChange: (mode: ModeOptionValue) => void
}) {
  const t = useT()
  return (
    <div role="radiogroup" className="flex items-center gap-3">
      {MODE_OPTIONS.map((option) => (
        <ModeThumbnail
          key={option.value}
          mode={option.value}
          label={t(option.label)}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  )
}

function ModeThumbnail({
  mode,
  label,
  selected,
  onSelect,
}: {
  mode: ModeOptionValue
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors outline-none",
        selected
          ? "border-ring ring-2 ring-ring/40"
          : "border-border hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      <WindowMock mode={mode} />
      <span className="text-xs">{label}</span>
    </button>
  )
}

function WindowMock({ mode }: { mode: ModeOptionValue }) {
  return (
    <div className="flex h-12 w-[4.5rem] overflow-hidden rounded-md border border-border">
      {mode === "system" ? (
        <>
          <WindowPane tone="light" />
          <WindowPane tone="dark" />
        </>
      ) : (
        <WindowPane tone={mode} />
      )}
    </div>
  )
}

function WindowPane({ tone }: { tone: "light" | "dark" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        tone === "dark" ? "bg-zinc-800" : "bg-white"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-0.5 px-1 py-1",
          tone === "dark" ? "bg-zinc-700" : "bg-zinc-100"
        )}
      >
        <span className="size-1 rounded-full bg-zinc-400" />
        <span className="size-1 rounded-full bg-zinc-400" />
        <span className="size-1 rounded-full bg-zinc-400" />
      </div>
      <div className="flex flex-1 gap-1 p-1">
        <div
          className={cn(
            "w-1/3 rounded-[2px]",
            tone === "dark" ? "bg-zinc-600" : "bg-zinc-300"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={cn(
              "h-1 rounded-[2px]",
              tone === "dark" ? "bg-zinc-600" : "bg-zinc-300"
            )}
          />
          <div
            className={cn(
              "h-1 w-2/3 rounded-[2px]",
              tone === "dark" ? "bg-zinc-600" : "bg-zinc-300"
            )}
          />
        </div>
      </div>
    </div>
  )
}

/** 通用下拉设置行 */
function SettingsSelectRow({
  inputId,
  label,
  value,
  options,
  onChange,
}: {
  inputId: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      </FieldContent>
      <SettingsSelect
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next) {
            onChange(next)
          }
        }}
      >
        <SettingsSelectTrigger
          id={inputId}
          title={options.find((option) => option.value === value)?.label}
        >
          <SettingsSelectValue />
        </SettingsSelectTrigger>
        <SettingsSelectContent>
          <SettingsSelectGroup>
            {options.map((option) => (
              <SettingsSelectItem key={option.value} value={option.value}>
                {option.label}
              </SettingsSelectItem>
            ))}
          </SettingsSelectGroup>
        </SettingsSelectContent>
      </SettingsSelect>
    </Field>
  )
}

/**
 * 颜色输入行：取色块 + hex 输入框恒显当前生效色（自定义 → 预设 → 样式表）
 * 不做撤销变更，自定义后提供「恢复默认」回到默认色
 */
function ColorFieldRow({
  inputId,
  label,
  value,
  presetColor,
  defaultCss,
  onCommit,
}: {
  inputId: string
  label: string
  value: string | null
  presetColor: string | null
  defaultCss: string
  onCommit: (value: string | null) => void
}) {
  const t = useT()
  const [cssHex, setCssHex] = useState("#888888")
  useEffect(() => {
    const update = () => setCssHex(resolveCssHex(defaultCss) ?? "#888888")
    const frame = requestAnimationFrame(update)
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [defaultCss])
  const shownHex = value ?? presetColor ?? cssHex
  const [text, setText] = useState(shownHex)
  const [lastShown, setLastShown] = useState(shownHex)
  /* 外部色值变化时同步草稿，渲染期派生替代 effect 回填 */
  if (shownHex !== lastShown) {
    setLastShown(shownHex)
    setText(shownHex)
  }

  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      </FieldContent>
      <div className="flex items-center gap-2">
        <span
          className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border"
          style={{ backgroundColor: shownHex }}
        >
          <input
            type="color"
            aria-label={label}
            value={shownHex}
            onChange={(event) => onCommit(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
        <Input
          id={inputId}
          value={text}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            if (/^#[0-9a-fA-F]{6}$/.test(next)) {
              onCommit(next)
            }
          }}
          onBlur={() => setText(shownHex)}
          className="w-24 font-mono"
          spellCheck={false}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {t("common.restoreDefaults")}
          </button>
        ) : null}
      </div>
    </Field>
  )
}

function WindowValueSliderRow({
  inputId,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  inputId: string
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      </FieldContent>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <Slider
            id={inputId}
            min={min}
            max={max}
            step={1}
            value={value}
            thumbProps={{
              "aria-label": label,
              "aria-valuetext": `${value}${suffix}`,
            }}
            onValueChange={(next) => {
              const nextValue = Array.isArray(next) ? next[0] : next
              if (typeof nextValue === "number") onChange(nextValue)
            }}
          />
        </div>
        <span className="w-12 text-right text-sm text-muted-foreground tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
    </Field>
  )
}

function WindowBlurRow({
  value,
  onChange,
}: {
  value: WindowTranslucency["blur"]
  onChange: (blur: WindowTranslucency["blur"]) => void
}) {
  const t = useT()
  const unavailable = useSyncExternalStore(
    subscribeWindowBlurStatus,
    isWindowBlurUnavailable
  )
  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel htmlFor="setting-window-blur">
          {t("common.blur")}
        </FieldLabel>
      </FieldContent>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-3 max-sm:justify-start">
        {value !== null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(null)}
          >
            {unavailable ? t("common.windowBlurUnavailable") : t("common.auto")}
          </Button>
        ) : null}
        <div className="w-40">
          <Slider
            id="setting-window-blur"
            min={WINDOW_TRANSLUCENCY_BLUR_MIN}
            max={WINDOW_TRANSLUCENCY_BLUR_MAX}
            step={1}
            value={value ?? VIBRANCY_EQUIVALENT_BLUR_RADIUS}
            thumbProps={{
              "aria-label": t("common.blur"),
              "aria-valuetext":
                value === null ? t("common.auto") : String(value),
            }}
            onValueChange={(next) => {
              const blur = Array.isArray(next) ? next[0] : next
              if (typeof blur === "number") onChange(blur)
            }}
          />
        </div>
        <span className="w-12 text-right text-sm text-muted-foreground tabular-nums">
          {value === null ? t("common.auto") : value}
        </span>
      </div>
    </Field>
  )
}

function ContrastRow({
  value,
  onChange,
}: {
  value: number
  onChange: (contrast: number) => void
}) {
  const t = useT()
  return (
    <Field orientation="horizontal" className={SETTINGS_ROW_CLASS}>
      <FieldContent>
        <FieldLabel htmlFor="setting-theme-contrast">
          {t("common.contrast")}
        </FieldLabel>
      </FieldContent>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <Slider
            id="setting-theme-contrast"
            min={THEME_CONTRAST_MIN}
            max={THEME_CONTRAST_MAX}
            step={1}
            value={value}
            onValueChange={(next) => {
              const contrast = Array.isArray(next) ? next[0] : next
              if (typeof contrast === "number") {
                onChange(contrast)
              }
            }}
          />
        </div>
        <span className="w-8 text-right text-sm text-muted-foreground tabular-nums">
          {value}
        </span>
      </div>
    </Field>
  )
}

/** 六档字号滑条：默认标签对齐第二档，细轨道与竖向滑块保持轻量 */
function FontSizeSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (size: number) => void
}) {
  const t = useT()
  const index = uiFontSizeStepIndex(value)
  const defaultIndex = uiFontSizeStepIndex(UI_FONT_SIZE_DEFAULT)
  return (
    <div className="flex w-56 max-w-full shrink-0 flex-col gap-1">
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between"
        >
          {UI_FONT_SIZE_STEPS.map((step, stepIndex) => (
            <span
              key={step}
              data-font-size-step={stepIndex}
              className={cn(
                "h-1 w-px rounded-full",
                stepIndex <= index
                  ? "bg-foreground/80"
                  : "bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
        <Slider
          id="ui-font-size"
          variant="stepped"
          min={0}
          max={UI_FONT_SIZE_STEPS.length - 1}
          step={1}
          value={index}
          thumbProps={{
            "aria-label": t("common.uiFontSize"),
            getAriaValueText: (_formatted, stepIndex) =>
              `${stepIndex + 1} / ${UI_FONT_SIZE_STEPS.length}${
                stepIndex === defaultIndex ? `, ${t("common.default")}` : ""
              }`,
          }}
          onValueChange={(next) => {
            const stepIndex = Array.isArray(next) ? next[0] : next
            const size =
              typeof stepIndex === "number"
                ? UI_FONT_SIZE_STEPS[stepIndex]
                : undefined
            if (size) {
              onChange(size)
            }
          }}
        />
      </div>
      <div className="relative h-5 text-xs leading-5 text-muted-foreground">
        <span className="absolute left-0 -translate-x-1/2">
          {t("common.small")}
        </span>
        <span
          data-font-size-label="default"
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${(defaultIndex / (UI_FONT_SIZE_STEPS.length - 1)) * 100}%`,
          }}
        >
          {t("common.default")}
        </span>
        <span className="absolute right-0 translate-x-1/2">
          {t("common.large")}
        </span>
      </div>
    </div>
  )
}
