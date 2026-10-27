import type { ThemePresetColors, ThemePresetDef } from "./theme-custom"

type PaletteSeed = {
  accent: string
  background: string
  foreground: string
  diffAdded: string
  diffRemoved: string
  directive: string
}

type ThemePresetSeed = {
  id: string
  name: string
  light: PaletteSeed
  dark: PaletteSeed
}

/** 参考 Synara 色系，补充缺失模式并调整链接、引用标记和差异文字的对比度 */
const SYNARA_THEME_SEEDS: readonly ThemePresetSeed[] = [
  {
    id: "ayu",
    name: "Ayu",
    light: {
      accent: "#9e671e",
      background: "#fafafa",
      foreground: "#575f66",
      diffAdded: "#4b8000",
      diffRemoved: "#c2414a",
      directive: "#8c5fb0",
    },
    dark: {
      accent: "#e6b450",
      background: "#0b0e14",
      foreground: "#bfbdb6",
      diffAdded: "#7fd962",
      diffRemoved: "#ea6c73",
      directive: "#cda1fa",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    light: {
      accent: "#8839ef",
      background: "#eff1f5",
      foreground: "#4c4f69",
      diffAdded: "#317b21",
      diffRemoved: "#d20f39",
      directive: "#8839ef",
    },
    dark: {
      accent: "#cba6f7",
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      diffAdded: "#a6e3a1",
      diffRemoved: "#f38ba8",
      directive: "#cba6f7",
    },
  },
  {
    id: "synara",
    name: "Synara",
    light: {
      accent: "#c74614",
      background: "#ffffff",
      foreground: "#0d0d0d",
      diffAdded: "#008836",
      diffRemoved: "#e02e2a",
      directive: "#751ed9",
    },
    dark: {
      accent: "#f2612d",
      background: "#111111",
      foreground: "#fcfcfc",
      diffAdded: "#00a240",
      diffRemoved: "#e3413d",
      directive: "#b06dff",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    light: {
      accent: "#aa3e7c",
      background: "#f8f8f2",
      foreground: "#282a36",
      diffAdded: "#287d45",
      diffRemoved: "#c53b3b",
      directive: "#8856bb",
    },
    dark: {
      accent: "#ff79c6",
      background: "#282a36",
      foreground: "#f8f8f2",
      diffAdded: "#50fa7b",
      diffRemoved: "#ff5555",
      directive: "#ff79c6",
    },
  },
  {
    id: "everforest",
    name: "Everforest",
    light: {
      accent: "#62773c",
      background: "#fdf6e3",
      foreground: "#5c6a72",
      diffAdded: "#687701",
      diffRemoved: "#c44341",
      directive: "#a9508d",
    },
    dark: {
      accent: "#a7c080",
      background: "#2d353b",
      foreground: "#d3c6aa",
      diffAdded: "#a7c080",
      diffRemoved: "#e67e80",
      directive: "#d699b6",
    },
  },
  {
    id: "github",
    name: "GitHub",
    light: {
      accent: "#0969da",
      background: "#ffffff",
      foreground: "#1f2328",
      diffAdded: "#1a7f37",
      diffRemoved: "#cf222e",
      directive: "#8250df",
    },
    dark: {
      accent: "#2f79ec",
      background: "#0d1117",
      foreground: "#e6edf3",
      diffAdded: "#3fb950",
      diffRemoved: "#f85149",
      directive: "#bc8cff",
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    light: {
      accent: "#3d7679",
      background: "#fbf1c7",
      foreground: "#3c3836",
      diffAdded: "#3c3836",
      diffRemoved: "#cc241d",
      directive: "#9c5676",
    },
    dark: {
      accent: "#63999b",
      background: "#282828",
      foreground: "#ebdbb2",
      diffAdded: "#ebdbb2",
      diffRemoved: "#dd6e6a",
      directive: "#be7d9b",
    },
  },
  {
    id: "linear",
    name: "Linear",
    light: {
      accent: "#5e6ad2",
      background: "#fcfcfd",
      foreground: "#1b1b1b",
      diffAdded: "#41823f",
      diffRemoved: "#c94446",
      directive: "#7e5ed4",
    },
    dark: {
      accent: "#6b74d0",
      background: "#0f0f11",
      foreground: "#e3e4e6",
      diffAdded: "#69c967",
      diffRemoved: "#ff7e78",
      directive: "#c2a1ff",
    },
  },
  {
    id: "lobster",
    name: "Lobster",
    light: {
      accent: "#c2393f",
      background: "#fff5f3",
      foreground: "#2d2730",
      diffAdded: "#15803d",
      diffRemoved: "#c2393f",
      directive: "#2563eb",
    },
    dark: {
      accent: "#ff5c5c",
      background: "#111827",
      foreground: "#e4e4e7",
      diffAdded: "#22c55e",
      diffRemoved: "#ff5c5c",
      directive: "#3b82f6",
    },
  },
  {
    id: "material",
    name: "Material",
    light: {
      accent: "#00796b",
      background: "#fafafa",
      foreground: "#263238",
      diffAdded: "#4d7e2b",
      diffRemoved: "#c62828",
      directive: "#8e24aa",
    },
    dark: {
      accent: "#80cbc4",
      background: "#212121",
      foreground: "#eeffff",
      diffAdded: "#c3e88d",
      diffRemoved: "#f07178",
      directive: "#c792ea",
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    light: {
      accent: "#167533",
      background: "#f0fff4",
      foreground: "#173b23",
      diffAdded: "#167533",
      diffRemoved: "#bc302d",
      directive: "#167533",
    },
    dark: {
      accent: "#1eff5a",
      background: "#040805",
      foreground: "#b8ffca",
      diffAdded: "#1eff5a",
      diffRemoved: "#fa423e",
      directive: "#1eff5a",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    light: {
      accent: "#706849",
      background: "#faf9f5",
      foreground: "#272822",
      diffAdded: "#50751d",
      diffRemoved: "#b51d57",
      directive: "#7957b2",
    },
    dark: {
      accent: "#99947c",
      background: "#272822",
      foreground: "#f8f8f2",
      diffAdded: "#86b42b",
      diffRemoved: "#d76e93",
      directive: "#9d81d0",
    },
  },
  {
    id: "night-owl",
    name: "Night Owl",
    light: {
      accent: "#476d88",
      background: "#fbfbfb",
      foreground: "#403f53",
      diffAdded: "#587b1f",
      diffRemoved: "#c73c3b",
      directive: "#8d55b7",
    },
    dark: {
      accent: "#82aaff",
      background: "#011627",
      foreground: "#d6deeb",
      diffAdded: "#c5e478",
      diffRemoved: "#ef5350",
      directive: "#c792ea",
    },
  },
  {
    id: "notion",
    name: "Notion",
    light: {
      accent: "#2d77c5",
      background: "#ffffff",
      foreground: "#37352f",
      diffAdded: "#008000",
      diffRemoved: "#a31515",
      directive: "#0000ff",
    },
    dark: {
      accent: "#3585d9",
      background: "#191919",
      foreground: "#d9d9d8",
      diffAdded: "#4ec9b0",
      diffRemoved: "#fa423e",
      directive: "#3585d9",
    },
  },
  {
    id: "one",
    name: "One",
    light: {
      accent: "#4b66eb",
      background: "#fafafa",
      foreground: "#383a42",
      diffAdded: "#29823b",
      diffRemoved: "#c44a3f",
      directive: "#4b66eb",
    },
    dark: {
      accent: "#7193d6",
      background: "#282c34",
      foreground: "#abb2bf",
      diffAdded: "#8cc265",
      diffRemoved: "#e56f79",
      directive: "#c770e1",
    },
  },
  {
    id: "oscurange",
    name: "Oscurange",
    light: {
      accent: "#a95e25",
      background: "#fff7f0",
      foreground: "#332c29",
      diffAdded: "#1a8247",
      diffRemoved: "#bd3430",
      directive: "#2767bd",
    },
    dark: {
      accent: "#f9b98c",
      background: "#0b0b0f",
      foreground: "#e6e6e6",
      diffAdded: "#40c977",
      diffRemoved: "#fa423e",
      directive: "#479ffa",
    },
  },
  {
    id: "proof",
    name: "Proof",
    light: {
      accent: "#3d755d",
      background: "#f5f3ed",
      foreground: "#2f312d",
      diffAdded: "#3d755d",
      diffRemoved: "#ba2623",
      directive: "#5c67bc",
    },
    dark: {
      accent: "#83b99c",
      background: "#202720",
      foreground: "#e2e7dc",
      diffAdded: "#83b99c",
      diffRemoved: "#ed7770",
      directive: "#9fa9ed",
    },
  },
  {
    id: "raycast",
    name: "Raycast",
    light: {
      accent: "#c74d4d",
      background: "#ffffff",
      foreground: "#030303",
      diffAdded: "#006b4f",
      diffRemoved: "#b12424",
      directive: "#9a1b6e",
    },
    dark: {
      accent: "#ff6363",
      background: "#101010",
      foreground: "#fefefe",
      diffAdded: "#59d499",
      diffRemoved: "#ff6363",
      directive: "#d342a1",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    light: {
      accent: "#9d5f5c",
      background: "#faf4ed",
      foreground: "#575279",
      diffAdded: "#45767f",
      diffRemoved: "#6f6c87",
      directive: "#7a6890",
    },
    dark: {
      accent: "#ea9a97",
      background: "#232136",
      foreground: "#e0def4",
      diffAdded: "#9ccfd8",
      diffRemoved: "#908caa",
      directive: "#c4a7e7",
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    light: {
      accent: "#6344d5",
      background: "#fbf9ff",
      foreground: "#362c48",
      diffAdded: "#177f71",
      diffRemoved: "#c73732",
      directive: "#6344d5",
    },
    dark: {
      accent: "#9581f8",
      background: "#2d2935",
      foreground: "#e6dff9",
      diffAdded: "#8ee6d7",
      diffRemoved: "#fb5b57",
      directive: "#9581f8",
    },
  },
  {
    id: "temple",
    name: "Temple",
    light: {
      accent: "#757600",
      background: "#f5fae9",
      foreground: "#234137",
      diffAdded: "#1b8144",
      diffRemoved: "#bc3731",
      directive: "#757600",
    },
    dark: {
      accent: "#e4f222",
      background: "#02120c",
      foreground: "#c7e6da",
      diffAdded: "#40c977",
      diffRemoved: "#fa423e",
      directive: "#e4f222",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    light: {
      accent: "#34548a",
      background: "#d5d6db",
      foreground: "#343b58",
      diffAdded: "#33635c",
      diffRemoved: "#8c4351",
      directive: "#5a4a78",
    },
    dark: {
      accent: "#7aa2f7",
      background: "#1a1b26",
      foreground: "#a9b1d6",
      diffAdded: "#449dab",
      diffRemoved: "#ab777d",
      directive: "#9d7cd8",
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    light: {
      accent: "#006aff",
      background: "#ffffff",
      foreground: "#171717",
      diffAdded: "#20873a",
      diffRemoved: "#eb001d",
      directive: "#a100f8",
    },
    dark: {
      accent: "#006efe",
      background: "#000000",
      foreground: "#ededed",
      diffAdded: "#00ad3a",
      diffRemoved: "#f13342",
      directive: "#9f51d9",
    },
  },
  {
    id: "vscode-plus",
    name: "VS Code",
    light: {
      accent: "#007acc",
      background: "#ffffff",
      foreground: "#000000",
      diffAdded: "#008000",
      diffRemoved: "#ee0000",
      directive: "#0000ff",
    },
    dark: {
      accent: "#248dd3",
      background: "#1e1e1e",
      foreground: "#d4d4d4",
      diffAdded: "#3e983a",
      diffRemoved: "#f44747",
      directive: "#569cd6",
    },
  },
]

function mixSurface(
  background: string,
  variant: "light" | "dark",
  amount: number
) {
  const target = variant === "dark" ? 255 : 0
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(background.slice(offset, offset + 2), 16)
    return Math.round(channel * (1 - amount) + target * amount)
      .toString(16)
      .padStart(2, "0")
  })
  return `#${channels.join("")}`
}

function paletteWithSurfaces(
  palette: PaletteSeed,
  variant: "light" | "dark"
): ThemePresetColors {
  return {
    ...palette,
    sidebar:
      variant === "light"
        ? palette.background
        : mixSurface(palette.background, variant, 0.017),
    shell: mixSurface(
      palette.background,
      variant,
      variant === "light" ? 0.03 : 0.05
    ),
  }
}

export const SYNARA_THEME_PRESETS: readonly ThemePresetDef[] =
  SYNARA_THEME_SEEDS.map((preset) => ({
    ...preset,
    light: paletteWithSurfaces(preset.light, "light"),
    dark: paletteWithSurfaces(preset.dark, "dark"),
  }))
